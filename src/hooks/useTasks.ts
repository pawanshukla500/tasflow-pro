import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  department_id: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  department_name?: string;
  department_color?: string;
  assignees: { user_id: string; name: string }[];
  creator_name?: string;
  comment_count?: number;
  attachment_count?: number;
  frequency?: string;
  recurrence_parent_id?: string | null;
  subtasks?: { id: string; title: string; completed: boolean }[];
  subtask_done?: number;
  subtask_total?: number;
  requires_review?: boolean;
  reviewer_user_id?: string | null;
  review_note?: string | null;
  submitted_for_review_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  completed_on_time?: boolean | null;
  days_late?: number;
}

export function useTasks() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const fetchTasks = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const [tasksRes, assigneesRes, deptsRes, profilesRes, subtasksRes, attachmentsRes] = await Promise.all([
        supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("task_assignees").select("task_id, user_id"),
        supabase.from("departments").select("id, name, color"),
        supabase.from("profiles").select("id, name"),
        supabase.from("task_subtasks").select("id, task_id, title, completed, position").order("position"),
        supabase.from("task_attachments").select("task_id"),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (assigneesRes.error) throw assigneesRes.error;

      const depts = deptsRes.data || [];
      const profiles = profilesRes.data || [];
      const assignees = assigneesRes.data || [];
      const allSubtasks = subtasksRes.error ? [] : (subtasksRes.data || []);
      const allAttachments = attachmentsRes.error ? [] : (attachmentsRes.data || []);

      const enriched: TaskRow[] = (tasksRes.data || []).map((t) => {
        const dept = depts.find((d) => d.id === t.department_id);
        const taskAssignees = assignees
          .filter((a) => a.task_id === t.id)
          .map((a) => {
            const p = profiles.find((p) => p.id === a.user_id);
            return { user_id: a.user_id, name: p?.name || "Unknown" };
          });
        const creator = profiles.find((p) => p.id === t.created_by);
        const subtasks = allSubtasks
          .filter((s) => s.task_id === t.id)
          .map((s) => ({ id: s.id, title: s.title, completed: s.completed }));
        const subtask_done = subtasks.filter((s) => s.completed).length;
        return {
          ...t,
          department_name: dept?.name,
          department_color: dept?.color,
          assignees: taskAssignees,
          creator_name: creator?.name,
          comment_count: 0,
          attachment_count: allAttachments.filter((a) => a.task_id === t.id).length,
          subtasks,
          subtask_done,
          subtask_total: subtasks.length,
        };
      });

      setTasks(enriched);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

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
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (!error) setTasks((prev) => prev.filter((t) => t.id !== taskId));
    return error;
  };

  return { tasks, loading, fetchTasks, updateTaskStatus, deleteTask };
}
