import { describe, expect, it } from "vitest";

import {
  buildLeaderboard,
  podiumEntries,
  resolveLeaderboardPeriod,
  type LeaderboardProfile,
  type LeaderboardTask,
} from "@/lib/performanceLeaderboard";
import type { UserPerformanceMetrics } from "@/hooks/usePerformance";

const profiles: LeaderboardProfile[] = [
  { id: "u-1", name: "Ava Turner" },
  { id: "u-2", name: "Leo Harrison" },
  { id: "u-3", name: "Rowan Elijah" },
];

function metric(overrides: Partial<UserPerformanceMetrics> & { user_id: string }): UserPerformanceMetrics {
  return {
    organization_id: "org-1",
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
    avg_response_hours: null,
    task_completion_rate: 0,
    on_time_rate: 0,
    workflow_completion_rate: 0,
    quality_rate: 0,
    collaboration_score: 0,
    deduction_reasons: [],
    updated_at: "2026-05-07T00:00:00Z",
    ...overrides,
  };
}

describe("resolveLeaderboardPeriod", () => {
  it("starts the weekly window on Monday in IST", () => {
    // 2026-05-07 IST is a Thursday.
    const period = resolveLeaderboardPeriod("week", new Date("2026-05-07T06:00:00Z"));
    expect(period.from).toBe("2026-05-04");
    expect(period.to).toBe("2026-05-07");
    expect(period.valueLabel).toBe("tasks");
  });

  it("starts the monthly window on the 1st", () => {
    const period = resolveLeaderboardPeriod("month", new Date("2026-05-07T06:00:00Z"));
    expect(period.from).toBe("2026-05-01");
    expect(period.to).toBe("2026-05-07");
  });

  it("ranks by cumulative score for all time", () => {
    const period = resolveLeaderboardPeriod("all", new Date("2026-05-07T06:00:00Z"));
    expect(period.valueLabel).toBe("score");
  });
});

describe("buildLeaderboard — all time", () => {
  const period = resolveLeaderboardPeriod("all", new Date("2026-05-07T06:00:00Z"));

  it("ranks by performance score and skips members without data", () => {
    const entries = buildLeaderboard({
      profiles,
      tasks: [],
      period,
      metrics: [
        metric({ user_id: "u-1", performance_score: 72, tasks_assigned: 10, tasks_completed: 8, on_time_rate: 80 }),
        metric({ user_id: "u-2", performance_score: 91, tasks_assigned: 12, tasks_completed: 12, on_time_rate: 95 }),
        metric({ user_id: "u-3", performance_score: 0, has_sufficient_data: false }),
      ],
    });

    expect(entries.map((e) => e.userId)).toEqual(["u-2", "u-1"]);
    expect(entries[0].rank).toBe(1);
    expect(entries[0].byline).toBe("12/12 tasks · 95% on-time");
  });
});

describe("buildLeaderboard — windowed", () => {
  const period = resolveLeaderboardPeriod("week", new Date("2026-05-07T06:00:00Z"));

  const tasks: LeaderboardTask[] = [
    // Inside the window.
    { status: "done", completed_at: "2026-05-05T06:00:00Z", completed_on_time: true, assignees: [{ user_id: "u-1" }] },
    { status: "done", completed_at: "2026-05-06T06:00:00Z", completed_on_time: false, assignees: [{ user_id: "u-1" }] },
    { status: "done", completed_at: "2026-05-06T06:00:00Z", completed_on_time: true, assignees: [{ user_id: "u-2" }] },
    // Outside the window / not done.
    { status: "done", completed_at: "2026-04-28T06:00:00Z", completed_on_time: true, assignees: [{ user_id: "u-3" }] },
    { status: "in_progress", completed_at: null, assignees: [{ user_id: "u-3" }] },
  ];

  it("counts only tasks completed inside the IST window", () => {
    const entries = buildLeaderboard({ profiles, metrics: [], tasks, period });

    expect(entries.map((e) => [e.userId, e.value])).toEqual([
      ["u-1", 2],
      ["u-2", 1],
      ["u-3", 0],
    ]);
    expect(entries[0].byline).toBe("2 completed · 50% on-time · 1 late");
    expect(entries[2].byline).toBe("No tasks completed in this period");
  });

  it("credits every assignee of a shared task", () => {
    const entries = buildLeaderboard({
      profiles,
      metrics: [],
      period,
      tasks: [
        {
          status: "done",
          completed_at: "2026-05-05T06:00:00Z",
          completed_on_time: true,
          assignees: [{ user_id: "u-1" }, { user_id: "u-2" }],
        },
      ],
    });

    expect(entries.filter((e) => e.value === 1).map((e) => e.userId).sort()).toEqual(["u-1", "u-2"]);
  });

  it("keeps only non-zero entries on the podium", () => {
    const entries = buildLeaderboard({ profiles, metrics: [], tasks, period });
    expect(podiumEntries(entries).map((e) => e.userId)).toEqual(["u-1", "u-2"]);
  });
});
