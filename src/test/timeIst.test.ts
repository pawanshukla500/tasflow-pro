import { describe, it, expect } from "vitest";
import { addDaysIST, todayIST, formatDateIST, IST_TIME_ZONE, partsIST } from "@/lib/time";

describe("IST time helpers", () => {
  it("todayIST uses Asia/Kolkata", () => {
    const expected = new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIME_ZONE }).format(new Date());
    expect(todayIST()).toBe(expected);
  });

  it("addDaysIST moves calendar days on date-only strings", () => {
    expect(addDaysIST("2026-07-29", 1)).toBe("2026-07-30");
    expect(addDaysIST("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysIST("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("formatDateIST keeps date-only YYYY-MM-DD on the same IST calendar day", () => {
    const formatted = formatDateIST("2026-07-29", { day: "numeric", month: "short", year: "numeric" });
    expect(formatted).toMatch(/29/);
    expect(formatted).toMatch(/2026/);
  });

  it("partsIST returns coherent year/month/day", () => {
    const p = partsIST(new Date("2026-07-29T12:00:00+05:30"));
    expect(p.year).toBe(2026);
    expect(p.month).toBe(7);
    expect(p.day).toBe(29);
  });
});
