/**
 * Leaderboard data for the Performance tab.
 *
 * Two data sources, depending on the selected period:
 *  - "all"  → cumulative `user_performance_metrics.performance_score` (same
 *             numbers the score cards and Executive Dashboard use).
 *  - week / month → derived from tasks completed inside the IST window, since
 *             the metrics snapshot is cumulative and has no time dimension.
 */
import { IST_TIME_ZONE, addDaysIST, todayIST } from "@/lib/time";
import type { UserPerformanceMetrics } from "@/hooks/usePerformance";

export type LeaderboardPeriodId = "week" | "month" | "all";

export interface LeaderboardPeriod {
  id: LeaderboardPeriodId;
  label: string;
  /** Inclusive IST window (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Unit rendered next to each value. */
  valueLabel: string;
  /** Short explanation of what is being ranked. */
  description: string;
}

export interface LeaderboardProfile {
  id: string;
  name: string;
  avatar_url?: string | null;
  position?: string | null;
  department_id?: string | null;
}

/**
 * Callers must supply the *complete* set of tasks completed within the
 * target period (e.g. via a query filtered by `completed_at`), not a
 * recency-bounded cache — this ranking logic does not know if its input
 * was truncated and will silently undercount anyone whose completions fell
 * outside the supplied slice.
 */
export interface LeaderboardTask {
  status: string;
  completed_at?: string | null;
  completed_on_time?: boolean | null;
  assignees?: { user_id: string }[];
}

export interface LeaderboardEntry {
  userId: string;
  rank: number;
  userName: string;
  byline: string;
  value: number;
  avatarUrl?: string | null;
}

export const LEADERBOARD_PERIOD_OPTIONS: { id: LeaderboardPeriodId; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Day of week (0 = Sunday) for an IST YYYY-MM-DD date. */
function weekdayIST(yyyyMmDd: string): number {
  const at = new Date(`${yyyyMmDd}T12:00:00+05:30`);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIME_ZONE,
    weekday: "short",
  }).format(at);
  return WEEKDAY_INDEX[label] ?? 0;
}

/** Resolve the inclusive IST date window for a period. */
export function resolveLeaderboardPeriod(
  id: LeaderboardPeriodId,
  now: Date = new Date(),
): LeaderboardPeriod {
  const today = todayIST(now);

  if (id === "week") {
    // Week starts Monday, matching the Mon–Sat digest cadence.
    const offset = (weekdayIST(today) + 6) % 7;
    return {
      id,
      label: "This week",
      from: addDaysIST(today, -offset),
      to: today,
      valueLabel: "tasks",
      description: "tasks completed this week",
    };
  }

  if (id === "month") {
    return {
      id,
      label: "This month",
      from: `${today.slice(0, 7)}-01`,
      to: today,
      valueLabel: "tasks",
      description: "tasks completed this month",
    };
  }

  return {
    id: "all",
    label: "All time",
    from: `${today.slice(0, 4)}-01-01`,
    to: today,
    valueLabel: "score",
    description: "cumulative performance score",
  };
}

/** IST calendar date (YYYY-MM-DD) of a timestamp. */
function istDate(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "";
  return todayIST(parsed);
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Pre-ranking row: same shape as an entry, minus the assigned rank. */
type RankRow = Omit<LeaderboardEntry, "rank"> & { tieBreak: number };

function rankRows(rows: RankRow[]): LeaderboardEntry[] {
  return rows
    .slice()
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      if (b.tieBreak !== a.tieBreak) return b.tieBreak - a.tieBreak;
      return a.userName.localeCompare(b.userName);
    })
    .map((row, i) => ({
      userId: row.userId,
      rank: i + 1,
      userName: row.userName,
      byline: row.byline,
      value: row.value,
      avatarUrl: row.avatarUrl,
    }));
}

/** All-time ranking from the cumulative performance metrics snapshot. */
function buildScoreLeaderboard(
  profiles: LeaderboardProfile[],
  metrics: UserPerformanceMetrics[],
): LeaderboardEntry[] {
  const byUser = new Map(metrics.map((m) => [m.user_id, m]));

  const rows: RankRow[] = [];

  for (const profile of profiles) {
    const m = byUser.get(profile.id);
    if (!m) continue;
    const hasData = m.has_sufficient_data ?? (m.tasks_assigned > 0 || m.workflows_assigned > 0);
    if (!hasData) continue;

    rows.push({
      userId: profile.id,
      userName: profile.name,
      avatarUrl: profile.avatar_url ?? null,
      value: Math.round(m.performance_score),
      tieBreak: Math.round(m.on_time_rate),
      byline: `${m.tasks_completed}/${m.tasks_assigned} tasks · ${Math.round(m.on_time_rate)}% on-time`,
    });
  }

  return rankRows(rows);
}

/** Windowed ranking from tasks completed inside the IST period. */
function buildTaskLeaderboard(
  profiles: LeaderboardProfile[],
  tasks: LeaderboardTask[],
  period: LeaderboardPeriod,
): LeaderboardEntry[] {
  const done = new Map<string, { completed: number; onTime: number }>();

  for (const task of tasks) {
    if (task.status !== "done" || !task.completed_at) continue;
    const day = istDate(task.completed_at);
    if (!day || day < period.from || day > period.to) continue;

    for (const assignee of task.assignees ?? []) {
      const bucket = done.get(assignee.user_id) ?? { completed: 0, onTime: 0 };
      bucket.completed += 1;
      if (task.completed_on_time !== false) bucket.onTime += 1;
      done.set(assignee.user_id, bucket);
    }
  }

  const rows: RankRow[] = profiles.map((profile) => {
    const bucket = done.get(profile.id) ?? { completed: 0, onTime: 0 };
    const late = bucket.completed - bucket.onTime;

    return {
      userId: profile.id,
      userName: profile.name,
      avatarUrl: profile.avatar_url ?? null,
      value: bucket.completed,
      tieBreak: bucket.onTime,
      byline: bucket.completed
        ? `${bucket.completed} completed · ${pct(bucket.onTime, bucket.completed)}% on-time${late ? ` · ${late} late` : ""}`
        : "No tasks completed in this period",
    };
  });

  return rankRows(rows);
}

export function buildLeaderboard(input: {
  profiles: LeaderboardProfile[];
  metrics: UserPerformanceMetrics[];
  tasks: LeaderboardTask[];
  period: LeaderboardPeriod;
}): LeaderboardEntry[] {
  const { profiles, metrics, tasks, period } = input;
  return period.id === "all"
    ? buildScoreLeaderboard(profiles, metrics)
    : buildTaskLeaderboard(profiles, tasks, period);
}

/** Top three entries with a non-zero value — the podium never shows blanks. */
export function podiumEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.filter((e) => e.value > 0).slice(0, 3);
}
