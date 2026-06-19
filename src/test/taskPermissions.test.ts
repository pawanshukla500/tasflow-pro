import { describe, it, expect } from "vitest";
import {
  allowedStatusesForUser,
  canApproveOrRejectReview,
  canDeleteTask,
  canEditTaskMetadata,
  canExtendTaskDueDate,
  canReviewTask,
  canSubmitForReview,
  isTaskAssignee,
  maxTaskDueDateExtension,
  minTaskDueDateExtension,
} from "@/lib/taskPermissions";
import type { TaskRow } from "@/hooks/useTasks";

function task(overrides: Partial<TaskRow> & Pick<TaskRow, "id" | "title">): TaskRow {
  return {
    id: overrides.id,
    title: overrides.title,
    description: null,
    status: "todo",
    priority: "medium",
    due_date: null,
    start_date: null,
    department_id: null,
    created_by: "creator-1",
    completed_at: null,
    created_at: "",
    updated_at: "",
    assignees: [{ user_id: "assignee-1", name: "Assignee" }],
    requires_review: false,
    reviewer_user_id: null,
    ...overrides,
  };
}

describe("taskPermissions", () => {
  describe("canDeleteTask / canEditTaskMetadata", () => {
    it("allows creator and Admin/MD only", () => {
      const t = task({ id: "1", title: "T", created_by: "creator-1" });
      expect(canDeleteTask(t, "creator-1", false)).toBe(true);
      expect(canDeleteTask(t, "assignee-1", false)).toBe(false);
      expect(canDeleteTask(t, "other", true)).toBe(true);
      expect(canEditTaskMetadata(t, "assignee-1", false)).toBe(false);
    });
  });

  describe("canReviewTask", () => {
    it("allows creator, reviewer, dept manager, and Admin/MD", () => {
      const t = task({
        id: "1",
        title: "T",
        created_by: "creator-1",
        reviewer_user_id: "reviewer-1",
        department_id: "dept-a",
      });
      expect(canReviewTask(t, "creator-1", false, [])).toBe(true);
      expect(canReviewTask(t, "reviewer-1", false, [])).toBe(true);
      expect(canReviewTask(t, "manager-1", false, ["dept-a"])).toBe(true);
      expect(canReviewTask(t, "stranger", false, [])).toBe(false);
      expect(canReviewTask(t, "stranger", true, [])).toBe(true);
    });
  });

  describe("assignee status options", () => {
    it("allows done when review not required", () => {
      const t = task({ id: "1", title: "T", assignees: [{ user_id: "u1", name: "U" }] });
      const statuses = allowedStatusesForUser(t, "u1", false, []);
      expect(statuses).toContain("done");
      expect(statuses).not.toContain("pending_review");
    });

    it("blocks done and allows pending_review when audit required", () => {
      const t = task({
        id: "1",
        title: "T",
        requires_review: true,
        assignees: [{ user_id: "u1", name: "U" }],
      });
      const statuses = allowedStatusesForUser(t, "u1", false, []);
      expect(statuses).toContain("pending_review");
      expect(statuses).not.toContain("done");
    });

    it("creator gets all statuses including done", () => {
      const t = task({
        id: "1",
        title: "T",
        created_by: "creator-1",
        requires_review: true,
      });
      expect(allowedStatusesForUser(t, "creator-1", false, [])).toContain("done");
    });
  });

  describe("review flow helpers", () => {
    it("canSubmitForReview when assignee and audit enabled", () => {
      const t = task({
        id: "1",
        title: "T",
        status: "in_progress",
        requires_review: true,
        assignees: [{ user_id: "u1", name: "U" }],
      });
      expect(canSubmitForReview(t, "u1")).toBe(true);
      expect(canSubmitForReview(t, "creator-1")).toBe(false);
      expect(canSubmitForReview({ ...t, status: "pending_review" }, "u1")).toBe(false);
    });

    it("canApproveOrRejectReview only when pending_review and authorized", () => {
      const t = task({
        id: "1",
        title: "T",
        status: "pending_review",
        created_by: "creator-1",
      });
      expect(canApproveOrRejectReview(t, "creator-1", false, [])).toBe(true);
      expect(canApproveOrRejectReview(t, "assignee-1", false, [])).toBe(false);
      expect(canApproveOrRejectReview({ ...t, status: "in_progress" }, "creator-1", false, [])).toBe(false);
    });
  });

  describe("isTaskAssignee", () => {
    it("detects assignee membership", () => {
      const t = task({ id: "1", title: "T", assignees: [{ user_id: "u1", name: "U" }] });
      expect(isTaskAssignee(t, "u1")).toBe(true);
      expect(isTaskAssignee(t, "u2")).toBe(false);
    });
  });

  describe("canExtendTaskDueDate", () => {
    it("allows assignees and creator on active tasks", () => {
      const t = task({
        id: "1",
        title: "T",
        due_date: "2026-06-20",
        created_by: "creator-1",
        assignees: [{ user_id: "u1", name: "U" }],
      });
      expect(canExtendTaskDueDate(t, "u1", false)).toBe(true);
      expect(canExtendTaskDueDate(t, "creator-1", false)).toBe(true);
      expect(canExtendTaskDueDate(t, "stranger", false)).toBe(false);
      expect(canExtendTaskDueDate(t, "stranger", true)).toBe(true);
    });

    it("blocks extension on completed tasks", () => {
      const t = task({ id: "1", title: "T", status: "done", assignees: [{ user_id: "u1", name: "U" }] });
      expect(canExtendTaskDueDate(t, "u1", false)).toBe(false);
    });
  });

  describe("due date extension bounds", () => {
    it("computes min and max extension dates", () => {
      const t = task({ id: "1", title: "T", due_date: "2026-06-10" });
      const min = minTaskDueDateExtension(t);
      const max = maxTaskDueDateExtension(t);
      expect(formatYmd(min)).toBe("2026-06-11");
      expect(formatYmd(max)).toBe("2026-07-10");
    });
  });
});

function formatYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}
