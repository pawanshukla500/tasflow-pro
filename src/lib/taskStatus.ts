/** Normalize legacy in_review to pending_review for permission checks. */
export function isTaskInReview(status: string): boolean {
  return status === "pending_review" || status === "in_review";
}

export function normalizeTaskStatus(status: string): string {
  return status === "in_review" ? "pending_review" : status;
}
