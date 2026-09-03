import { useMemo, useState } from "react";

import { LeaderboardCard } from "@/components/ui/leaderboard-card";
import type { UserPerformanceMetrics } from "@/hooks/usePerformance";
import {
  LEADERBOARD_PERIOD_OPTIONS,
  buildLeaderboard,
  podiumEntries,
  resolveLeaderboardPeriod,
  type LeaderboardPeriodId,
  type LeaderboardProfile,
  type LeaderboardTask,
} from "@/lib/performanceLeaderboard";

interface Props {
  profiles: LeaderboardProfile[];
  metrics: UserPerformanceMetrics[];
  tasks: LeaderboardTask[];
  currentUserId?: string;
  /** Scope label shown next to the date range (e.g. "Organization-wide"). */
  scopeLabel?: string;
  loading?: boolean;
  className?: string;
}

export function PerformanceLeaderboard({
  profiles,
  metrics,
  tasks,
  currentUserId,
  scopeLabel,
  loading = false,
  className,
}: Props) {
  const [periodId, setPeriodId] = useState<LeaderboardPeriodId>("week");

  const period = useMemo(() => resolveLeaderboardPeriod(periodId), [periodId]);

  const entries = useMemo(
    () => buildLeaderboard({ profiles, metrics, tasks, period }),
    [profiles, metrics, tasks, period],
  );

  const podium = useMemo(() => podiumEntries(entries), [entries]);

  return (
    <LeaderboardCard
      className={className}
      title="Team leaderboard"
      description={scopeLabel ? `${scopeLabel} · ${period.description}` : period.description}
      fromDate={period.from}
      toDate={period.to}
      currentUserId={currentUserId}
      podiumRankings={podium.map((e) => ({
        userId: e.userId,
        userName: e.userName,
        rank: e.rank,
        value: e.value,
        avatarUrl: e.avatarUrl,
      }))}
      rankings={entries.map((e) => ({
        userId: e.userId,
        rank: e.rank,
        userName: e.userName,
        byline: e.byline,
        value: e.value,
        avatarUrl: e.avatarUrl,
        displayed: true,
      }))}
      valueLabel={period.valueLabel}
      formatValue={(value) => value.toLocaleString("en-IN")}
      loading={loading}
      emptyMessage={
        period.id === "all"
          ? "No scored members yet — scores appear once work is assigned."
          : "No tasks were completed in this period yet."
      }
      runOptions={LEADERBOARD_PERIOD_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
      selectedRunId={periodId}
      onRunChange={(id) => setPeriodId(id as LeaderboardPeriodId)}
    />
  );
}
