import { type McpTool, objectSchema, permissionError } from "./types.ts";

const PRIORITIES = ["low", "medium", "high", "urgent"];

// Goals (org goals, dept-scoped writes) + KRAs/KPIs (your own).

export const goalTools: McpTool[] = [
  {
    name: "list_goals",
    description: "List goals visible to the current user. Optional filters by status or department.",
    inputSchema: objectSchema({
      status: { type: "string", description: "Filter by status (e.g. active, completed, at_risk)." },
      department_id: { type: "string", description: "Filter by department UUID." },
    }),
    handler: async ({ client }, args) => {
      let q = client
        .from("goals")
        .select("id, title, description, category, status, priority, current_value, target_value, unit, deadline, department_id, created_at")
        .order("created_at", { ascending: false });
      if (args.status) q = q.eq("status", String(args.status));
      if (args.department_id) q = q.eq("department_id", String(args.department_id));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "get_goal",
    description: "Get a single goal by id.",
    inputSchema: objectSchema({ goal_id: { type: "string" } }, ["goal_id"]),
    handler: async ({ client }, args) => {
      const { data, error } = await client.from("goals").select("*").eq("id", String(args.goal_id)).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Goal not found or not accessible");
      return data;
    },
  },
  {
    name: "create_goal",
    description:
      "Create a goal. Requires admin/MD, or a department manager creating in a department they manage (defaults to your own department).",
    inputSchema: objectSchema(
      {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string", description: "Default 'general'." },
        target_value: { type: "number", description: "Default 100." },
        current_value: { type: "number", description: "Default 0." },
        unit: { type: "string", description: "e.g. %, tasks, ₹. Default '%'." },
        priority: { type: "string", enum: PRIORITIES, description: "Default 'medium'." },
        deadline: { type: "string", description: "ISO date (YYYY-MM-DD)." },
        department_id: { type: "string", description: "Department UUID. Defaults to your own department." },
      },
      ["title"],
    ),
    handler: async ({ client, userId }, args) => {
      const { data: profile } = await client
        .from("profiles").select("department_id").eq("id", userId).maybeSingle();
      const departmentId = args.department_id ? String(args.department_id) : (profile?.department_id ?? null);
      const { data, error } = await client
        .from("goals")
        .insert({
          title: String(args.title),
          description: args.description ? String(args.description) : null,
          category: args.category ? String(args.category) : "general",
          target_value: args.target_value !== undefined ? Number(args.target_value) : 100,
          current_value: args.current_value !== undefined ? Number(args.current_value) : 0,
          unit: args.unit ? String(args.unit) : "%",
          priority: args.priority ? String(args.priority) : "medium",
          deadline: args.deadline ? String(args.deadline) : null,
          department_id: departmentId,
          created_by: userId,
        })
        .select("*")
        .single();
      if (error) {
        throw new Error(
          `${error.message}. Goal creation needs admin/MD, or a manager creating in a department they manage.`,
        );
      }
      return data;
    },
  },
  {
    name: "update_goal",
    description: "Update fields on a goal (title, description, status, priority, target_value, deadline).",
    inputSchema: objectSchema(
      {
        goal_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string" },
        priority: { type: "string", enum: PRIORITIES },
        target_value: { type: "number" },
        deadline: { type: "string" },
      },
      ["goal_id"],
    ),
    handler: async ({ client, userId }, args) => {
      const patch: Record<string, unknown> = { updated_by: userId };
      if (args.title !== undefined) patch.title = String(args.title);
      if (args.description !== undefined) patch.description = String(args.description) || null;
      if (args.status !== undefined) patch.status = String(args.status);
      if (args.priority !== undefined) patch.priority = String(args.priority);
      if (args.target_value !== undefined) patch.target_value = Number(args.target_value);
      if (args.deadline !== undefined) patch.deadline = String(args.deadline) || null;
      const { data, error } = await client
        .from("goals").update(patch).eq("id", String(args.goal_id)).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Goal not found or not allowed to update");
      return data;
    },
  },
  {
    name: "update_goal_progress",
    description: "Set a goal's current progress value.",
    inputSchema: objectSchema(
      { goal_id: { type: "string" }, current_value: { type: "number" } },
      ["goal_id", "current_value"],
    ),
    handler: async ({ client, userId }, args) => {
      const { data, error } = await client
        .from("goals")
        .update({ current_value: Number(args.current_value), updated_by: userId })
        .eq("id", String(args.goal_id))
        .select("id, title, current_value, target_value, unit")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Goal not found or not allowed");
      return data;
    },
  },
  {
    name: "list_kras",
    description: "List Key Result Areas (KRAs) the current user can see.",
    inputSchema: objectSchema({}),
    handler: async ({ client }) => {
      const { data, error } = await client
        .from("kras").select("id, title, description, period, status, weight, target_date, user_id")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "list_kpis",
    description: "List KPIs the current user can see.",
    inputSchema: objectSchema({
      kra_id: { type: "string", description: "Optional: only KPIs under this KRA." },
    }),
    handler: async ({ client }, args) => {
      let q = client
        .from("kpis").select("id, title, metric, period, status, current_value, target_value, unit, kra_id, user_id")
        .order("created_at", { ascending: false });
      if (args.kra_id) q = q.eq("kra_id", String(args.kra_id));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "delete_goal",
    description: "Delete a goal. Requires admin/MD, or a manager of the goal's department.",
    inputSchema: objectSchema({ goal_id: { type: "string" } }, ["goal_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.from("goals").delete().eq("id", String(args.goal_id));
      if (error) throw permissionError(error, "delete this goal");
      return { deleted: true, goal_id: args.goal_id };
    },
  },
  // ── KRAs (your own; RLS: user_id = auth.uid()) ──────────────────────────────
  {
    name: "create_kra",
    description: "Create a Key Result Area (KRA) for yourself.",
    inputSchema: objectSchema(
      {
        title: { type: "string" },
        description: { type: "string" },
        period: { type: "string", description: "e.g. Q1-2026, monthly. Default 'quarterly'." },
        weight: { type: "number", description: "Relative weight. Default 1." },
        target_date: { type: "string", description: "ISO date (YYYY-MM-DD)." },
      },
      ["title"],
    ),
    handler: async ({ client, userId }, args) => {
      const { data, error } = await client
        .from("kras")
        .insert({
          user_id: userId,
          title: String(args.title),
          description: args.description ? String(args.description) : null,
          period: args.period ? String(args.period) : "quarterly",
          weight: args.weight !== undefined ? Number(args.weight) : 1,
          target_date: args.target_date ? String(args.target_date) : null,
        })
        .select("*")
        .single();
      if (error) throw permissionError(error, "create a KRA");
      return data;
    },
  },
  {
    name: "update_kra",
    description: "Update one of your KRAs.",
    inputSchema: objectSchema(
      {
        kra_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string" },
        weight: { type: "number" },
        target_date: { type: "string" },
      },
      ["kra_id"],
    ),
    handler: async ({ client }, args) => {
      const patch: Record<string, unknown> = {};
      if (args.title !== undefined) patch.title = String(args.title);
      if (args.description !== undefined) patch.description = String(args.description) || null;
      if (args.status !== undefined) patch.status = String(args.status);
      if (args.weight !== undefined) patch.weight = Number(args.weight);
      if (args.target_date !== undefined) patch.target_date = String(args.target_date) || null;
      const { data, error } = await client
        .from("kras").update(patch).eq("id", String(args.kra_id)).select("*").maybeSingle();
      if (error) throw permissionError(error, "update this KRA");
      if (!data) throw new Error("KRA not found or not yours");
      return data;
    },
  },
  {
    name: "delete_kra",
    description: "Delete one of your KRAs.",
    inputSchema: objectSchema({ kra_id: { type: "string" } }, ["kra_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.from("kras").delete().eq("id", String(args.kra_id));
      if (error) throw permissionError(error, "delete this KRA");
      return { deleted: true, kra_id: args.kra_id };
    },
  },
  // ── KPIs (your own; RLS: user_id = auth.uid()) ──────────────────────────────
  {
    name: "create_kpi",
    description: "Create a KPI for yourself, optionally linked to a KRA.",
    inputSchema: objectSchema(
      {
        title: { type: "string" },
        metric: { type: "string", description: "What is measured." },
        target_value: { type: "number", description: "Default 100." },
        current_value: { type: "number", description: "Default 0." },
        unit: { type: "string" },
        period: { type: "string", description: "Default 'monthly'." },
        kra_id: { type: "string", description: "Optional parent KRA." },
      },
      ["title"],
    ),
    handler: async ({ client, userId }, args) => {
      const { data, error } = await client
        .from("kpis")
        .insert({
          user_id: userId,
          title: String(args.title),
          metric: args.metric ? String(args.metric) : null,
          target_value: args.target_value !== undefined ? Number(args.target_value) : 100,
          current_value: args.current_value !== undefined ? Number(args.current_value) : 0,
          unit: args.unit ? String(args.unit) : null,
          period: args.period ? String(args.period) : "monthly",
          kra_id: args.kra_id ? String(args.kra_id) : null,
        })
        .select("*")
        .single();
      if (error) throw permissionError(error, "create a KPI");
      return data;
    },
  },
  {
    name: "update_kpi",
    description: "Update one of your KPIs (e.g. progress via current_value).",
    inputSchema: objectSchema(
      {
        kpi_id: { type: "string" },
        title: { type: "string" },
        metric: { type: "string" },
        status: { type: "string" },
        current_value: { type: "number" },
        target_value: { type: "number" },
        unit: { type: "string" },
      },
      ["kpi_id"],
    ),
    handler: async ({ client }, args) => {
      const patch: Record<string, unknown> = {};
      if (args.title !== undefined) patch.title = String(args.title);
      if (args.metric !== undefined) patch.metric = String(args.metric) || null;
      if (args.status !== undefined) patch.status = String(args.status);
      if (args.current_value !== undefined) patch.current_value = Number(args.current_value);
      if (args.target_value !== undefined) patch.target_value = Number(args.target_value);
      if (args.unit !== undefined) patch.unit = String(args.unit) || null;
      const { data, error } = await client
        .from("kpis").update(patch).eq("id", String(args.kpi_id)).select("*").maybeSingle();
      if (error) throw permissionError(error, "update this KPI");
      if (!data) throw new Error("KPI not found or not yours");
      return data;
    },
  },
  {
    name: "delete_kpi",
    description: "Delete one of your KPIs.",
    inputSchema: objectSchema({ kpi_id: { type: "string" } }, ["kpi_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.from("kpis").delete().eq("id", String(args.kpi_id));
      if (error) throw permissionError(error, "delete this KPI");
      return { deleted: true, kpi_id: args.kpi_id };
    },
  },
];
