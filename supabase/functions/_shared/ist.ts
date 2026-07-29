/**
 * Indian Standard Time helpers for Edge Functions (GMT+5:30 / Asia/Kolkata).
 * Prefer this over `Date.now() + 5.5h` so day boundaries stay correct.
 */
export const IST_TIME_ZONE = "Asia/Kolkata";

/** Today's calendar date YYYY-MM-DD in IST. */
export function istToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIME_ZONE }).format(now);
}

/** Add calendar days to a YYYY-MM-DD string (IST date-only). */
export function istAddDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00+05:30`);
  d.setTime(d.getTime() + days * 86_400_000);
  return istToday(d);
}

/** Day of week in IST (0 = Sunday … 6 = Saturday). */
export function istDayOfWeek(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIME_ZONE,
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[weekday] ?? now.getUTCDay();
}

/** Format a timestamp for display in IST. */
export function formatIstDateTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso)) + " IST"
  );
}
