import { type McpTool, objectSchema } from "./types.ts";

/** Today's date (YYYY-MM-DD) in IST, matching the app's date handling. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export const dashboardTools: McpTool[] = [
  {
    name: "get_dashboard",
    description:
      "Home dashboard summary for the current user: counts of visible tasks by status, due today, overdue, and tasks assigned to you.",
    inputSchema: objectSchema({}),
    handler: async ({ client, userId }) => {
      const today = istToday();
      const [tasksRes, mineRes] = await Promise.all([
        client.from("tasks").select("id, status, due_date"),
        client.from("task_assignees").select("task_id").eq("user_id", userId),
      ]);
      const tasks = tasksRes.data || [];
      const myIds = new Set((mineRes.data || []).map((m) => m.task_id));
      const open = tasks.filter((t) => t.status !== "done");
      return {
        today,
        total_visible: tasks.length,
        by_status: tasks.reduce((acc: Record<string, number>, t) => {
          acc[t.status] = (acc[t.status] || 0) + 1;
          return acc;
        }, {}),
        open: open.length,
        done: tasks.length - open.length,
        due_today: open.filter((t) => t.due_date === today).length,
        overdue: open.filter((t) => t.due_date && t.due_date < today).length,
        my_open_tasks: open.filter((t) => myIds.has(t.id)).length,
      };
    },
  },
  {
    name: "get_board",
    description: "Kanban board: tasks the user can see, grouped into status columns.",
    inputSchema: objectSchema({
      department_id: { type: "string", description: "Optional department UUID filter." },
    }),
    handler: async ({ client }, args) => {
      let q = client
        .from("tasks")
        .select("id, title, status, priority, due_date, department_id")
        .order("created_at", { ascending: false });
      if (args.department_id) q = q.eq("department_id", String(args.department_id));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const columns: Record<string, unknown[]> = { todo: [], in_progress: [], in_review: [], done: [], blocked: [] };
      for (const t of data || []) {
        (columns[t.status] ||= []).push({ id: t.id, title: t.title, priority: t.priority, due_date: t.due_date });
      }
      return columns;
    },
  },
  {
    name: "list_calendar",
    description:
      "Tasks with a due date in a range (calendar view). Defaults to the next 30 days if no range is given.",
    inputSchema: objectSchema({
      from: { type: "string", description: "Start date YYYY-MM-DD (inclusive). Default: today." },
      to: { type: "string", description: "End date YYYY-MM-DD (inclusive). Default: today + 30 days." },
    }),
    handler: async ({ client }, args) => {
      const from = args.from ? String(args.from) : istToday();
      const to = args.to
        ? String(args.to)
        : new Date(Date.now() + (5.5 * 3600 + 30 * 86400) * 1000).toISOString().slice(0, 10);
      const { data, error } = await client
        .from("tasks")
        .select("id, title, status, priority, due_date, department_id")
        .gte("due_date", from)
        .lte("due_date", to)
        .order("due_date", { ascending: true });
      if (error) throw new Error(error.message);
      return { from, to, tasks: data || [] };
    },
  },
];
