import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquare, Paperclip, Reply, Send, SquarePen, Trash2, X } from "lucide-react";
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
  threadComments,
  validateDiscussionFile,
  type DiscussionComment,
  type DiscussionParticipant,
} from "@/lib/taskDiscussion";
import { formatDateIST, formatDateTimeIST, formatTimeIST } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string;
  currentUserId: string | null;
  currentUserName?: string | null;
  fallbackParticipants?: DiscussionParticipant[];
  /** Tests and the dev preview pass a controller so the panel can run without the network. */
  controller?: TaskDiscussionController;
}

function stamp(iso: string): string {
  const fullDay = { day: "numeric" as const, month: "short" as const, year: "numeric" as const };
  const day = formatDateIST(iso, fullDay);
  const today = formatDateIST(new Date(), fullDay);
  const time = formatTimeIST(iso);
  return day === today ? time : `${formatDateIST(iso, { day: "numeric", month: "short" })}, ${time}`;
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

function AttachmentList({ comment }: { comment: DiscussionComment }) {
  if (comment.attachments.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {comment.attachments.map((file) => {
        const href = safeHttpUrl(file.fileUrl);
        const className = "flex items-center gap-2 rounded-md border bg-background/80 px-2.5 py-1.5 text-sm";
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
}: {
  controller: TaskDiscussionController;
  currentUserId: string | null;
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
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  const thread = useMemo(() => threadComments(comments), [comments]);
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

  const onDraftChange = (value: string, nextCursor: number) => {
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

  const startEdit = (comment: DiscussionComment) => {
    setReplyTo(null);
    setFiles([]);
    setEditing(comment);
    onDraftChange(comment.body, comment.body.length);
    focusInput();
  };

  const renderMessage = (comment: DiscussionComment, nested = false) => {
    const mine = comment.userId === currentUserId;
    const activity = isActivityComment(comment.commentType);
    const modifiable = canModifyComment(comment, currentUserId) && mode === "full";

    if (activity) {
      return (
        <div key={comment.id} className="rounded-md bg-muted/40 px-2.5 py-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{comment.authorName}</span>{" "}
            {activityLabel(comment.commentType)}
            <time className="ml-2" dateTime={comment.createdAt} title={formatDateTimeIST(comment.createdAt)}>
              {stamp(comment.createdAt)}
            </time>
          </p>
          {comment.body && <div className="mt-1"><MessageBody body={comment.body} /></div>}
        </div>
      );
    }

    return (
      <article key={comment.id} className={cn("flex gap-2.5", nested && "mt-2")}>
        <Avatar className="h-8 w-8">
          {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt="" />}
          <AvatarFallback className="text-[10px]">{initials(comment.authorName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">{mine ? `${comment.authorName} (you)` : comment.authorName}</span>
            {comment.commentType === "note" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Note</span>
            )}
            {comment.editedAt && <span className="text-[10px] text-muted-foreground">Edited</span>}
            <time
              className="ml-auto text-[11px] text-muted-foreground"
              dateTime={comment.createdAt}
              title={formatDateTimeIST(comment.createdAt)}
            >
              {stamp(comment.createdAt)}
            </time>
          </div>
          <MessageBody body={comment.body} />
          <AttachmentList comment={comment} />
          <div className="mt-1 flex flex-wrap gap-1">
            {mode === "full" && !nested && (
              <Button type="button" variant="ghost" size="sm" className="h-11 px-2 text-xs" onClick={() => startReply(comment)}>
                <Reply className="mr-1 h-3.5 w-3.5" aria-hidden />
                Reply
              </Button>
            )}
            {modifiable && (
              <Button type="button" variant="ghost" size="sm" className="h-11 px-2 text-xs" onClick={() => startEdit(comment)}>
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
    <section className="flex h-full min-h-0 flex-col bg-card" aria-label="Task discussion">
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
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
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
        {!loading && !error && thread.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Start the conversation. Replies, @mentions, and files stay on this task.
          </p>
        )}
        {thread.map((item) => (
          <div key={item.comment.id} className="space-y-1">
            {renderMessage(item.comment)}
            {item.replies.length > 0 && (
              <div className="ml-6 space-y-2 border-l pl-3">
                {item.replies.map((reply) => renderMessage(reply, true))}
              </div>
            )}
          </div>
        ))}
      </div>

      {mode === "legacy" && (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Replies, live updates, and file sharing turn on after the discussion database update is applied. You can still post a message.
        </p>
      )}

      <form
        className="space-y-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {(replyTo || editing) && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
            <span className="truncate">
              {editing ? "Editing your message" : `Replying to ${replyTo?.authorName}`}
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

        <div className="flex items-end gap-2">
          {mode === "full" && !editing && (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label="Attach files"
                onClick={() => fileRef.current?.click()}
                disabled={sending}
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
            className="min-h-11 flex-1 resize-none"
            disabled={sending || !currentUserId}
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
          <Button type="submit" className="h-11 shrink-0" disabled={sending || !currentUserId || (!draft.trim() && files.length === 0 && !editing)}>
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
  return <TaskDiscussionView controller={controller} currentUserId={props.currentUserId} />;
}

const TaskDiscussion = (props: Props) => {
  if (props.controller) {
    return <TaskDiscussionView controller={props.controller} currentUserId={props.currentUserId} />;
  }
  return <TaskDiscussionLive {...props} />;
};

export default TaskDiscussion;
