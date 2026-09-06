import { type McpTool, objectSchema } from "./types.ts";

export const projectTools: McpTool[] = [
  {
    name: "list_projects",
    description:
      "List workspace projects (AppFlowy-style spaces). Active projects by default; pass include_archived to include archived ones.",
    inputSchema: objectSchema({
      include_archived: { type: "boolean", description: "Include archived projects (default false)." },
    }),
    handler: async ({ client }, args) => {
      let q = client
        .from("projects")
        .select("id, name, description, icon, color, status, default_view, department_id, created_at")
        .order("created_at", { ascending: false });
      if (!args.include_archived) q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "get_project",
    description: "Get a project and counts of its tasks and workflows.",
    inputSchema: objectSchema({ project_id: { type: "string" } }, ["project_id"]),
    handler: async ({ client }, args) => {
      const id = String(args.project_id);
      const { data: project, error } = await client.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!project) throw new Error("Project not found or not accessible");
      const [taskRes, wfRes] = await Promise.all([
        client.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", id),
        client.from("workflows").select("id", { count: "exact", head: true }).eq("project_id", id),
      ]);
      if (taskRes.error) throw new Error(taskRes.error.message);
      if (wfRes.error) throw new Error(wfRes.error.message);
      return { ...project, task_count: taskRes.count ?? 0, workflow_count: wfRes.count ?? 0 };
    },
  },
  {
    name: "create_project",
    description: "Create a project space. Name is required. Optional icon (emoji), color, description, and default view.",
    inputSchema: objectSchema(
      {
        name: { type: "string" },
        description: { type: "string" },
        icon: { type: "string", description: "Emoji icon (default 📁)." },
        color: { type: "string", description: "Hex color (default #0D9488)." },
        department_id: { type: "string" },
        default_view: {
          type: "string",
          enum: ["board", "list", "calendar", "workflows"],
          description: "Default database view (default board).",
        },
      },
      ["name"],
    ),
    handler: async ({ client, userId, organizationId }, args) => {
      const name = String(args.name).trim();
      if (!name) throw new Error("Name is required");
      const views = ["board", "list", "calendar", "workflows"];
      const defaultView = views.includes(String(args.default_view || ""))
        ? String(args.default_view)
        : "board";
      const { data, error } = await client
        .from("projects")
        .insert({
          name,
          description: args.description ? String(args.description) : null,
          icon: args.icon ? String(args.icon).slice(0, 8) : "📁",
          color: args.color ? String(args.color) : "#0D9488",
          department_id: args.department_id ? String(args.department_id) : null,
          default_view: defaultView,
          organization_id: organizationId,
          created_by: userId,
        })
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Project creation failed");
      return data;
    },
  },
  {
    name: "update_project",
    description: "Update a project's name, description, icon, color, status, or default view.",
    inputSchema: objectSchema(
      {
        project_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        icon: { type: "string" },
        color: { type: "string" },
        status: { type: "string", enum: ["active", "archived"] },
        default_view: { type: "string", enum: ["board", "list", "calendar", "workflows"] },
      },
      ["project_id"],
    ),
    handler: async ({ client }, args) => {
      const patch: Record<string, unknown> = {};
      if (args.name != null) patch.name = String(args.name).trim();
      if (args.description != null) patch.description = String(args.description);
      if (args.icon != null) patch.icon = String(args.icon).slice(0, 8);
      if (args.color != null) patch.color = String(args.color);
      if (args.status === "active" || args.status === "archived") patch.status = args.status;
      if (["board", "list", "calendar", "workflows"].includes(String(args.default_view || ""))) {
        patch.default_view = String(args.default_view);
      }
      if (Object.keys(patch).length === 0) throw new Error("No fields to update");
      const { data, error } = await client
        .from("projects")
        .update(patch)
        .eq("id", String(args.project_id))
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Project not found or not editable");
      return data;
    },
  },
  {
    name: "list_project_sections",
    description: "List ordered sections (workstreams) inside a project.",
    inputSchema: objectSchema({ project_id: { type: "string" } }, ["project_id"]),
    handler: async ({ client }, args) => {
      const { data, error } = await client
        .from("project_sections")
        .select("id, project_id, title, description, sort_order, created_at")
        .eq("project_id", String(args.project_id))
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "create_project_section",
    description: "Add a named section to a project. Tasks can look up this section by ID.",
    inputSchema: objectSchema(
      {
        project_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
      ["project_id", "title"],
    ),
    handler: async ({ client, userId }, args) => {
      const title = String(args.title).trim();
      if (!title) throw new Error("Title is required");
      const projectId = String(args.project_id);
      const { data: last } = await client
        .from("project_sections")
        .select("sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await client
        .from("project_sections")
        .insert({
          project_id: projectId,
          title,
          description: args.description ? String(args.description) : null,
          sort_order: (last?.sort_order ?? -1) + 1,
          created_by: userId,
        })
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Section creation failed");
      return data;
    },
  },
  {
    name: "lookup_entities",
    description:
      "Search tasks and projects by title for wiki-style lookups ([[task:id|Label]] / [[project:id|Label]]).",
    inputSchema: objectSchema({
      query: { type: "string", description: "Search text. Prefix with task: or project: to limit kind." },
    }, ["query"]),
    handler: async ({ client }, args) => {
      const raw = String(args.query || "").trim();
      const kind = raw.toLowerCase().startsWith("task:")
        ? "task"
        : raw.toLowerCase().startsWith("project:")
          ? "project"
          : null;
      const q = raw.replace(/^(task|project):/i, "").trim();
      const like = q ? `%${q}%` : "%";
      const out: { kind: string; id: string; title: string; status?: string }[] = [];
      if (kind !== "task") {
        const { data, error } = await client.from("projects").select("id, name, status").eq("status", "active").ilike("name", like).limit(8);
        if (error) throw new Error(error.message);
        for (const row of data || []) out.push({ kind: "project", id: row.id, title: row.name, status: row.status });
      }
      if (kind !== "project") {
        const { data, error } = await client.from("tasks").select("id, title, status").ilike("title", like).limit(8);
        if (error) throw new Error(error.message);
        for (const row of data || []) out.push({ kind: "task", id: row.id, title: row.title, status: row.status });
      }
      return out;
    },
  },
];
