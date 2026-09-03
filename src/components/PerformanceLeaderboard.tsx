import { useMemo, useState } from "react";

import { LeaderboardCard } from "@/components/ui/leaderboard-card";
import type { UserPerformanceMetrics } from "@/hooks/usePerformance";
import { useLeaderboardTaskCompletions } from "@/hooks/useLeaderboardTaskCompletions";
import {
  LEADERBOARD_PERIOD_OPTIONS,
  buildLeaderboard,
  podiumEntries,
  resolveLeaderboardPeriod,
  type LeaderboardPeriodId,
  type LeaderboardProfile,
} from "@/lib/performanceLeaderboard";

interface Props {
  profiles: LeaderboardProfile[];
  metrics: UserPerformanceMetrics[];
  currentUserId?: string;
  /** Scope label shown next to the date range (e.g. "Organization-wide"). */
  scopeLabel?: string;
  /** Loading state for `metrics` — used for the "All time" period. */
  loading?: boolean;
  className?: string;
}

export function PerformanceLeaderboard({
  profiles,
  metrics,
  currentUserId,
  scopeLabel,
  loading = false,
  className,
}: Props) {
  const [periodId, setPeriodId] = useState<LeaderboardPeriodId>("week");

  // Recomputed every render (cheap) rather than memoized on `periodId` alone,
  // so the IST window rolls over correctly if the tab is left open past
  // midnight instead of freezing on the day it was first opened.
  const period = resolveLeaderboardPeriod(periodId);

  // Task completions are fetched directly for the period's date range —
  // the shared `useTasks` cache is bounded by creation recency and can
  // silently omit older-created tasks that were completed inside the window.
  const { tasks: rangeTasks, loading: tasksLoading } = useLeaderboardTaskCompletions(period);

  const entries = useMemo(
    () => buildLeaderboard({ profiles, metrics, tasks: rangeTasks, period }),
    [profiles, metrics, rangeTasks, period],
  );

  const podium = useMemo(() => podiumEntries(entries), [entries]);

  // "All time" is a lifetime cumulative score, not bounded to this
  // calendar year — showing a fabricated "Jan 1 – today" range would
  // misrepresent it, so the date range is only shown for windowed periods.
  const showDateRange = period.id !== "all";

  return (
    <LeaderboardCard
      className={className}
      title="Team leaderboard"
      description={scopeLabel ? `${scopeLabel} · ${period.description}` : period.description}
      fromDate={showDateRange ? period.from : undefined}
      toDate={showDateRange ? period.to : undefined}
      resetKey={periodId}
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
      loading={period.id === "all" ? loading : tasksLoading}
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
