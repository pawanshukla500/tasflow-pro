import type { AppRole } from "@/contexts/AuthContext";

/** Managing Directors are owners — excluded from employee performance leaderboards. */
export const PERFORMANCE_LEADERBOARD_EXCLUDED: AppRole[] = ["managing_director"];

export function shouldShowInPerformanceLeaderboard(roles: AppRole[]): boolean {
  return !roles.some((r) => PERFORMANCE_LEADERBOARD_EXCLUDED.includes(r));
}

export function filterPerformanceLeaderboardProfiles<T extends { id: string }>(
  profiles: T[],
  rolesByUserId: Map<string, AppRole[]>,
): T[] {
  return profiles.filter((p) =>
    shouldShowInPerformanceLeaderboard(rolesByUserId.get(p.id) ?? ["employee"]),
  );
}

export function filterPerformanceMetrics<T extends { user_id: string }>(
  metrics: T[],
  rolesByUserId: Map<string, AppRole[]>,
): T[] {
  return metrics.filter((m) =>
    shouldShowInPerformanceLeaderboard(rolesByUserId.get(m.user_id) ?? ["employee"]),
  );
}
