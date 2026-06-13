import { describe, it, expect } from "vitest";
import { buildDepartmentPerformance, buildProductivityTrends } from "@/hooks/usePerformance";
import { filterBoardTasksForUser } from "@/lib/accessControl";
import { resolveAccessScope } from "@/lib/accessControl";
import type { AuthUser } from "@/contexts/AuthContext";

const employeeUser: AuthUser = {
  id: "user-1",
  email: "e@test.com",
  profile: { id: "user-1", department_id: "dept-1" } as AuthUser["profile"],
  organization: null,
  roles: ["employee"],
  managedDepartments: [],
  departmentName: "Sales",
};

describe("filterBoardTasksForUser", () => {
  const tasks = [
    { id: "t1", created_by: "user-1", assignees: [{ user_id: "user-1" }], department_id: "dept-1" },
    { id: "t2", created_by: "user-2", assignees: [{ user_id: "user-2" }], department_id: "dept-1" },
  ];

  it("employees only see their own tasks on the board", () => {
    const scope = resolveAccessScope(employeeUser);
    const result = filterBoardTasksForUser(tasks, scope, "user-1", new Set());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });
});

describe("buildDepartmentPerformance", () => {
  it("ranks departments by average score", () => {
    const depts = [{ id: "d1", name: "Sales" }, { id: "d2", name: "Ops" }];
    const profiles = [
      { id: "u1", name: "A", department_id: "d1" },
      { id: "u2", name: "B", department_id: "d2" },
      { id: "u3", name: "C", department_id: "d1" },
    ];
    const metrics = [
      {
        user_id: "u1",
        performance_score: 90,
        tasks_assigned: 10,
        tasks_completed: 9,
        tasks_on_time: 8,
        tasks_late: 1,
        tasks_overdue: 0,
        tasks_pending: 1,
        workflows_assigned: 2,
        workflows_completed: 2,
        workflows_on_time: 2,
        reviews_passed: 1,
        reviews_total: 1,
        on_time_rate: 88,
        task_completion_rate: 90,
        workflow_completion_rate: 100,
        quality_rate: 100,
        collaboration_score: 80,
        has_sufficient_data: true,
        deduction_reasons: [],
      },
      {
        user_id: "u2",
        performance_score: 60,
        tasks_assigned: 5,
        tasks_completed: 3,
        tasks_on_time: 2,
        tasks_late: 1,
        tasks_overdue: 2,
        tasks_pending: 2,
        workflows_assigned: 1,
        workflows_completed: 0,
        workflows_on_time: 0,
        reviews_passed: 0,
        reviews_total: 0,
        on_time_rate: 66,
        task_completion_rate: 60,
        workflow_completion_rate: 0,
        quality_rate: 100,
        collaboration_score: 70,
        has_sufficient_data: true,
        deduction_reasons: [],
      },
      {
        user_id: "u3",
        performance_score: 0,
        tasks_assigned: 0,
        tasks_completed: 0,
        tasks_on_time: 0,
        tasks_late: 0,
        tasks_overdue: 0,
        tasks_pending: 0,
        workflows_assigned: 0,
        workflows_completed: 0,
        workflows_on_time: 0,
        reviews_passed: 0,
        reviews_total: 0,
        on_time_rate: 0,
        task_completion_rate: 0,
        workflow_completion_rate: 0,
        quality_rate: 0,
        collaboration_score: 0,
        has_sufficient_data: false,
        deduction_reasons: [],
      },
    ] as Parameters<typeof buildDepartmentPerformance>[2];

    const result = buildDepartmentPerformance(depts, profiles, metrics, [], []);
    expect(result[0].department_name).toBe("Sales");
    expect(result[0].avg_score).toBe(90);
    expect(result[1].avg_score).toBe(60);
  });
});

describe("buildProductivityTrends", () => {
  it("returns 8 weekly data points", () => {
    const now = new Date().toISOString();
    const result = buildProductivityTrends(
      [{ status: "done", completed_at: now, completed_on_time: true }],
      [{ status: "completed", completed_at: now }],
    );
    expect(result).toHaveLength(8);
    expect(result.some((p) => p.tasks_completed >= 1)).toBe(true);
    expect(result.at(-1)?.on_time_pct).toBe(100);
  });

  it("uses zero on-time when no tasks completed in week", () => {
    const result = buildProductivityTrends([], []);
    expect(result[0].on_time_pct).toBe(0);
  });
});
