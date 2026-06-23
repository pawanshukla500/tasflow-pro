import { describe, it, expect } from "vitest";
import { notificationActionToPath } from "@/lib/notificationNavigation";

describe("notificationActionToPath", () => {
  it("keeps relative paths unchanged", () => {
    expect(notificationActionToPath("/my-tasks?task=abc")).toBe("/my-tasks?task=abc");
  });

  it("strips origin from absolute URLs", () => {
    expect(
      notificationActionToPath("https://task.youthnic.shop/my-tasks?task=abc"),
    ).toBe("/my-tasks?task=abc");
  });

  it("handles workflow deep links", () => {
    expect(
      notificationActionToPath("https://task.youthnic.shop/workflows?wf=1&stage=2"),
    ).toBe("/workflows?wf=1&stage=2");
  });

  it("normalizes bare paths", () => {
    expect(notificationActionToPath("my-tasks")).toBe("/my-tasks");
  });
});
