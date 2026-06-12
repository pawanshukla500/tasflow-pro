import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { type McpTool, objectSchema, type ToolContext } from "./types.ts";

const STATUSES = ["todo", "in_progress", "in_review", "done", "blocked"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

/** Enrich raw task rows with department name, assignee names, and subtask counts. */
async function enrich(client: SupabaseClient, tasks: Record<string, unknown>[]) {
  if (tasks.length === 0) return [];
  const ids = tasks.map((t) => t.id as string);
  const [deptsRes, assigneesRes, profilesRes, subtasksRes] = await Promise.all([
    client.from("departments").select("id, name"),
    client.from("task_assignees").select("task_id, user_id").in("task_id", ids),
    client.from("profiles").select("id, name"),
    client.from("task_subtasks").select("task_id, completed").in("task_id", ids),
  ]);
  const depts = deptsRes.data || [];
  const assignees = assigneesRes.data || [];
  const profiles = profilesRes.data || [];
  const subtasks = subtasksRes.data || [];

  return tasks.map((t) => {
    const dept = depts.find((d) => d.id === t.department_id);
    const ta = assignees
      .filter((a) => a.task_id === t.id)
      .map((a) => ({
        user_id: a.user_id,
        name: profiles.find((p) => p.id === a.user_id)?.name || "Unknown",
      }));
    const subs = subtasks.filter((s) => s.task_id === t.id);
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      start_date: t.start_date,
      department: dept?.name ?? null,
      department_id: t.department_id,
      assignees: ta,
      created_by: t.created_by,
      created_at: t.created_at,
      completed_at: t.completed_at,
      subtasks_done: subs.filter((s) => s.completed).length,
      subtasks_total: subs.length,
    };
  });
}

export const taskTools: McpTool[] = [
  {
    name: "list_tasks",
    description:
      "List tasks visible to the current user (scoped by their role). Optional filters by status, priority, or department.",
    inputSchema: objectSchema({
      status: { type: "string", enum: STATUSES, description: "Filter by task status." },
      priority: { type: "string", enum: PRIORITIES, description: "Filter by priority." },
      department_id: { type: "string", description: "Filter by department UUID." },
      limit: { type: "number", description: "Max rows (default 50, max 200)." },
    }),
    handler: async ({ client }, args) => {
      let q = client.from("tasks").select("*").order("created_at", { ascending: false });
      if (args.status) q = q.eq("status", String(args.status));
      if (args.priority) q = q.eq("priority", String(args.priority));
      if (args.department_id) q = q.eq("department_id", String(args.department_id));
      const limit = Math.min(Number(args.limit) || 50, 200);
      q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return enrich(client, data || []);
    },
  },
  {
    name: "list_my_tasks",
    description: "List tasks assigned to the current user.",
    inputSchema: objectSchema({
      include_done: { type: "boolean", description: "Include completed tasks (default false)." },
    }),
    handler: async ({ client, userId }, args) => {
      const { data: mine, error: aErr } = await client
        .from("task_assignees").select("task_id").eq("user_id", userId);
      if (aErr) throw new Error(aErr.message);
      const ids = (mine || []).map((m) => m.task_id);
      if (ids.length === 0) return [];
      let q = client.from("tasks").select("*").in("id", ids)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (!args.include_done) q = q.neq("status", "done");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return enrich(client, data || []);
    },
  },
  {
    name: "get_task",
    description: "Get a single task by id with its assignees and subtask counts.",
    inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]),
    handler: async ({ client }, args) => {
      const { data, error } = await client.from("tasks").select("*").eq("id", String(args.task_id)).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Task not found or not accessible");
      const [enriched] = await enrich(client, [data]);
      const { data: subs } = await client
        .from("task_subtasks").select("id, title, completed, position")
        .eq("task_id", String(args.task_id)).order("position");
      return { ...enriched, subtasks: subs || [] };
    },
  },
  {
    name: "create_task",
    description:
      "Create a task. Title is required. The current user becomes the creator. Optionally assign users and set due date / priority / department.",
    inputSchema: objectSchema(
      {
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: STATUSES, description: "Default 'todo'." },
        priority: { type: "string", enum: PRIORITIES, description: "Default 'medium'." },
        due_date: { type: "string", description: "ISO date (YYYY-MM-DD)." },
        department_id: {
          type: "string",
          description: "Department UUID. Defaults to your own department if omitted.",
        },
        assignee_ids: { type: "array", items: { type: "string" }, description: "User UUIDs to assign." },
      },
      ["title"],
    ),
    handler: async ({ client, userId }, args) => {
      // Default department + org to the creator's own. Required because a
      // department_manager may only create tasks within a department they manage,
      // so a task with no department fails RLS for non-admin/HR users.
      const { data: profile } = await client
        .from("profiles").select("department_id, organization_id").eq("id", userId).maybeSingle();
      const departmentId = args.department_id ? String(args.department_id) : (profile?.department_id ?? null);

      const { data: task, error } = await client
        .from("tasks")
        .insert({
          title: String(args.title),
          description: args.description ? String(args.description) : null,
          status: args.status ? String(args.status) : "todo",
          priority: args.priority ? String(args.priority) : "medium",
          due_date: args.due_date ? String(args.due_date) : null,
          department_id: departmentId,
          organization_id: profile?.organization_id ?? null,
          created_by: userId,
        })
        .select("*")
        .single();
      if (error) {
        throw new Error(
          `${error.message}. If you are a department manager, the task must be in a department you manage; ` +
          `employees cannot create tasks.`,
        );
      }

      const assigneeIds = Array.isArray(args.assignee_ids) ? (args.assignee_ids as string[]) : [];
      if (assigneeIds.length > 0) {
        const { error: aErr } = await client
          .from("task_assignees")
          .insert(assigneeIds.map((uid) => ({ task_id: task.id, user_id: uid })));
        if (aErr) throw new Error(`Task created but assignment failed: ${aErr.message}`);
      }
      const [enriched] = await enrich(client, [task]);
      return enriched;
    },
  },
  {
    name: "update_task",
    description: "Update fields on a task (title, description, status, priority, due_date, department_id).",
    inputSchema: objectSchema(
      {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: STATUSES },
        priority: { type: "string", enum: PRIORITIES },
        due_date: { type: "string", description: "ISO date, or empty string to clear." },
        department_id: { type: "string" },
      },
      ["task_id"],
    ),
    handler: async ({ client }, args) => {
      const patch: Record<string, unknown> = {};
      if (args.title !== undefined) patch.title = String(args.title);
      if (args.description !== undefined) patch.description = String(args.description) || null;
      if (args.status !== undefined) {
        patch.status = String(args.status);
        patch.completed_at = args.status === "done" ? new Date().toISOString() : null;
      }
      if (args.priority !== undefined) patch.priority = String(args.priority);
      if (args.due_date !== undefined) patch.due_date = String(args.due_date) || null;
      if (args.department_id !== undefined) patch.department_id = String(args.department_id) || null;
      if (Object.keys(patch).length === 0) throw new Error("No fields to update");

      const { data, error } = await client
        .from("tasks").update(patch).eq("id", String(args.task_id)).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Task not found or not allowed to update");
      const [enriched] = await enrich(client, [data]);
      return enriched;
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as done.",
    inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]),
    handler: async ({ client }, args) => {
      const { data, error } = await client
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", String(args.task_id)).select("id, title, status").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Task not found or not allowed");
      return data;
    },
  },
  {
    name: "delete_task",
    description: "Delete a task permanently.",
    inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.from("tasks").delete().eq("id", String(args.task_id));
      if (error) throw new Error(error.message);
      return { deleted: true, task_id: args.task_id };
    },
  },
  {
    name: "add_subtask",
    description: "Add a subtask (checklist item) to a task.",
    inputSchema: objectSchema(
      { task_id: { type: "string" }, title: { type: "string" } },
      ["task_id", "title"],
    ),
    handler: async ({ client }, args) => {
      const { data: existing } = await client
        .from("task_subtasks").select("position").eq("task_id", String(args.task_id))
        .order("position", { ascending: false }).limit(1);
      const position = (existing?.[0]?.position ?? -1) + 1;
      const { data, error } = await client
        .from("task_subtasks")
        .insert({ task_id: String(args.task_id), title: String(args.title), position })
        .select("id, title, completed, position").single();
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: "toggle_subtask",
    description: "Set a subtask's completed state.",
    inputSchema: objectSchema(
      { subtask_id: { type: "string" }, completed: { type: "boolean" } },
      ["subtask_id", "completed"],
    ),
    handler: async ({ client }, args) => {
      const { data, error } = await client
        .from("task_subtasks").update({ completed: Boolean(args.completed) })
        .eq("id", String(args.subtask_id)).select("id, title, completed").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Subtask not found or not allowed");
      return data;
    },
  },
];
