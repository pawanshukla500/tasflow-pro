import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useQuery,
  useQueryClient,
  useMutation,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchTasksPage,
  fetchTasksBounded,
  TASK_PAGE_SIZE,
  type TaskRow,
} from "@/lib/tasksApi";

export type { TaskRow };

/** Shared React Query keys — Board, My Tasks, Dashboard, etc. share one cache. */
export const tasksKeys = {
  all: ["tasks"] as const,
  list: (opts: { autoLoadBounded: boolean; boundedMax: number; pageSize: number }) =>
    [...tasksKeys.all, "list", opts] as const,
};

export type TasksCache = {
  tasks: TaskRow[];
  total: number | null;
  hasMore: boolean;
  page: number;
};

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

export function applyTaskStatus(
  tasks: TaskRow[],
  taskId: string,
  status: string,
): TaskRow[] {
  return tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
        }
      : t,
  );
}

export function applyTaskDeleted(tasks: TaskRow[], taskId: string): TaskRow[] {
  return tasks
    .filter((t) => t.id !== taskId)
    .map((t) => ({
      ...t,
      blocked_by: (t.blocked_by || []).filter((id) => id !== taskId),
      depends_on: (t.depends_on || []).filter((id) => id !== taskId),
    }));
}

function patchCacheStatus(
  cache: TasksCache | undefined,
  taskId: string,
  status: string,
): TasksCache | undefined {
  if (!cache) return cache;
  return { ...cache, tasks: applyTaskStatus(cache.tasks, taskId, status) };
}

function patchCacheDeleted(
  cache: TasksCache | undefined,
  taskId: string,
): TasksCache | undefined {
  if (!cache) return cache;
  return { ...cache, tasks: applyTaskDeleted(cache.tasks, taskId) };
}

async function loadTasksCache(options: {
  autoLoadBounded: boolean;
  boundedMax: number;
  pageSize: number;
}): Promise<TasksCache> {
  if (options.autoLoadBounded) {
    const { tasks, total, hasMore } = await fetchTasksBounded(options.boundedMax);
    return {
      tasks,
      total,
      hasMore,
      page: Math.ceil(tasks.length / options.pageSize) || 1,
    };
  }
  const result = await fetchTasksPage({ page: 1, limit: options.pageSize });
  return {
    tasks: result.tasks,
    total: result.total,
    hasMore: result.hasMore,
    page: 1,
  };
}

/** Ref-counted realtime channel so Board/MyTasks/Dashboard don't tear each other down. */
let tasksLiveSubscribers = 0;
let tasksLiveChannel: ReturnType<typeof supabase.channel> | null = null;
let tasksLiveInvalidate: (() => void) | null = null;

function subscribeTasksLive(onInvalidate: () => void) {
  tasksLiveInvalidate = onInvalidate;
  tasksLiveSubscribers += 1;
  if (tasksLiveSubscribers === 1) {
    tasksLiveChannel = supabase
      .channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        tasksLiveInvalidate?.();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_assignees" },
        () => {
          tasksLiveInvalidate?.();
        },
      )
      .subscribe();
  }
  return () => {
    tasksLiveSubscribers = Math.max(0, tasksLiveSubscribers - 1);
    if (tasksLiveSubscribers === 0 && tasksLiveChannel) {
      void supabase.removeChannel(tasksLiveChannel);
      tasksLiveChannel = null;
      tasksLiveInvalidate = null;
    }
  };
}

export function useTasks(options: UseTasksOptions = {}) {
  const pageSize = options.pageSize ?? TASK_PAGE_SIZE;
  const autoLoadBounded = options.autoLoadBounded ?? true;
  const boundedMax = options.boundedMax ?? 300;
  const queryClient = useQueryClient();
  const [loadingMore, setLoadingMore] = useState(false);
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listOpts = useMemo(
    () => ({ autoLoadBounded, boundedMax, pageSize }),
    [autoLoadBounded, boundedMax, pageSize],
  );
  const queryKey = tasksKeys.list(listOpts);

  const query = useQuery({
    queryKey,
    queryFn: () => loadTasksCache(listOpts),
    // Keep list warm across Board ↔ My Tasks ↔ Dashboard navigations.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const scheduleInvalidate = useCallback(() => {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    // Debounce so our own optimistic writes don't thrash with realtime echoes.
    invalidateTimer.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    }, 400);
  }, [queryClient]);

  const fetchTasks = useCallback(
    async (_opts?: { silent?: boolean }) => {
      await queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
    [queryClient],
  );

  useEffect(() => {
    const unsubscribeLive = subscribeTasksLive(scheduleInvalidate);

    const onCreated = () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    };
    window.addEventListener("task:created", onCreated);

    return () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
      unsubscribeLive();
      window.removeEventListener("task:created", onCreated);
    };
  }, [queryClient, scheduleInvalidate]);

  const statusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
      if (error) throw error;
    },
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.all });
      const previous = queryClient.getQueriesData<TasksCache>({ queryKey: tasksKeys.all });
      queryClient.setQueriesData<TasksCache>({ queryKey: tasksKeys.all }, (old) =>
        patchCacheStatus(old, taskId, status),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data);
      });
      toast.error("Failed to update task");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.all });
      const previous = queryClient.getQueriesData<TasksCache>({ queryKey: tasksKeys.all });
      queryClient.setQueriesData<TasksCache>({ queryKey: tasksKeys.all }, (old) =>
        patchCacheDeleted(old, taskId),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data);
      });
      toast.error("Failed to delete task");
    },
  });

  const loadMore = useCallback(async () => {
    const cached = queryClient.getQueryData<TasksCache>(queryKey);
    if (!cached?.hasMore || loadingMore) return;

    setLoadingMore(true);
    const nextPage = cached.page + 1;
    try {
      const result = await fetchTasksPage({ page: nextPage, limit: pageSize });
      queryClient.setQueryData<TasksCache>(queryKey, (prev) => {
        const base = prev ?? cached;
        const seen = new Set(base.tasks.map((t) => t.id));
        const merged = [...base.tasks];
        for (const t of result.tasks) {
          if (!seen.has(t.id)) merged.push(t);
        }
        return {
          tasks: merged,
          total: result.total,
          hasMore: result.hasMore,
          page: nextPage,
        };
      });
    } catch (error) {
      console.error("Failed to load more tasks:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [queryClient, queryKey, pageSize, loadingMore]);

  const updateTaskStatus = useCallback(
    async (taskId: string, status: string) => {
      try {
        await statusMutation.mutateAsync({ taskId, status });
        return null;
      } catch (error) {
        return error as { message?: string };
      }
    },
    [statusMutation],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      try {
        await deleteMutation.mutateAsync(taskId);
        return null;
      } catch (error) {
        return error as { message?: string };
      }
    },
    [deleteMutation],
  );

  return {
    tasks: query.data?.tasks ?? [],
    /** True only on first load with no cached data — cached navigations stay instant. */
    loading: query.isLoading && !query.data,
    loadingMore,
    hasMore: query.data?.hasMore ?? false,
    total: query.data?.total ?? null,
    page: query.data?.page ?? 1,
    fetchTasks,
    loadMore,
    updateTaskStatus,
    deleteTask,
    isUpdatingStatus: statusMutation.isPending,
  };
}
