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
