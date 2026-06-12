import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PerformanceReason {
  type: string;
  count: number;
  message: string;
  impact: "positive" | "negative" | "neutral";
}

export interface UserPerformanceMetrics {
  user_id: string;
  organization_id: string | null;
  performance_score: number;
  tasks_assigned: number;
  tasks_completed: number;
  tasks_on_time: number;
  tasks_late: number;
  tasks_overdue: number;
  tasks_pending: number;
  workflows_assigned: number;
  workflows_completed: number;
  workflows_on_time: number;
  reviews_passed: number;
  reviews_total: number;
  avg_response_hours: number | null;
  task_completion_rate: number;
  on_time_rate: number;
  workflow_completion_rate: number;
  quality_rate: number;
  collaboration_score: number;
  deduction_reasons: PerformanceReason[];
  updated_at: string;
}

export interface DepartmentPerformance {
  department_id: string;
  department_name: string;
  member_count: number;
  avg_score: number;
  tasks_total: number;
  tasks_done: number;
  tasks_overdue: number;
  on_time_pct: number;
  pending_workflows: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function usePerformance(userIds?: string[]) {
  const [metrics, setMetrics] = useState<UserPerformanceMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      let q = db.from("user_performance_metrics").select("*");
      if (userIds?.length) q = q.in("user_id", userIds);
      const { data, error } = await q;
      if (error) throw error;
      setMetrics(
        (data || []).map((m: UserPerformanceMetrics) => ({
          ...m,
          deduction_reasons: Array.isArray(m.deduction_reasons) ? m.deduction_reasons : [],
        })),
      );
    } catch (e) {
      console.error("usePerformance:", e);
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  }, [userIds?.join(",")]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    const channel = supabase
      .channel("performance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_performance_metrics" }, () => {
        fetchMetrics();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchMetrics();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMetrics]);

  return { metrics, loading, refetch: fetchMetrics };
}

export function buildDepartmentPerformance(
  departments: { id: string; name: string }[],
  profiles: { id: string; department_id?: string | null; name: string }[],
  metrics: UserPerformanceMetrics[],
  tasks: { department_id?: string | null; status: string; due_date?: string | null; completed_on_time?: boolean | null }[],
  workflows: { raised_by_department_id?: string | null; status: string }[],
): DepartmentPerformance[] {
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());

  return departments.map((dept) => {
    const deptProfiles = profiles.filter((p) => p.department_id === dept.id);
    const deptMetrics = metrics.filter((m) => deptProfiles.some((p) => p.id === m.user_id));
    const deptTasks = tasks.filter((t) => t.department_id === dept.id);
    const done = deptTasks.filter((t) => t.status === "done");
    const onTime = done.filter((t) => t.completed_on_time !== false);

    return {
      department_id: dept.id,
      department_name: dept.name,
      member_count: deptProfiles.length,
      avg_score: deptMetrics.length
        ? Math.round(deptMetrics.reduce((s, m) => s + m.performance_score, 0) / deptMetrics.length)
        : 0,
      tasks_total: deptTasks.length,
      tasks_done: done.length,
      tasks_overdue: deptTasks.filter(
        (t) => t.status !== "done" && t.due_date && t.due_date < today,
      ).length,
      on_time_pct: done.length ? Math.round((onTime.length / done.length) * 100) : 100,
      pending_workflows: workflows.filter(
        (w) => w.raised_by_department_id === dept.id && w.status === "active",
      ).length,
    };
  }).sort((a, b) => b.avg_score - a.avg_score);
}
