import { describe, expect, it } from "vitest";
import { applyTaskDeleted, applyTaskStatus, type TaskRow } from "@/hooks/useTasks";

function task(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "t1",
    title: "Sample",
    description: null,
    status: "todo",
    priority: "medium",
    due_date: null,
    start_date: null,
    department_id: null,
    created_by: null,
    completed_at: null,
    created_at: "2026-07-20T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    assignees: [],
    blocked_by: [],
    depends_on: [],
    ...overrides,
  };
}

describe("applyTaskStatus", () => {
  it("updates status immediately and sets completed_at when done", () => {
    const rows = [task({ id: "a", status: "todo" }), task({ id: "b", status: "in_progress" })];
    const next = applyTaskStatus(rows, "a", "done");
    expect(next[0].status).toBe("done");
    expect(next[0].completed_at).toBeTruthy();
    expect(next[1].status).toBe("in_progress");
  });

  it("clears completed_at when moving away from done", () => {
    const rows = [task({ id: "a", status: "done", completed_at: "2026-07-01T00:00:00Z" })];
    const next = applyTaskStatus(rows, "a", "todo");
    expect(next[0].status).toBe("todo");
    expect(next[0].completed_at).toBeNull();
  });
});

describe("applyTaskDeleted", () => {
  it("removes the task and scrubs dependency refs locally", () => {
    const rows = [
      task({ id: "gone" }),
      task({ id: "keep", blocked_by: ["gone", "other"], depends_on: ["gone"] }),
    ];
    const next = applyTaskDeleted(rows, "gone");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("keep");
    expect(next[0].blocked_by).toEqual(["other"]);
    expect(next[0].depends_on).toEqual([]);
  });
});
