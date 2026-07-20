import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type McpTool, objectSchema } from "./types.ts";

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

interface TaskRow {
  id: string; title: string; status: string; priority: string;
  due_date: string | null; department_id: string | null; created_by: string | null; created_at: string;
}

async function fetchTasks(client: SupabaseClient, args: Record<string, unknown>): Promise<TaskRow[]> {
  let q = client.from("tasks").select("id, title, status, priority, due_date, department_id, created_by, created_at");
  if (args.status) q = q.eq("status", String(args.status));
  if (args.department_id) q = q.eq("department_id", String(args.department_id));
  if (args.from) q = q.gte("created_at", String(args.from));
  if (args.to) q = q.lte("created_at", `${String(args.to)}T23:59:59`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as TaskRow[];
}

export const reportTools: McpTool[] = [
  {
    name: "get_report",
    description:
      "Task report over the data you can see (scoped by your role). Groups tasks by status, department, " +
      "priority, or assignee, with totals, completed, overdue, and completion rate.",
    inputSchema: objectSchema({
      group_by: { type: "string", enum: ["status", "department", "priority", "assignee"], description: "Default 'status'." },
      department_id: { type: "string" },
      from: { type: "string", description: "Created on/after (YYYY-MM-DD)." },
      to: { type: "string", description: "Created on/before (YYYY-MM-DD)." },
    }),
    handler: async ({ client }, args) => {
      const tasks = await fetchTasks(client, args);
      const today = istToday();
      const groupBy = (args.group_by ? String(args.group_by) : "status") as
        "status" | "department" | "priority" | "assignee";

      // Resolve display names for department / assignee grouping.
      let nameOf: (t: TaskRow) => Promise<string[]> = async (t) => [t[groupBy as "status" | "priority"] || "unknown"];
      if (groupBy === "department") {
        const { data: depts } = await client.from("departments").select("id, name");
        nameOf = async (t) => [(depts || []).find((d) => d.id === t.department_id)?.name || "No department"];
      } else if (groupBy === "assignee") {
        const ids = tasks.map((t) => t.id);
        const { data: asg } = ids.length
          ? await client.from("task_assignees").select("task_id, user_id").in("task_id", ids)
          : { data: [] };
        const { data: profiles } = await client.from("profiles").select("id, name");
        const byTask = new Map<string, string[]>();
        for (const a of asg || []) {
          const n = (profiles || []).find((p) => p.id === a.user_id)?.name || "Unknown";
          byTask.set(a.task_id, [...(byTask.get(a.task_id) || []), n]);
        }
        nameOf = async (t) => byTask.get(t.id) || ["Unassigned"];
      }

      const groups: Record<string, { total: number; done: number; overdue: number }> = {};
      for (const t of tasks) {
        const isDone = t.status === "done";
        const isOverdue = !isDone && !!t.due_date && t.due_date < today;
        for (const key of await nameOf(t)) {
          const g = (groups[key] ||= { total: 0, done: 0, overdue: 0 });
          g.total++;
          if (isDone) g.done++;
          if (isOverdue) g.overdue++;
        }
      }
      const rows = Object.entries(groups).map(([key, g]) => ({
        group: key, ...g,
        completion_rate: g.total ? Math.round((g.done / g.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total);

      return {
        group_by: groupBy,
        total_tasks: tasks.length,
        completed: tasks.filter((t) => t.status === "done").length,
        overdue: tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today).length,
        groups: rows,
      };
    },
  },
  {
    name: "export_tasks_csv",
    description: "Export the tasks you can see as CSV text (Title, Status, Priority, Due Date, Created).",
    inputSchema: objectSchema({
      status: { type: "string" },
      department_id: { type: "string" },
      from: { type: "string", description: "Created on/after (YYYY-MM-DD)." },
      to: { type: "string", description: "Created on/before (YYYY-MM-DD)." },
    }),
    handler: async ({ client }, args) => {
      const tasks = await fetchTasks(client, args);
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        "Title,Status,Priority,Due Date,Created",
        ...tasks.map((t) => [esc(t.title), t.status, t.priority, t.due_date || "", t.created_at].join(",")),
      ].join("\n");
      return { row_count: tasks.length, csv };
    },
  },
];
