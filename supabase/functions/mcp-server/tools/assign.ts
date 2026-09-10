/** If the caller omits assignees, the connected user is assigned. */
export function assigneeIdsForCaller(userId: string, assigneeIds: unknown): string[] {
  if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
    return [...new Set(assigneeIds.map(String).filter(Boolean))];
  }
  return [userId];
}

export function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export const CODING_STATUSES = ["todo", "in_progress", "in_review", "done", "blocked"] as const;
export type CodingStatus = (typeof CODING_STATUSES)[number];

export function normalizeCodingStatus(
  raw: unknown,
  fallback: CodingStatus = "in_progress",
): CodingStatus {
  const value = String(raw || "");
  return (CODING_STATUSES as readonly string[]).includes(value) ? (value as CodingStatus) : fallback;
}

/** Replace the write-up when given, then append a dated progress note the user can see. */
export function applyTaskWriteup(
  existing: string | null | undefined,
  replacement: string | null | undefined,
  progressNote: string | null | undefined,
  at: Date = new Date(),
): string | null {
  let body =
    replacement != null && replacement.trim() !== "" ? replacement.trim() : (existing ?? null);
  const note = progressNote?.trim();
  if (!note) return body;
  if (body?.includes(note)) return body;
  const stamp = at.toISOString().slice(0, 16).replace("T", " ");
  const line = `[${stamp} UTC] ${note}`;
  return body ? `${body.trimEnd()}\n\n${line}` : line;
}

export function taskDeepLink(taskId: string, appUrl = "https://task.youthnic.shop"): string {
  return `${appUrl.replace(/\/$/, "")}/my-tasks?task=${encodeURIComponent(taskId)}`;
}
