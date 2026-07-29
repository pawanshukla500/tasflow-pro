/**
 * All dates/times in TaskFlow Pro use Indian Standard Time (IST, GMT+5:30),
 * regardless of the viewer's browser timezone. Edge functions use the same
 * Asia/Kolkata convention via `_shared/ist.ts`.
 */
export const IST_TIME_ZONE = "Asia/Kolkata";
export const IST_OFFSET = "+05:30";

/** Parse a value into a Date. Date-only YYYY-MM-DD is treated as noon IST. */
function toDate(date: string | number | Date): Date {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Date(`${date}T12:00:00${IST_OFFSET}`);
  }
  return new Date(date);
}

/** Today's date as YYYY-MM-DD in IST (en-CA locale formats as ISO). */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIME_ZONE }).format(now);
}

/** Calendar parts in IST. */
export function partsIST(now: Date = new Date()): {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
} {
  const map = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

/** Add calendar days to a YYYY-MM-DD (IST date-only) string. */
export function addDaysIST(yyyyMmDd: string, days: number): string {
  const base = toDate(yyyyMmDd);
  base.setTime(base.getTime() + days * 86_400_000);
  return todayIST(base);
}

/** Format a date (Date, ISO string, or YYYY-MM-DD) in IST. */
export function formatDateIST(
  date: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  return toDate(date).toLocaleDateString("en-IN", { timeZone: IST_TIME_ZONE, ...opts });
}

/** Format a timestamp's time-of-day in IST. */
export function formatTimeIST(
  date: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  return toDate(date).toLocaleTimeString("en-IN", { timeZone: IST_TIME_ZONE, ...opts });
}

/** Full date + time in IST, e.g. for audit logs. */
export function formatDateTimeIST(date: string | number | Date): string {
  return toDate(date).toLocaleString("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
