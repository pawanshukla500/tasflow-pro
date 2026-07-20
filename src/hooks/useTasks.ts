import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchTasksPage,
  fetchTasksBounded,
  TASK_PAGE_SIZE,
  type TaskRow,
} from "@/lib/tasksApi";

export type { TaskRow };

export type UseTasksOptions = {
  /** Initial page size (default 50, max 100). */
  pageSize?: number;
  /**
   * When true (default), load pages in bounded chunks up to `boundedMax`
   * so dashboards work without a single unbounded SELECT *.
   */
  autoLoadBounded?: boolean;
  boundedMax?: number;
};

export function useTasks(options: UseTasksOptions = {}) {
  const pageSize = options.pageSize ?? TASK_PAGE_SIZE;
  const autoLoadBounded = options.autoLoadBounded ?? true;
  const boundedMax = options.boundedMax ?? 300;

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const hasLoadedRef = useRef(false);
  const fetchGen = useRef(0);

  const fetchTasks = useCallback(async (opts?: { silent?: boolean }) => {
    const gen = ++fetchGen.current;
    if (!opts?.silent) setLoading(true);
    try {
      if (autoLoadBounded) {
        const { tasks: rows, total: boundedTotal, hasMore: more } =
          await fetchTasksBounded(boundedMax);
        if (gen !== fetchGen.current) return;
        setTasks(rows);
        setPage(Math.ceil(rows.length / pageSize) || 1);
        setTotal(boundedTotal);
        setHasMore(more);
      } else {
        const result = await fetchTasksPage({ page: 1, limit: pageSize });
        if (gen !== fetchGen.current) return;
        setTasks(result.tasks);
        setPage(1);
        setTotal(result.total);
        setHasMore(result.hasMore);
      }
      hasLoadedRef.current = true;
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      if (!opts?.silent && gen === fetchGen.current) setLoading(false);
    }
  }, [autoLoadBounded, boundedMax, pageSize]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await fetchTasksPage({ page: nextPage, limit: pageSize });
      setTasks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const merged = [...prev];
        for (const t of result.tasks) {
          if (!seen.has(t.id)) merged.push(t);
        }
        return merged;
      });
      setPage(nextPage);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error("Failed to load more tasks:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, page, pageSize]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const channel = supabase
      .channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        fetchTasks({ silent: hasLoadedRef.current });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignees" }, () => {
        fetchTasks({ silent: hasLoadedRef.current });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  useEffect(() => {
    const handler = () => fetchTasks({ silent: true });
    window.addEventListener("task:created", handler);
    return () => window.removeEventListener("task:created", handler);
  }, [fetchTasks]);

  const updateTaskStatus = async (taskId: string, status: string) => {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (!error) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status,
                completed_at: status === "done" ? new Date().toISOString() : null,
              }
            : t,
        ),
      );
    }
    return error;
  };

  const deleteTask = async (taskId: string) => {
    // DB trigger scrub_task_dependency_refs removes this id from other tasks'
    // blocked_by / depends_on arrays before the row is deleted.
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (!error) {
      setTasks((prev) =>
        prev
          .filter((t) => t.id !== taskId)
          .map((t) => ({
            ...t,
            blocked_by: (t.blocked_by || []).filter((id) => id !== taskId),
            depends_on: (t.depends_on || []).filter((id) => id !== taskId),
          })),
      );
    }
    return error;
  };

  return {
    tasks,
    loading,
    loadingMore,
    hasMore,
    total,
    page,
    fetchTasks,
    loadMore,
    updateTaskStatus,
    deleteTask,
  };
}
