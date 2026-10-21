import { describe, expect, it } from "vitest";
import { noteTimeLeft } from "@/lib/noteLifetime";

describe("quick note lifetime", () => {
  const now = new Date("2026-10-21T08:00:00Z");

  it("counts whole days until the note expires", () => {
    expect(noteTimeLeft("2026-10-28T08:00:00Z", now).label).toBe("7 days left");
    expect(noteTimeLeft("2026-10-22T09:00:00Z", now).label).toBe("2 days left");
  });

  it("switches to hours on the last day", () => {
    expect(noteTimeLeft("2026-10-21T12:30:00Z", now)).toEqual({
      expired: false,
      label: "5 hours left",
    });
  });

  it("marks a note expired once its time has passed", () => {
    expect(noteTimeLeft("2026-10-21T07:59:00Z", now).expired).toBe(true);
  });
});
