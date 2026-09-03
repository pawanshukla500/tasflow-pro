import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { IST_OFFSET } from "@/lib/time";
import type { LeaderboardPeriod, LeaderboardTask } from "@/lib/performanceLeaderboard";

type TaskCompletionRow = {
  status: string;
  completed_at: string | null;
  completed_on_time: boolean | null;
  task_assignees: { user_id: string }[] | null;
};

/**
 * Fetches tasks completed within a leaderboard period directly from
 * Supabase, filtered server-side by `completed_at`.
 *
 * The shared `useTasks` cache is bounded by *creation* recency (most
 * recently created N rows), so on organizations with more than that many
 * tasks it can silently drop older-created tasks that were nonetheless
 * completed inside the requested window — undercounting weekly/monthly
 * rankings. Querying the exact date range instead keeps rankings accurate
 * regardless of total task volume.
 */
export function useLeaderboardTaskCompletions(period: LeaderboardPeriod) {
  const [tasks, setTasks] = useState<LeaderboardTask[]>([]);
  const [loading, setLoading] = useState(period.id !== "all");

  useEffect(() => {
    if (period.id === "all") {
      setTasks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("tasks")
      .select("status, completed_at, completed_on_time, task_assignees ( user_id )")
      .eq("status", "done")
      .gte("completed_at", `${period.from}T00:00:00${IST_OFFSET}`)
      // Scoped by date rather than recency — large enough for any
      // realistic week/month of completions across the organization.
      .order("completed_at", { ascending: false })
      .limit(2000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useLeaderboardTaskCompletions:", error);
          setTasks([]);
        } else {
          setTasks(
            ((data as unknown as TaskCompletionRow[] | null) || []).map((row) => ({
              status: row.status,
              completed_at: row.completed_at,
              completed_on_time: row.completed_on_time,
              assignees: (row.task_assignees || []).map((a) => ({ user_id: a.user_id })),
            })),
          );
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period.id, period.from]);

  return { tasks, loading };
}
