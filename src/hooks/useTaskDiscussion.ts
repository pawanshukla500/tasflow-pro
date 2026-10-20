import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isUnknownColumnError } from "@/lib/projectBudget";
import {
  DISCUSSION_BODY_MAX,
  DISCUSSION_MAX_FILES,
  type CommentRow,
  type DiscussionAttachment,
  type DiscussionComment,
  type DiscussionParticipant,
  dedupeParticipants,
  mapCommentRow,
  mentionIdsIn,
  removeAttachment,
  removeComment,
  upsertAttachment,
  upsertComment,
  validateDiscussionFile,
} from "@/lib/taskDiscussion";

export interface DiscussionSendInput {
  body: string;
  parentId: string | null;
  files: File[];
}

export interface TaskDiscussionController {
  comments: DiscussionComment[];
  participants: DiscussionParticipant[];
  loading: boolean;
  error: string | null;
  realtime: boolean;
  sending: boolean;
  mode: "full" | "legacy";
  reload: () => void;
  send: (input: DiscussionSendInput) => Promise<void>;
  edit: (id: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const FULL_SELECT = "id, task_id, user_id, body, comment_type, parent_id, edited_at, created_at";
const LEGACY_SELECT = "id, task_id, user_id, body, comment_type, created_at";

function missingSchema(message: string | undefined): boolean {
  return isUnknownColumnError(message) || /PGRST205|task_comment_mentions|could not find the function/i.test(message || "");
}

async function loadAuthors(ids: string[]): Promise<Map<string, { name: string; avatarUrl: string | null }>> {
  const map = new Map<string, { name: string; avatarUrl: string | null }>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, name, avatar_url").in("id", unique);
  for (const row of data || []) {
    map.set(row.id, { name: row.name, avatarUrl: row.avatar_url });
  }
  return map;
}

async function uploadDiscussionFile(file: File): Promise<{ url: string; path: string }> {
  const problem = validateDiscussionFile(file);
  if (problem) throw new Error(problem);
  const form = new FormData();
  form.append("file", file);
  form.append("folder", "task-comments");
  const { data, error } = await supabase.functions.invoke("firebase-upload", { body: form });
  if (error) throw new Error(error.message || "Upload failed");
  const payload = (data || {}) as { url?: string; path?: string; error?: string };
  if (!payload.url) throw new Error(payload.error || "Upload failed");
  return { url: payload.url, path: payload.path || "" };
}

export function useTaskDiscussion(
  taskId: string,
  currentUserId: string | null,
  currentUserName: string | null,
  fallbackParticipants: DiscussionParticipant[],
): TaskDiscussionController {
  const [comments, setComments] = useState<DiscussionComment[]>([]);
  const [participants, setParticipants] = useState<DiscussionParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState(false);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"full" | "legacy">("full");
  const [reloadKey, setReloadKey] = useState(0);
  const authorsRef = useRef(new Map<string, { name: string; avatarUrl: string | null }>());
  const fallbackRef = useRef(fallbackParticipants);
  fallbackRef.current = fallbackParticipants;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  const rememberAuthors = useCallback((map: Map<string, { name: string; avatarUrl: string | null }>) => {
    map.forEach((value, key) => authorsRef.current.set(key, value));
  }, []);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const full = await supabase
        .from("task_comments")
        .select(FULL_SELECT)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      let nextMode: "full" | "legacy" = "full";
      let rows: CommentRow[] = [];
      if (full.error && missingSchema(full.error.message)) {
        const legacy = await supabase
          .from("task_comments")
          .select(LEGACY_SELECT)
          .eq("task_id", taskId)
          .order("created_at", { ascending: true });
        if (legacy.error) throw new Error(legacy.error.message);
        nextMode = "legacy";
        rows = (legacy.data || []) as CommentRow[];
      } else if (full.error) {
        throw new Error(full.error.message);
      } else {
        rows = (full.data || []) as CommentRow[];
      }

      const authors = await loadAuthors(rows.map((row) => row.user_id));
      if (currentUserId && currentUserName) {
        authors.set(currentUserId, {
          name: currentUserName,
          avatarUrl: authors.get(currentUserId)?.avatarUrl ?? null,
        });
      }
      const attachments = new Map<string, DiscussionAttachment[]>();
      if (nextMode === "full") {
        const files = await supabase
          .from("task_attachments")
          .select("id, comment_id, file_name, file_url, mime_type, size_bytes")
          .eq("task_id", taskId)
          .not("comment_id", "is", null);
        if (!files.error) {
          for (const file of files.data || []) {
            if (!file.comment_id) continue;
            const list = attachments.get(file.comment_id) || [];
            list.push({
              id: file.id,
              fileName: file.file_name,
              fileUrl: file.file_url,
              mimeType: file.mime_type,
              sizeBytes: file.size_bytes,
            });
            attachments.set(file.comment_id, list);
          }
        }
      }

      let people: DiscussionParticipant[] | null = null;
      if (nextMode === "full") {
        const listed = await supabase.rpc("list_task_discussion_participants", { _task_id: taskId });
        if (!listed.error && listed.data) {
          people = listed.data.map((person) => ({
            id: person.id,
            name: person.name,
            avatarUrl: person.avatar_url,
          }));
        }
      }

      if (cancelled) return;
      rememberAuthors(authors);
      modeRef.current = nextMode;
      setMode(nextMode);
      setComments(rows.map((row) => mapCommentRow(row, authors, attachments.get(row.id) || [])));
      const source = people ?? fallbackRef.current;
      setParticipants(dedupeParticipants(source).filter((person) => person.id !== currentUserId));
      setLoading(false);
    })().catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "Couldn't load the discussion");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [taskId, currentUserId, currentUserName, reloadKey, rememberAuthors]);

  useEffect(() => {
    const channel = supabase
      .channel(`task-discussion:${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setComments((prev) => removeComment(prev, id));
            return;
          }
          const row = payload.new as CommentRow;
          if (!row?.id) return;
          const author = authorsRef.current.get(row.user_id);
          setComments((prev) => upsertComment(prev, mapCommentRow(row, authorsRef.current)));
          if (!author) {
            void loadAuthors([row.user_id]).then((map) => {
              rememberAuthors(map);
              const loaded = map.get(row.user_id);
              if (!loaded) return;
              setComments((prev) =>
                prev.map((comment) =>
                  comment.userId === row.user_id
                    ? { ...comment, authorName: loaded.name, authorAvatar: loaded.avatarUrl }
                    : comment,
                ),
              );
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_attachments", filter: `task_id=eq.${taskId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setComments((prev) => removeAttachment(prev, id));
            return;
          }
          const row = payload.new as {
            id?: string;
            comment_id?: string | null;
            file_name?: string;
            file_url?: string;
            mime_type?: string | null;
            size_bytes?: number | null;
          };
          if (!row.id || !row.comment_id || !row.file_url || !row.file_name) return;
          setComments((prev) =>
            upsertAttachment(prev, row.comment_id as string, {
              id: row.id as string,
              fileName: row.file_name as string,
              fileUrl: row.file_url as string,
              mimeType: row.mime_type ?? null,
              sizeBytes: row.size_bytes ?? null,
            }),
          );
        },
      )
      .subscribe((status) => {
        setRealtime(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, rememberAuthors]);

  const syncMentions = useCallback(
    async (commentId: string, body: string) => {
      if (modeRef.current !== "full") return;
      const allowed = new Set(participantsRef.current.map((person) => person.id));
      const wanted = mentionIdsIn(body).filter((id) => allowed.has(id));
      const skipped = mentionIdsIn(body).filter((id) => !allowed.has(id));
      const existing = await supabase
        .from("task_comment_mentions")
        .select("mentioned_user_id")
        .eq("comment_id", commentId);
      if (existing.error) {
        if (missingSchema(existing.error.message)) return;
        throw new Error(existing.error.message);
      }
      const have = new Set((existing.data || []).map((row) => row.mentioned_user_id));
      const toAdd = wanted.filter((id) => !have.has(id));
      const toRemove = [...have].filter((id) => !wanted.includes(id));
      if (toRemove.length > 0) {
        const removed = await supabase
          .from("task_comment_mentions")
          .delete()
          .eq("comment_id", commentId)
          .in("mentioned_user_id", toRemove);
        if (removed.error) throw new Error(removed.error.message);
      }
      if (toAdd.length > 0) {
        const inserted = await supabase.from("task_comment_mentions").insert(
          toAdd.map((mentionedUserId) => ({
            comment_id: commentId,
            task_id: taskId,
            mentioned_user_id: mentionedUserId,
          })),
        );
        if (inserted.error) throw new Error(inserted.error.message);
      }
      if (skipped.length > 0) {
        throw new Error("Some mentions were skipped because those people can't see this task");
      }
    },
    [taskId],
  );

  const send = useCallback(
    async (input: DiscussionSendInput) => {
      if (!currentUserId) throw new Error("Sign in to join the discussion");
      const body = input.body.trim();
      if (!body && input.files.length === 0) return;
      if (body.length > DISCUSSION_BODY_MAX) throw new Error("Message is too long (max 4000 characters)");
      if (input.files.length > DISCUSSION_MAX_FILES) throw new Error("You can attach up to 8 files");
      for (const file of input.files) {
        const problem = validateDiscussionFile(file);
        if (problem) throw new Error(problem);
      }

      setSending(true);
      try {
        const parentId = modeRef.current === "full" ? input.parentId : null;
        let inserted = await supabase
          .from("task_comments")
          .insert({
            task_id: taskId,
            user_id: currentUserId,
            body,
            comment_type: "message",
            parent_id: parentId,
          })
          .select(FULL_SELECT)
          .single();

        if (inserted.error && missingSchema(inserted.error.message)) {
          modeRef.current = "legacy";
          setMode("legacy");
          inserted = await supabase
            .from("task_comments")
            .insert({
              task_id: taskId,
              user_id: currentUserId,
              body,
              comment_type: "message",
            })
            .select(LEGACY_SELECT)
            .single();
          setMode("legacy");
        }
        if (inserted.error || !inserted.data) {
          throw new Error(inserted.error?.message || "Couldn't send the message");
        }

        const row = inserted.data as CommentRow;
        if (currentUserName) {
          authorsRef.current.set(currentUserId, {
            name: currentUserName,
            avatarUrl: authorsRef.current.get(currentUserId)?.avatarUrl ?? null,
          });
        }
        setComments((prev) => upsertComment(prev, mapCommentRow(row, authorsRef.current)));

        let warning: string | null = null;
        try {
          await syncMentions(row.id, body);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Mentions could not be saved";
          if (/skipped/i.test(message)) warning = message;
          else if (!missingSchema(message)) warning = "Message posted, but mentions could not be saved";
        }

        if (modeRef.current === "full") {
          for (const file of input.files) {
            try {
              const uploaded = await uploadDiscussionFile(file);
              const saved = await supabase
                .from("task_attachments")
                .insert({
                  task_id: taskId,
                  comment_id: row.id,
                  uploaded_by: currentUserId,
                  file_name: file.name,
                  file_url: uploaded.url,
                  file_path: uploaded.path,
                  mime_type: file.type || null,
                  size_bytes: file.size,
                })
                .select("id, comment_id, file_name, file_url, mime_type, size_bytes")
                .single();
              if (saved.error || !saved.data) {
                throw new Error(saved.error?.message || `${file.name} could not be attached`);
              }
              setComments((prev) =>
                upsertAttachment(prev, row.id, {
                  id: saved.data.id,
                  fileName: saved.data.file_name,
                  fileUrl: saved.data.file_url,
                  mimeType: saved.data.mime_type,
                  sizeBytes: saved.data.size_bytes,
                }),
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : `${file.name} could not be attached`;
              warning = /posted/i.test(message) ? message : `Message posted, but ${message}`;
              break;
            }
          }
        } else if (input.files.length > 0) {
          warning = "Message posted. File sharing needs the discussion database update.";
        }
        if (warning) throw new Error(warning);
      } finally {
        setSending(false);
      }
    },
    [currentUserId, currentUserName, syncMentions, taskId],
  );

  const edit = useCallback(
    async (id: string, body: string) => {
      if (!currentUserId) throw new Error("Sign in to edit a message");
      const text = body.trim();
      if (!text) throw new Error("Message can't be empty");
      if (text.length > DISCUSSION_BODY_MAX) throw new Error("Message is too long (max 4000 characters)");
      setSending(true);
      try {
        const updated = await supabase
          .from("task_comments")
          .update({ body: text })
          .eq("id", id)
          .eq("user_id", currentUserId)
          .select(FULL_SELECT)
          .maybeSingle();
        if (updated.error && missingSchema(updated.error.message)) {
          const legacy = await supabase
            .from("task_comments")
            .update({ body: text })
            .eq("id", id)
            .eq("user_id", currentUserId)
            .select(LEGACY_SELECT)
            .maybeSingle();
          if (legacy.error || !legacy.data) throw new Error(legacy.error?.message || "Couldn't edit the message");
          setComments((prev) => upsertComment(prev, mapCommentRow(legacy.data as CommentRow, authorsRef.current)));
          return;
        }
        if (updated.error) throw new Error(updated.error.message);
        if (!updated.data) throw new Error("You can't edit this message");
        setComments((prev) => upsertComment(prev, mapCommentRow(updated.data as CommentRow, authorsRef.current)));
        await syncMentions(id, text);
      } finally {
        setSending(false);
      }
    },
    [currentUserId, syncMentions],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!currentUserId) throw new Error("Sign in to delete a message");
      const removed = await supabase
        .from("task_comments")
        .delete({ count: "exact" })
        .eq("id", id)
        .eq("user_id", currentUserId);
      if (removed.error) throw new Error(removed.error.message);
      if (!removed.count) throw new Error("You can't delete this message");
      setComments((prev) => removeComment(prev, id));
    },
    [currentUserId],
  );

  return {
    comments,
    participants,
    loading,
    error,
    realtime,
    sending,
    mode,
    reload,
    send,
    edit,
    remove,
  };
}
