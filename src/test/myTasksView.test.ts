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

  it("search matches title and project name", () => {
    const tasks = [
      task({ id: "t1", title: "Ship catalog", project_name: "Website Redesign" }),
      task({ id: "t2", title: "Other work", project_name: "Internal Ops" }),
    ];
    const opts = {
      activeTab: "all" as const,
      subjectUserId: "employee-1",
      canFilterByUser: false,
      userFilter: "all",
    };
    expect(filterMyTasksView(tasks, { ...opts, search: "Ship" }).map((t) => t.id)).toEqual(["t1"]);
    expect(filterMyTasksView(tasks, { ...opts, search: "Website" }).map((t) => t.id)).toEqual(["t1"]);
  });

  it("search matches description and assignee name", () => {
    const tasks = [
      task({
        id: "t1",
        title: "Alpha",
        description: "Need packing list for Myntra",
        assignees: [{ user_id: "employee-1", name: "Priya Shah" }],
      }),
      task({ id: "t2", title: "Beta", description: "Unrelated", assignees: [{ user_id: "u2", name: "Rahul" }] }),
    ];
    const opts = {
      activeTab: "all" as const,
      subjectUserId: "employee-1",
      canFilterByUser: false,
      userFilter: "all",
    };
    expect(filterMyTasksView(tasks, { ...opts, search: "packing list" })).toHaveLength(1);
    expect(filterMyTasksView(tasks, { ...opts, search: "Priya" })).toHaveLength(1);
  });
});

