import { describe, it, expect } from "vitest";
import type { AppRole } from "@/contexts/AuthContext";
import {
  filterPerformanceLeaderboardProfiles,
  filterPerformanceMetrics,
  shouldShowInPerformanceLeaderboard,
} from "@/lib/performanceVisibility";

describe("performanceVisibility", () => {
  const roles = new Map<string, AppRole[]>([
    ["md-1", ["managing_director"]],
    ["emp-1", ["employee"]],
    ["mgr-1", ["department_manager"]],
  ]);

  it("excludes managing directors from leaderboards", () => {
    expect(shouldShowInPerformanceLeaderboard(["managing_director"])).toBe(false);
    expect(shouldShowInPerformanceLeaderboard(["employee"])).toBe(true);
    expect(shouldShowInPerformanceLeaderboard(["department_manager"])).toBe(true);
  });

  it("filters profiles and metrics", () => {
    const profiles = [{ id: "md-1" }, { id: "emp-1" }];
    expect(filterPerformanceLeaderboardProfiles(profiles, roles).map((p) => p.id)).toEqual(["emp-1"]);

    const metrics = [
      { user_id: "md-1", performance_score: 100 },
      { user_id: "emp-1", performance_score: 50 },
    ];
    expect(filterPerformanceMetrics(metrics, roles).map((m) => m.user_id)).toEqual(["emp-1"]);
  });
});
