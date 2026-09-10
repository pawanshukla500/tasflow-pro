import { type McpTool, objectSchema, type ToolContext } from "./types.ts";
import { assigneeIdsForCaller, escapeIlikeExact } from "./assign.ts";

const STATUSES = ["todo", "in_progress", "in_review", "done", "blocked"];

async function findOrCreateProject(
  ctx: ToolContext,
  name: string,
  description?: string,
) {
  const { client, userId, organizationId } = ctx;
  const { data: existing, error: findErr } = await client
    .from("projects")
    .select("id, name, description, status")
    .eq("status", "active")
    .ilike("name", escapeIlikeExact(name))
    .limit(1)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (existing) return { project: existing, created: false };

  const { data: profile } = await client
    .from("profiles")
    .select("department_id")
    .eq("id", userId)
    .maybeSingle();

  const { data, error } = await client
    .from("projects")
    .insert({
      name,
      description: description || null,
      icon: "💻",
      color: "#0D9488",
      department_id: profile?.department_id ?? null,
      default_view: "board",
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id, name, description, status")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project creation failed");
  return { project: data, created: true };
}

export const codingWorkTools: McpTool[] = [
  {
    name: "sync_coding_work",
    description:
      "Call this when you start or continue coding. Finds or creates a TaskFlow project by name, then finds or creates a task assigned to the connected user on that project. Updates title/description/status so TaskFlow stays in sync. Defaults status to in_progress. Use complete_task or status=done when the work is finished.",
    inputSchema: objectSchema(
      {
        project_name: {
          type: "string",
          description: "TaskFlow project name (usually the git repo or product name).",
        },
        task_title: { type: "string", description: "Short task title for this piece of work." },
        task_description: {
          type: "string",
          description: "What you are doing (PR, files, outcome).",
        },
        status: {
          type: "string",
          enum: STATUSES,
          description: "Default in_progress. Use done when the work is finished.",
        },
      },
      ["project_name", "task_title"],
    ),
    handler: async (ctx, args) => {
      const { client, userId, organizationId } = ctx;
      const projectName = String(args.project_name).trim();
      const taskTitle = String(args.task_title).trim();
      if (!projectName) throw new Error("project_name is required");
      if (!taskTitle) throw new Error("task_title is required");
      const status = STATUSES.includes(String(args.status || ""))
        ? String(args.status)
        : "in_progress";
      const description = args.task_description ? String(args.task_description) : null;

      const { project, created: projectCreated } = await findOrCreateProject(
        ctx,
        projectName,
        description || undefined,
      );

      const { data: mine, error: aErr } = await client
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", userId);
      if (aErr) throw new Error(aErr.message);
      const myIds = (mine || []).map((m) => m.task_id);
      let existingTask: { id: string; title: string; status: string } | null = null;
      if (myIds.length > 0) {
        let q = client
          .from("tasks")
          .select("id, title, status")
          .eq("project_id", project.id)
          .ilike("title", escapeIlikeExact(taskTitle))
          .in("id", myIds)
          .order("created_at", { ascending: false })
          .limit(1);
        if (status !== "done") q = q.neq("status", "done");
        const { data, error } = await q.maybeSingle();
        if (error) throw new Error(error.message);
        existingTask = data;
      }

      if (existingTask) {
        const patch: Record<string, unknown> = { status };
        if (description != null) patch.description = description;
        if (status === "done") patch.completed_at = new Date().toISOString();
        const { data: updated, error: uErr } = await client
          .from("tasks")
          .update(patch)
          .eq("id", existingTask.id)
          .select("id, title, status, priority, due_date, project_id")
          .maybeSingle();
        if (uErr) throw new Error(uErr.message);
        return {
          project,
          project_created: projectCreated,
          task: updated,
          task_created: false,
          assigned_to: userId,
        };
      }

      const { data: profile } = await client
        .from("profiles")
        .select("department_id, organization_id")
        .eq("id", userId)
        .maybeSingle();
      const orgId = profile?.organization_id ?? organizationId ?? null;
      const insertRow: Record<string, unknown> = {
        title: taskTitle,
        description,
        status,
        priority: "medium",
        department_id: profile?.department_id ?? null,
        organization_id: orgId,
        created_by: userId,
        project_id: project.id,
        completed_at: status === "done" ? new Date().toISOString() : null,
      };
      const { data: task, error: tErr } = await client
        .from("tasks")
        .insert(insertRow)
        .select("id, title, status, priority, due_date, project_id")
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      if (!task) throw new Error("Task creation failed");

      const assignees = assigneeIdsForCaller(userId, null);
      const { error: asErr } = await client
        .from("task_assignees")
        .insert(assignees.map((uid) => ({ task_id: task.id, user_id: uid })));
      if (asErr) throw new Error(asErr.message);

      return {
        project,
        project_created: projectCreated,
        task,
        task_created: true,
        assigned_to: userId,
      };
    },
  },
];
