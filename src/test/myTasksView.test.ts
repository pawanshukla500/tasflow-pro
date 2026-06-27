import { describe, it, expect } from "vitest";
import type { TaskRow } from "@/hooks/useTasks";
import {
  filterMyTasksView,
  myTasksTabCounts,
  resolveSubjectUserId,
} from "@/lib/myTasksView";

const task = (overrides: Partial<TaskRow>): TaskRow => ({
  id: "t1",
  title: "Test Task",
  description: null,
  status: "todo",
  priority: "medium",
  due_date: "2026-06-29",
  start_date: null,
  department_id: "dept-1",
  created_by: "manager-1",
  completed_at: null,
  created_at: "2026-06-12T00:00:00Z",
  updated_at: "2026-06-12T00:00:00Z",
  assignees: [{ user_id: "employee-1", name: "Employee" }],
  ...overrides,
});

describe("myTasksView", () => {
  it("uses the selected team member for assigned-to tab filtering", () => {
    const tasks = [task({})];
    const subjectUserId = resolveSubjectUserId("manager-1", true, "employee-1");

    expect(subjectUserId).toBe("employee-1");
    expect(
      filterMyTasksView(tasks, {
        activeTab: "assigned_to_me",
        search: "",
        subjectUserId,
        canFilterByUser: true,
        userFilter: "employee-1",
      }),
    ).toHaveLength(1);
    expect(
      filterMyTasksView(tasks, {
        activeTab: "assigned_to_me",
        search: "",
        subjectUserId: "manager-1",
        canFilterByUser: true,
        userFilter: "all",
      }),
    ).toHaveLength(0);
  });

  it("counts assigned tasks for the selected subject user", () => {
    const tasks = [
      task({ id: "t1" }),
      task({ id: "t2", assignees: [{ user_id: "manager-1", name: "Manager" }] }),
    ];

    expect(myTasksTabCounts(tasks, "employee-1").assigned_to_me).toBe(1);
    expect(myTasksTabCounts(tasks, "manager-1").assigned_to_me).toBe(1);
  });
});
