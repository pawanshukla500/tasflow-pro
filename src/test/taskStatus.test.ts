import { describe, it, expect } from "vitest";
import { isTaskInReview, normalizeTaskStatus } from "@/lib/taskStatus";

describe("taskStatus", () => {
  it("treats in_review as review state", () => {
    expect(isTaskInReview("pending_review")).toBe(true);
    expect(isTaskInReview("in_review")).toBe(true);
    expect(isTaskInReview("todo")).toBe(false);
  });

  it("normalizes legacy status", () => {
    expect(normalizeTaskStatus("in_review")).toBe("pending_review");
    expect(normalizeTaskStatus("todo")).toBe("todo");
  });
});
