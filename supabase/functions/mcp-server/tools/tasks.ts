import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type McpTool, objectSchema, type ToolContext } from "./types.ts";

const STATUSES = ["todo", "in_progress", "in_review", "done", "blocked"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

const EMBED = `
  id, title, description, status, priority, due_date, start_date,
  department_id, created_by, completed_at, created_at,
  blocked_by, depends_on,
  departments ( id, name ),
  task_assignees ( user_id, profiles ( id, name ) ),
  task_subtasks ( id, title, completed, position )
`.replace(/\s+/g, " ").trim();

const EMBED_FALLBACKS = [
  EMBED,
  `
  id, title, description, status, priority, due_date, start_date,
  department_id, created_by, completed_at, created_at,
  blocked_by, depends_on,
  departments ( id, name ),
  task_assignees ( user_id ),
  task_subtasks ( id, title, completed, position )
`.replace(/\s+/g, " ").trim(),
  `
  id, title, description, status, priority, due_date, start_date,
  department_id, created_by, completed_at, created_at,
  departments ( id, name ),
  task_assignees ( user_id ),
  task_subtasks ( id, title, completed, position )
`.replace(/\s+/g, " ").trim(),
];

const EMBED_FALLBACK = EMBED_FALLBACKS[EMBED_FALLBACKS.length - 1];

function mapRow(t: Record<string, unknown>) {
  const dept = t.departments as { name?: string } | null;
  const assignees = ((t.task_assignees as { user_id: string; profiles?: { name?: string } | null }[]) || []).map(
    (a) => ({
      user_id: a.user_id,
      name: a.profiles?.name || "Unknown",
    }),
  );
  const subs = (t.task_subtasks as { completed?: boolean }[]) || [];
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
    assignees,
    created_by: t.created_by,
    created_at: t.created_at,
    completed_at: t.completed_at,
    blocked_by: (t.blocked_by as string[]) || [],
    depends_on: (t.depends_on as string[]) || [],
    subtasks_done: subs.filter((s) => s.completed).length,
    subtasks_total: subs.length,
  };
}

async function listEmbedded(
  client: SupabaseClient,
  apply: (q: ReturnType<SupabaseClient["from"]>) => ReturnType<SupabaseClient["from"]>,
  limit: number,
) {
  let data: unknown = null;
  let error: { message: string } | null = null;

  for (const select of EMBED_FALLBACKS) {
    // deno-lint-ignore no-explicit-any
    let q: any = client.from("tasks").select(select).order("created_at", { ascending: false }).limit(limit);
    q = apply(q);
    ({ data, error } = await q);
    if (!error) break;
    if (!/could not find|does not exist|PGRST200|42703|relationship/i.test(error.message)) break;
  }
  if (error) throw new Error(error.message);

  const rows = (data || []) as Record<string, unknown>[];

  // If assignee profiles were not nested, resolve names in one query.
  const needsNames = rows.some((r) =>
    ((r.task_assignees as { profiles?: unknown }[]) || []).some((a) => !a.profiles),
  );
  if (needsNames) {
    const userIds = [
      ...new Set(
        rows.flatMap((r) =>
          ((r.task_assignees as { user_id: string }[]) || []).map((a) => a.user_id),
        ),
      ),
    ];
    if (userIds.length) {
      const { data: profiles } = await client.from("profiles").select("id, name").in("id", userIds);
      const byId = new Map((profiles || []).map((p) => [p.id, p.name]));
      for (const r of rows) {
        r.task_assignees = ((r.task_assignees as { user_id: string }[]) || []).map((a) => ({
          user_id: a.user_id,
          profiles: { id: a.user_id, name: byId.get(a.user_id) || "Unknown" },
        }));
      }
    }
  }

  return rows.map(mapRow);
}

export const taskTools: McpTool[] = [
  {
    name: "list_tasks",
    description:
      "List tasks visible to the current user (scoped by their role). Optional filters by status, priority, or department. Paginated (default 50, max 100).",
    inputSchema: objectSchema({
      status: { type: "string", enum: STATUSES, description: "Filter by task status." },
      priority: { type: "string", enum: PRIORITIES, description: "Filter by priority." },
      department_id: { type: "string", description: "Filter by department UUID." },
      limit: { type: "number", description: "Max rows (default 50, max 100)." },
      offset: { type: "number", description: "Offset for pagination (default 0)." },
    }),
    handler: async ({ client }, args) => {
      const limit = Math.min(Math.max(1, Number(args.limit) || 50), 100);
      const offset = Math.max(0, Number(args.offset) || 0);
      return listEmbedded(
        client,
        (q) => {
          // deno-lint-ignore no-explicit-any
          let qq: any = q;
          if (args.status) qq = qq.eq("status", String(args.status));
          if (args.priority) qq = qq.eq("priority", String(args.priority));
          if (args.department_id) qq = qq.eq("department_id", String(args.department_id));
          return qq.range(offset, offset + limit - 1);
        },
        limit,
      );
    },
  },
  {
    name: "list_my_tasks",
    description: "List tasks assigned to the current user.",
    inputSchema: objectSchema({
      include_done: { type: "boolean", description: "Include completed tasks (default false)." },
      limit: { type: "number", description: "Max rows (default 50, max 100)." },
    }),
    handler: async ({ client, userId }, args) => {
      const { data: mine, error: aErr } = await client
        .from("task_assignees").select("task_id").eq("user_id", userId);
      if (aErr) throw new Error(aErr.message);
      const ids = (mine || []).map((m) => m.task_id);
      if (ids.length === 0) return [];
      const limit = Math.min(Math.max(1, Number(args.limit) || 50), 100);
      return listEmbedded(
        client,
        (q) => {
          // deno-lint-ignore no-explicit-any
          let qq: any = q.in("id", ids).order("due_date", { ascending: true, nullsFirst: false });
          if (!args.include_done) qq = qq.neq("status", "done");
          return qq.limit(limit);
        },
        limit,
      );
    },
  },
  {
    name: "get_task",
    description: "Get a single task by id with its assignees and subtasks (eager-loaded).",
    inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]),
    handler: async ({ client }, args) => {
      const rows = await listEmbedded(
        client,
        (q) => q.eq("id", String(args.task_id)).limit(1),
        1,
      );
      if (!rows[0]) throw new Error("Task not found or not accessible");
      const { data: subs } = await client
        .from("task_subtasks").select("id, title, completed, position")
        .eq("task_id", String(args.task_id)).order("position");
      return { ...rows[0], subtasks: subs || [] };
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
          description: "Department UUID. Defaults to the caller's department.",
        },
        assignee_ids: {
          type: "array",
          items: { type: "string" },
          description: "User UUIDs to assign.",
        },
        blocked_by: {
          type: "array",
          items: { type: "string" },
          description: "Task UUIDs that block this task.",
        },
        depends_on: {
          type: "array",
          items: { type: "string" },
          description: "Task UUIDs this task depends on.",
        },
      },
      ["title"],
    ),
    handler: async ({ client, userId }, args) => {
      const { data: profile } = await client
        .from("profiles").select("department_id, organization_id").eq("id", userId).maybeSingle();
      const status = STATUSES.includes(String(args.status || "")) ? String(args.status) : "todo";
      const priority = PRIORITIES.includes(String(args.priority || "")) ? String(args.priority) : "medium";
      const { data, error } = await client
        .from("tasks")
        .insert({
          title: String(args.title).trim(),
          description: args.description ? String(args.description) : null,
          status,
          priority,
          due_date: args.due_date ? String(args.due_date) : null,
          department_id: args.department_id ? String(args.department_id) : profile?.department_id ?? null,
          organization_id: profile?.organization_id ?? null,
          created_by: userId,
          blocked_by: Array.isArray(args.blocked_by) ? args.blocked_by.map(String) : [],
          depends_on: Array.isArray(args.depends_on) ? args.depends_on.map(String) : [],
        })
        .select("id, title, status, priority, due_date, department_id, created_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Task creation failed");

      const assigneeIds = Array.isArray(args.assignee_ids)
        ? [...new Set(args.assignee_ids.map(String))]
        : [];
      if (assigneeIds.length > 0) {
        const { error: aErr } = await client
          .from("task_assignees")
          .insert(assigneeIds.map((uid) => ({ task_id: data.id, user_id: uid })));
        if (aErr) throw new Error(aErr.message);
      }
      return data;
    },
  },
  {
    name: "update_task",
    description: "Update fields on an existing task the caller can edit.",
    inputSchema: objectSchema(
      {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: STATUSES },
        priority: { type: "string", enum: PRIORITIES },
        due_date: { type: "string" },
        blocked_by: { type: "array", items: { type: "string" } },
        depends_on: { type: "array", items: { type: "string" } },
      },
      ["task_id"],
    ),
    handler: async ({ client }, args) => {
      const patch: Record<string, unknown> = {};
      if (args.title != null) patch.title = String(args.title).trim();
      if (args.description != null) patch.description = String(args.description);
      if (args.status != null && STATUSES.includes(String(args.status))) patch.status = String(args.status);
      if (args.priority != null && PRIORITIES.includes(String(args.priority))) patch.priority = String(args.priority);
      if (args.due_date != null) patch.due_date = String(args.due_date);
      if (Array.isArray(args.blocked_by)) patch.blocked_by = args.blocked_by.map(String);
      if (Array.isArray(args.depends_on)) patch.depends_on = args.depends_on.map(String);
      if (Object.keys(patch).length === 0) throw new Error("No fields to update");

      const { data, error } = await client
        .from("tasks").update(patch).eq("id", String(args.task_id)).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Task not found or not editable");
      return data;
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
      if (!data) throw new Error("Task not found or not editable");
      return data;
    },
  },
  {
    name: "delete_task",
    description:
      "Delete a task. Dependency arrays on other tasks are scrubbed automatically by a database trigger.",
    inputSchema: objectSchema({ task_id: { type: "string" } }, ["task_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.from("tasks").delete().eq("id", String(args.task_id));
      if (error) throw new Error(error.message);
      return { deleted: true, task_id: String(args.task_id) };
    },
  },
  {
    name: "add_subtask",
    description: "Add a subtask to a task.",
    inputSchema: objectSchema(
      { task_id: { type: "string" }, title: { type: "string" } },
      ["task_id", "title"],
    ),
    handler: async ({ client }, args) => {
      const { data: last } = await client
        .from("task_subtasks").select("position").eq("task_id", String(args.task_id))
        .order("position", { ascending: false }).limit(1).maybeSingle();
      const position = (last?.position ?? -1) + 1;
      const { data, error } = await client
        .from("task_subtasks")
        .insert({
          task_id: String(args.task_id),
          title: String(args.title).trim(),
          position,
          completed: false,
        })
        .select("id, title, completed, position")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: "toggle_subtask",
    description: "Mark a subtask completed or not.",
    inputSchema: objectSchema(
      { subtask_id: { type: "string" }, completed: { type: "boolean" } },
      ["subtask_id", "completed"],
    ),
    handler: async ({ client }, args) => {
      const { data, error } = await client
        .from("task_subtasks").update({ completed: Boolean(args.completed) })
        .eq("id", String(args.subtask_id)).select("id, title, completed").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Subtask not found");
      return data;
    },
  },
];
