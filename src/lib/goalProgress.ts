/** Calendar days from an IST date (`YYYY-MM-DD`) until a goal deadline. Due today is 0. */
export function goalDaysLeft(deadline: string | null | undefined, today: string): number | null {
  if (!deadline) return null;
  const day = deadline.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const [todayYear, todayMonth, todayDate] = today.split("-").map(Number);
  const due = Date.UTC(year, month - 1, date);
  const start = Date.UTC(todayYear, todayMonth - 1, todayDate);
  return Math.round((due - start) / 86_400_000);
}

/** Null when the goal has no positive target, so the bar does not invent a percent. */
export function goalPercent(current: number, target: number): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  if (!Number.isFinite(current) || current <= 0) return 0;
  return Math.round((current / target) * 100);
}

export function goalDeadlineLabel(days: number | null): string {
  if (days === null) return "No deadline";
  if (days === 0) return "Due today";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `${days}d remaining`;
}
