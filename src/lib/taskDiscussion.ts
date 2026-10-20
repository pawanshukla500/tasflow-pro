/** Pure helpers for the task discussion thread. No network. */

export const DISCUSSION_BODY_MAX = 4000;
export const DISCUSSION_MAX_FILES = 8;
export const DISCUSSION_MAX_BYTES = 10 * 1024 * 1024;

/** Matches supabase/functions/firebase-upload allowlist. */
export const DISCUSSION_ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const DISCUSSION_FILE_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx";

const MENTION_SOURCE =
  "@\\[([^\\]\\n]{1,80})\\]\\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\\)";

export const ACTIVITY_COMMENT_TYPES = new Set([
  "review_submit",
  "review_approve",
  "review_reject",
  "due_date_extended",
]);

export interface DiscussionAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface DiscussionComment {
  id: string;
  taskId: string;
  userId: string;
  body: string;
  commentType: string;
  parentId: string | null;
  editedAt: string | null;
  createdAt: string;
  authorName: string;
  authorAvatar: string | null;
  attachments: DiscussionAttachment[];
}

export interface DiscussionParticipant {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ThreadItem {
  comment: DiscussionComment;
  replies: DiscussionComment[];
}

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; userId: string };

export interface CommentRow {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  comment_type: string;
  parent_id?: string | null;
  edited_at?: string | null;
  created_at: string;
}

export function isActivityComment(commentType: string): boolean {
  return ACTIVITY_COMMENT_TYPES.has(commentType);
}

export function canModifyComment(comment: Pick<DiscussionComment, "userId" | "commentType">, userId: string | null): boolean {
  if (!userId || comment.userId !== userId) return false;
  return comment.commentType === "message" || comment.commentType === "note";
}

export function mentionIdsIn(body: string): string[] {
  const ids: string[] = [];
  const re = new RegExp(MENTION_SOURCE, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const id = match[2].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function segmentBody(body: string): BodySegment[] {
  const re = new RegExp(MENTION_SOURCE, "g");
  const parts: BodySegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    if (match.index > last) parts.push({ type: "text", text: body.slice(last, match.index) });
    parts.push({ type: "mention", name: match[1], userId: match[2].toLowerCase() });
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  if (parts.length === 0) parts.push({ type: "text", text: body });
  return parts;
}

/** The @query being typed immediately before the cursor, if any. */
export function mentionQueryAt(text: string, cursor: number): { start: number; query: string } | null {
  const upto = text.slice(0, Math.max(0, cursor));
  const match = /(^|\s)@([^\s@[\]()]{0,40})$/.exec(upto);
  if (!match) return null;
  const query = match[2];
  return { start: cursor - query.length - 1, query };
}

export function mentionToken(person: Pick<DiscussionParticipant, "id" | "name">): string {
  const name = person.name.replace(/[[\]]/g, "").trim() || "Teammate";
  return `@[${name}](${person.id})`;
}

export function applyMention(
  text: string,
  cursor: number,
  person: Pick<DiscussionParticipant, "id" | "name">,
): { text: string; cursor: number } {
  const found = mentionQueryAt(text, cursor);
  if (!found) {
    const token = `${mentionToken(person)} `;
    const next = text.slice(0, cursor) + token + text.slice(cursor);
    return { text: next, cursor: cursor + token.length };
  }
  const token = `${mentionToken(person)} `;
  const next = text.slice(0, found.start) + token + text.slice(cursor);
  return { text: next, cursor: found.start + token.length };
}

export function filterParticipants(people: DiscussionParticipant[], query: string): DiscussionParticipant[] {
  const q = query.trim().toLowerCase();
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return sorted.slice(0, 8);
  return sorted.filter((person) => person.name.toLowerCase().includes(q)).slice(0, 8);
}

export function threadComments(comments: DiscussionComment[]): ThreadItem[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const replies = new Map<string, DiscussionComment[]>();
  const tops: DiscussionComment[] = [];
  const sorted = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  for (const comment of sorted) {
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined;
    if (parent && !parent.parentId) {
      const list = replies.get(parent.id) || [];
      list.push(comment);
      replies.set(parent.id, list);
    } else {
      tops.push(comment);
    }
  }

  return tops.map((comment) => ({
    comment,
    replies: replies.get(comment.id) || [],
  }));
}

export function upsertComment(list: DiscussionComment[], next: DiscussionComment): DiscussionComment[] {
  const index = list.findIndex((comment) => comment.id === next.id);
  if (index === -1) {
    return [...list, next].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  const copy = list.slice();
  const previous = copy[index];
  copy[index] = {
    ...previous,
    ...next,
    attachments: next.attachments.length > 0 ? next.attachments : previous.attachments,
    authorName: next.authorName && next.authorName !== "Teammate" ? next.authorName : previous.authorName,
    authorAvatar: next.authorAvatar ?? previous.authorAvatar,
  };
  return copy;
}

export function removeComment(list: DiscussionComment[], id: string): DiscussionComment[] {
  return list.filter((comment) => comment.id !== id && comment.parentId !== id);
}

export function upsertAttachment(list: DiscussionComment[], commentId: string, attachment: DiscussionAttachment): DiscussionComment[] {
  return list.map((comment) => {
    if (comment.id !== commentId) return comment;
    if (comment.attachments.some((item) => item.id === attachment.id)) return comment;
    return { ...comment, attachments: [...comment.attachments, attachment] };
  });
}

export function removeAttachment(list: DiscussionComment[], attachmentId: string): DiscussionComment[] {
  return list.map((comment) => ({
    ...comment,
    attachments: comment.attachments.filter((item) => item.id !== attachmentId),
  }));
}

export function mapCommentRow(
  row: CommentRow,
  authors: ReadonlyMap<string, { name: string; avatarUrl: string | null }>,
  attachments: DiscussionAttachment[] = [],
): DiscussionComment {
  const author = authors.get(row.user_id);
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    body: row.body,
    commentType: row.comment_type,
    parentId: row.parent_id ?? null,
    editedAt: row.edited_at ?? null,
    createdAt: row.created_at,
    authorName: author?.name || "Teammate",
    authorAvatar: author?.avatarUrl ?? null,
    attachments,
  };
}

export function validateDiscussionFile(file: Pick<File, "name" | "size" | "type">): string | null {
  if (file.size > DISCUSSION_MAX_BYTES) return `${file.name} is larger than 10 MB`;
  if (!DISCUSSION_ALLOWED_TYPES.has(file.type)) return `${file.name} isn't a supported file type`;
  return null;
}

export function activityLabel(commentType: string): string {
  switch (commentType) {
    case "review_submit":
      return "submitted this task for review";
    case "review_approve":
      return "approved this task";
    case "review_reject":
      return "sent this task back";
    case "due_date_extended":
      return "extended the due date";
    default:
      return "updated this task";
  }
}

export function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
  } catch {
    return null;
  }
  return null;
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function dedupeParticipants(people: DiscussionParticipant[]): DiscussionParticipant[] {
  const seen = new Set<string>();
  const next: DiscussionParticipant[] = [];
  for (const person of people) {
    if (!person.id || seen.has(person.id)) continue;
    seen.add(person.id);
    next.push(person);
  }
  return next;
}
