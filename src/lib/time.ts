/**
 * All dates/times in TaskFlow Pro use Indian Standard Time (IST, GMT+5:30),
 * regardless of the viewer's browser timezone. Edge functions apply the same
 * +5.5h convention server-side.
 */
export const IST_TIME_ZONE = "Asia/Kolkata";

/** Today's date as YYYY-MM-DD in IST (en-CA locale formats as ISO). */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIME_ZONE }).format(new Date());
}

/** Format a date (Date, ISO string, or YYYY-MM-DD) in IST. */
export function formatDateIST(
  date: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  return new Date(date).toLocaleDateString("en-IN", { timeZone: IST_TIME_ZONE, ...opts });
}

/** Format a timestamp's time-of-day in IST. */
export function formatTimeIST(
  date: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  return new Date(date).toLocaleTimeString("en-IN", { timeZone: IST_TIME_ZONE, ...opts });
}

/** Full date + time in IST, e.g. for audit logs. */
export function formatDateTimeIST(date: string | number | Date): string {
  return new Date(date).toLocaleString("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
