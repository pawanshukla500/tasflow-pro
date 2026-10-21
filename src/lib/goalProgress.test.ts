import { describe, expect, it } from "vitest";
import { goalDaysLeft, goalDeadlineLabel, goalPercent } from "./goalProgress";

describe("goal progress", () => {
  it("treats a date-only deadline as due today instead of already overdue", () => {
    expect(goalDaysLeft("2026-10-21", "2026-10-21")).toBe(0);
    expect(goalDeadlineLabel(0)).toBe("Due today");
  });

  it("counts whole days until and after the deadline", () => {
    expect(goalDaysLeft("2026-10-28T00:00:00Z", "2026-10-21")).toBe(7);
    expect(goalDaysLeft("2026-10-20", "2026-10-21")).toBe(-1);
    expect(goalDeadlineLabel(7)).toBe("7d remaining");
    expect(goalDeadlineLabel(-1)).toBe("1d overdue");
  });

  it("does not invent a percent when the target is zero", () => {
    expect(goalPercent(12, 0)).toBeNull();
    expect(goalPercent(40, 80)).toBe(50);
    expect(goalPercent(0, 10)).toBe(0);
  });
});
