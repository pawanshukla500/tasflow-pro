import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquare, Paperclip, Reply, Send, Sparkles, SquarePen, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTaskDiscussion, type TaskDiscussionController } from "@/hooks/useTaskDiscussion";
import {
  DISCUSSION_FILE_ACCEPT,
  DISCUSSION_MAX_FILES,
  activityLabel,
  applyMention,
  canModifyComment,
  filterParticipants,
  formatFileSize,
  isActivityComment,
  safeHttpUrl,
  mentionQueryAt,
  segmentBody,
  validateDiscussionFile,
  type DiscussionComment,
  type DiscussionParticipant,
} from "@/lib/taskDiscussion";
import { assistTask } from "@/lib/taskAi";
import { formatDateIST, formatDateTimeIST, formatTimeIST } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string;
  currentUserId: string | null;
  currentUserName?: string | null;
  fallbackParticipants?: DiscussionParticipant[];
  taskTitle?: string;
  taskDescription?: string;
  /** Tests and the dev preview pass a controller so the panel can run without the network. */
  controller?: TaskDiscussionController;
}

const NAME_COLORS = [
  "text-teal-800 dark:text-teal-300",
  "text-amber-800 dark:text-amber-300",
  "text-violet-800 dark:text-violet-300",
  "text-rose-800 dark:text-rose-300",
  "text-sky-800 dark:text-sky-300",
  "text-emerald-800 dark:text-emerald-300",
];

function nameColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % NAME_COLORS.length;
  return NAME_COLORS[hash];
}

function dayKey(iso: string): string {
  return formatDateIST(iso, { day: "numeric", month: "short", year: "numeric" });
}

function dayLabel(iso: string): string {
  const key = dayKey(iso);
  return key === dayKey(new Date().toISOString()) ? "Today" : key;
}

function plainSnippet(body: string): string {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1").replace(/\s+/g, " ").trim();
}

function initials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function MessageBody({ body }: { body: string }) {
  return (
    <p className="text-sm text-foreground whitespace-pre-wrap break-words">
      {segmentBody(body).map((part, index) =>
        part.type === "mention" ? (
          <span key={`${part.userId}-${index}`} className="rounded bg-primary/10 px-1 font-medium text-primary">
            @{part.name}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

function AttachmentList({ comment, mine }: { comment: DiscussionComment; mine: boolean }) {
  if (comment.attachments.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {comment.attachments.map((file) => {
        const href = safeHttpUrl(file.fileUrl);
        const className = cn(
          "flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
          mine ? "bg-background/70" : "bg-muted/70",
        );
        const inner = (
          <>
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{file.fileName}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
          </>
        );
        return (
          <li key={file.id}>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className={`${className} hover:bg-muted/60`}>
                {inner}
              </a>
            ) : (
              <div className={className}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function TaskDiscussionView({
  controller,
  currentUserId,
  taskTitle,
  taskDescription,
}: {
  controller: TaskDiscussionController;
  currentUserId: string | null;
  taskTitle?: string;
  taskDescription?: string;
}) {
  const { comments, participants, loading, error, realtime, sending, mode, reload, send, edit, remove } = controller;
  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DiscussionComment | null>(null);
  const [editing, setEditing] = useState<DiscussionComment | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  const ordered = useMemo(
    () => [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    [comments],
  );
  const byId = useMemo(() => new Map(comments.map((comment) => [comment.id, comment])), [comments]);
  const mention = mentionQueryAt(draft, cursor);
  const mentionChoices = useMemo(
    () => (mention && mode === "full" && !editing ? filterParticipants(participants, mention.query) : []),
    [editing, mention, mode, participants],
  );
  const mentionOpen = Boolean(mention) && mode === "full" && !editing;

  useEffect(() => {
    setMentionIndex(0);
  }, [mention?.query, mentionOpen]);

  useEffect(() => {
    if (pendingCursor.current == null) return;
    const next = pendingCursor.current;
    pendingCursor.current = null;
    const field = inputRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(next, next);
  }, [draft]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [comments]);

  const focusInput = () => inputRef.current?.focus();

  const draftRef = useRef(draft);
  const draftRequest = useRef(0);
  const onDraftChange = (value: string, nextCursor: number) => {
    draftRef.current = value;
    setDraft(value);
    setCursor(nextCursor);
  };

  const chooseMention = (person: DiscussionParticipant) => {
    const next = applyMention(draft, cursor, person);
    pendingCursor.current = next.cursor;
    onDraftChange(next.text, next.cursor);
  };

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const next = [...files];
    for (const file of incoming) {
      if (next.length >= DISCUSSION_MAX_FILES) {
        setFileError("You can attach up to 8 files");
        break;
      }
      const problem = validateDiscussionFile(file);
      if (problem) {
        setFileError(problem);
        continue;
      }
      next.push(file);
      setFileError(null);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    try {
      if (editing) {
        await edit(editing.id, draft);
        setEditing(null);
        setDraft("");
        setReplyTo(null);
        stickRef.current = true;
        return;
      }
      if (!draft.trim() && files.length === 0) return;
      await send({ body: draft, parentId: replyTo?.id ?? null, files });
      setDraft("");
      setFiles([]);
      setFileError(null);
      setReplyTo(null);
      stickRef.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't send the message";
      if (/skipped|posted/i.test(message)) {
        setDraft("");
        setFiles([]);
        setReplyTo(null);
      }
      toast.error(message);
    }
  };

  const startReply = (comment: DiscussionComment) => {
    if (editing) {
      setDraft("");
      setCursor(0);
      setFiles([]);
      setFileError(null);
    }
    setEditing(null);
    setReplyTo(comment);
    focusInput();
  };

  const fillDraft = async () => {
    if (!taskTitle?.trim() && !taskDescription?.trim()) {
      toast.error("Add a title or description first");
      return;
    }
    const request = ++draftRequest.current;
    const started = draftRef.current;
    setDrafting(true);
    try {
      const result = await assistTask({
        action: "draft_update",
        title: taskTitle || "Task",
        description: taskDescription,
        comments: comments.slice(-8).map((comment) => comment.body),
      });
      if (request !== draftRequest.current || draftRef.current !== started) return;
      if (!result.message) throw new Error("AI returned an empty draft");
      setEditing(null);
      setReplyTo(null);
      onDraftChange(result.message, result.message.length);
      focusInput();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't draft an update");
    } finally {
      setDrafting(false);
    }
  };

  const startEdit = (comment: DiscussionComment) => {
    setReplyTo(null);
    setFiles([]);
    setEditing(comment);
    onDraftChange(comment.body, comment.body.length);
    focusInput();
  };

  const renderMessage = (comment: DiscussionComment) => {
    const mine = comment.userId === currentUserId;
    const activity = isActivityComment(comment.commentType);
    const modifiable = canModifyComment(comment, currentUserId) && mode === "full";
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined;

    if (activity) {
      return (
        <div key={comment.id} className="flex justify-center px-6">
          <div className="max-w-[92%] rounded-lg bg-card/90 px-3 py-1.5 text-center shadow-sm">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{comment.authorName}</span>{" "}
              {activityLabel(comment.commentType)}
              <time className="ml-1.5" dateTime={comment.createdAt} title={formatDateTimeIST(comment.createdAt)}>
                {formatTimeIST(comment.createdAt)}
              </time>
            </p>
            {comment.body && <div className="mt-0.5 text-left"><MessageBody body={comment.body} /></div>}
          </div>
        </div>
      );
    }

    return (
      <article key={comment.id} className={cn("flex gap-1.5", mine ? "justify-end" : "items-start justify-start")}>
        {!mine && (
          <Avatar className="mt-1 h-8 w-8 shrink-0">
            {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt="" />}
            <AvatarFallback className="text-[10px]">{initials(comment.authorName)}</AvatarFallback>
          </Avatar>
        )}
        <div className={cn("flex min-w-0 max-w-[85%] flex-col", mine ? "items-end" : "items-start")}>
          <div
            className={cn(
              "px-2.5 pb-1 pt-1.5 shadow-sm",
              mine
                ? "rounded-2xl rounded-br-md bg-primary/15"
                : "rounded-2xl rounded-bl-md bg-card",
            )}
          >
            {!mine && (
              <p className={cn("px-0.5 text-[13px] font-semibold leading-tight", nameColor(comment.authorName))}>
                {comment.authorName}
              </p>
            )}
            {parent && (
              <div className="mb-1 rounded-md border-l-4 border-primary/70 bg-foreground/5 px-2 py-1">
                <p className={cn("text-xs font-semibold", nameColor(parent.authorName))}>{parent.authorName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {plainSnippet(parent.body) || activityLabel(parent.commentType)}
                </p>
              </div>
            )}
            {comment.commentType === "note" && (
              <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Note</p>
            )}
            <MessageBody body={comment.body} />
            <AttachmentList comment={comment} mine={mine} />
            <p className="mt-0.5 flex items-center justify-end gap-1 px-0.5 text-[10px] text-muted-foreground">
              {comment.editedAt && <span>Edited</span>}
              <time dateTime={comment.createdAt} title={formatDateTimeIST(comment.createdAt)}>
                {formatTimeIST(comment.createdAt)}
              </time>
            </p>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-0.5">
            {mode === "full" && (
              <Button type="button" variant="ghost" size="sm" className="h-11 px-2 text-xs" disabled={drafting} onClick={() => startReply(comment)}>
                <Reply className="mr-1 h-3.5 w-3.5" aria-hidden />
                Reply
              </Button>
            )}
            {modifiable && (
              <Button type="button" variant="ghost" size="sm" className="h-11 px-2 text-xs" disabled={drafting} onClick={() => startEdit(comment)}>
                <SquarePen className="mr-1 h-3.5 w-3.5" aria-hidden />
                Edit
              </Button>
            )}
            {modifiable && confirmDeleteId !== comment.id && (
              <Button type="button" variant="ghost" size="sm" className="h-11 px-2 text-xs" onClick={() => setConfirmDeleteId(comment.id)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                Delete
              </Button>
            )}
            {modifiable && confirmDeleteId === comment.id && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 px-2 text-xs text-destructive"
                onClick={async () => {
                  try {
                    await remove(comment.id);
                    setConfirmDeleteId(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Couldn't delete the message");
                  }
                }}
              >
                Confirm delete
              </Button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-muted/20" aria-label="Task discussion">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
            Discussion
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {comments.length === 0 ? "No messages yet" : `${comments.length} ${comments.length === 1 ? "message" : "messages"}`}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", realtime ? "bg-success" : "bg-muted-foreground/50")} aria-hidden />
          {realtime ? "Live" : "Offline"}
        </span>
      </div>

      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-muted/40 px-2.5 py-3 [background-image:radial-gradient(hsl(var(--foreground)/0.05)_1px,transparent_1px)] [background-size:16px_16px]"
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
        }}
      >
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading conversation…
          </p>
        )}
        {!loading && error && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2 h-11" onClick={reload}>
              Try again
            </Button>
          </div>
        )}
        {!loading && !error && ordered.length === 0 && (
          <div className="flex flex-1 items-center justify-center px-4 py-8">
            <p className="max-w-[16rem] text-center text-sm leading-relaxed text-muted-foreground">
              No messages yet. Reply, mention a teammate, or attach a file. The thread stays on this task.
            </p>
          </div>
        )}
        {ordered.map((comment, index) => {
          const showDay = index === 0 || dayKey(comment.createdAt) !== dayKey(ordered[index - 1].createdAt);
          return (
            <div key={comment.id} className="space-y-2">
              {showDay && (
                <p className="mx-auto w-fit rounded-lg bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                  {dayLabel(comment.createdAt)}
                </p>
              )}
              {renderMessage(comment)}
            </div>
          );
        })}
      </div>

      {mode === "legacy" && (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Replies, live updates, and file sharing turn on after the discussion database update is applied. You can still post a message.
        </p>
      )}

      <form
        className="space-y-2 border-t bg-card p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {(replyTo || editing) && (
          <div className="flex items-stretch gap-2 rounded-lg border-l-4 border-primary bg-muted/60 px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-foreground">
                {editing ? "Editing your message" : `Replying to ${replyTo?.authorName}`}
              </span>
              {!editing && replyTo && (
                <span className="block truncate text-muted-foreground">{plainSnippet(replyTo.body) || "Message"}</span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 px-2"
              onClick={() => {
                setReplyTo(null);
                setEditing(null);
                setDraft("");
                setFiles([]);
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {mentionOpen && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Mention a teammate"
            className="max-h-40 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
          >
            {mentionChoices.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">No one on this task matches.</li>
            ) : (
              mentionChoices.map((person, index) => (
                <li key={person.id}>
                  <button
                    type="button"
                    id={person.id}
                    role="option"
                    aria-selected={index === mentionIndex}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-sm px-2 text-left text-sm",
                      index === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseMention(person);
                    }}
                  >
                    {person.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs">
                <span className="max-w-[10rem] truncate">{file.name}</span>
                <button
                  type="button"
                  className="inline-flex h-11 w-8 items-center justify-center"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, item) => item !== index))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileError && <p role="alert" className="text-xs text-destructive">{fileError}</p>}

        {taskTitle !== undefined && !editing && (
          <div className="space-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11"
              disabled={drafting || sending || !currentUserId}
              onClick={() => void fillDraft()}
            >
              {drafting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              Draft update
            </Button>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Muse Spark may use this text to improve Meta models.
            </p>
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-[1.6rem] border bg-card px-1.5 py-1">
          {mode === "full" && !editing && (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label="Attach files"
                onClick={() => fileRef.current?.click()}
                disabled={drafting || sending}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={DISCUSSION_FILE_ACCEPT}
                className="hidden"
                onChange={(event) => addFiles(event.target.files)}
              />
            </>
          )}
          <Textarea
            ref={inputRef}
            id={inputId}
            value={draft}
            rows={2}
            placeholder={mode === "full" ? "Message the people on this task. Use @ to mention." : "Write a message"}
            aria-label="Message"
            aria-expanded={mentionOpen}
            aria-controls={mentionOpen ? listId : undefined}
            aria-activedescendant={mentionOpen && mentionChoices[mentionIndex] ? mentionChoices[mentionIndex].id : undefined}
            className="min-h-11 flex-1 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            disabled={drafting || sending || !currentUserId}
            onChange={(event) => onDraftChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
            onSelect={(event) => setCursor(event.currentTarget.selectionStart ?? draft.length)}
            onKeyDown={(event) => {
              if (mentionOpen && mentionChoices.length > 0 && event.key === "ArrowDown") {
                event.preventDefault();
                setMentionIndex((index) => (index + 1) % mentionChoices.length);
                return;
              }
              if (mentionOpen && mentionChoices.length > 0 && event.key === "ArrowUp") {
                event.preventDefault();
                setMentionIndex((index) => (index - 1 + mentionChoices.length) % mentionChoices.length);
                return;
              }
              if (mentionOpen && event.key === "Escape") {
                event.preventDefault();
                const at = mention?.start ?? cursor;
                const next = draft.slice(0, at) + draft.slice(cursor);
                onDraftChange(next, at);
                return;
              }
              if (mentionOpen && mentionChoices.length > 0 && event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                chooseMention(mentionChoices[mentionIndex] || mentionChoices[0]);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={drafting || sending || !currentUserId || (!draft.trim() && files.length === 0 && !editing)}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">{editing ? "Save message" : "Send message"}</span>
          </Button>
        </div>
      </form>
    </section>
  );
}

function TaskDiscussionLive(props: Omit<Props, "controller">) {
  const controller = useTaskDiscussion(
    props.taskId,
    props.currentUserId,
    props.currentUserName ?? null,
    props.fallbackParticipants ?? [],
  );
  return (
    <TaskDiscussionView
      controller={controller}
      currentUserId={props.currentUserId}
      taskTitle={props.taskTitle}
      taskDescription={props.taskDescription}
    />
  );
}

const TaskDiscussion = (props: Props) => {
  if (props.controller) {
    return (
      <TaskDiscussionView
        controller={props.controller}
        currentUserId={props.currentUserId}
        taskTitle={props.taskTitle}
        taskDescription={props.taskDescription}
      />
    );
  }
  return <TaskDiscussionLive {...props} />;
};

export default TaskDiscussion;
