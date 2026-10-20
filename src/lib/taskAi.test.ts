import { describe, expect, it } from "vitest";
import { clampDraft, clampSubtasks } from "@/lib/taskAi";

describe("task AI results", () => {
  it("keeps at most eight unique subtasks", () => {
    const titles = clampSubtasks([
      "  Map the price fields  ",
      "Map the price fields",
      "",
      "Write the ranking rules",
      12,
      "x".repeat(200),
    ]);
    expect(titles).toEqual([
      "Map the price fields",
      "Write the ranking rules",
      "x".repeat(120),
    ]);
  });

  it("trims a drafted update", () => {
    expect(clampDraft("  Checking the logic.  ")).toBe("Checking the logic.");
    expect(clampDraft("a".repeat(800))).toHaveLength(500);
    expect(clampDraft(null)).toBe("");
  });
});
