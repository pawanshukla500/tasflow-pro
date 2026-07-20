import { describe, expect, it } from "vitest";
import { mapEmbeddedTask, TASK_PAGE_SIZE, TASK_PAGE_SIZE_MAX } from "@/lib/tasksApi";

describe("tasksApi pagination constants", () => {
  it("keeps a bounded default page size", () => {
    expect(TASK_PAGE_SIZE).toBe(50);
    expect(TASK_PAGE_SIZE_MAX).toBe(100);
  });
});

describe("mapEmbeddedTask", () => {
  it("maps nested assignee, department, and comment count without client joins", () => {
    const task = mapEmbeddedTask({
      id: "t1",
      title: "Ship eager loading",
      description: null,
      status: "todo",
      priority: "high",
      due_date: null,
      start_date: null,
      department_id: "d1",
      created_by: "u1",
      completed_at: null,
      created_at: "2026-07-20T00:00:00Z",
      updated_at: "2026-07-20T00:00:00Z",
      blocked_by: ["t2"],
      depends_on: ["t3"],
      departments: { id: "d1", name: "Engineering", color: "#336699" },
      task_assignees: [
        {
          user_id: "u2",
          profiles: { id: "u2", name: "Alex Chen" },
        },
      ],
      task_subtasks: [{ id: "s1", title: "Write migration", completed: true, position: 0 }],
      task_attachments: [{ count: 1 }],
      task_comments: [{ count: 2 }],
      creator: { id: "u1", name: "Sam Creator" },
    });

    expect(task.assignees[0]?.name).toBe("Alex Chen");
    expect(task.department_name).toBe("Engineering");
    expect(task.department_color).toBe("#336699");
    expect(task.comment_count).toBe(2);
    expect(task.attachment_count).toBe(1);
    expect(task.subtasks).toHaveLength(1);
    expect(task.creator_name).toBe("Sam Creator");
    expect(task.blocked_by).toEqual(["t2"]);
    expect(task.depends_on).toEqual(["t3"]);
  });

  it("falls back when embeds are missing", () => {
    const task = mapEmbeddedTask({
      id: "t1",
      title: "Empty embeds",
      description: null,
      status: "todo",
      priority: "low",
      due_date: null,
      start_date: null,
      department_id: null,
      created_by: null,
      completed_at: null,
      created_at: "2026-07-20T00:00:00Z",
      updated_at: "2026-07-20T00:00:00Z",
      departments: null,
      task_assignees: [],
      task_comments: [],
      blocked_by: null,
      depends_on: null,
    });

    expect(task.assignees).toEqual([]);
    expect(task.department_name).toBeUndefined();
    expect(task.comment_count).toBe(0);
    expect(task.blocked_by).toEqual([]);
    expect(task.depends_on).toEqual([]);
  });
});
