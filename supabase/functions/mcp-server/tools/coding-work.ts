import { type McpTool, objectSchema, type ToolContext } from "./types.ts";
import {
  applyTaskWriteup,
  assigneeIdsForCaller,
  CODING_STATUSES,
  escapeIlikeExact,
  normalizeCodingStatus,
  taskDeepLink,
} from "./assign.ts";

const PRIORITIES = ["low", "medium", "high", "urgent"];

function appBaseUrl() {
  try {
    return (Deno.env.get("APP_URL") || "https://task.youthnic.shop").replace(/\/$/, "");
  } catch {
    return "https://task.youthnic.shop";
  }
}

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

async function ensureAssigned(
  client: ToolContext["client"],
  taskId: string,
  userId: string,
) {
  const { data, error } = await client
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;
  const { error: insErr } = await client
    .from("task_assignees")
    .insert({ task_id: taskId, user_id: userId });
  if (insErr && !/duplicate|unique|23505/i.test(insErr.message)) {
    throw new Error(insErr.message);
  }
}

async function addProgressComment(
  client: ToolContext["client"],
  taskId: string,
  userId: string,
  note: string | null,
) {
  if (!note) return;
  const { error } = await client.from("task_comments").insert({
    task_id: taskId,
    user_id: userId,
    body: note,
    comment_type: "note",
  });
  if (error) throw new Error(error.message);
}

type ExistingTask = {
  id: string;
  title: string;
  status: string;
  description: string | null;
  project_id: string | null;
};

async function findExistingTask(
  client: ToolContext["client"],
  opts: {
    userId: string;
    projectId: string;
    taskTitle: string;
    taskId?: string;
    includeDone: boolean;
  },
): Promise<ExistingTask | null> {
  if (opts.taskId) {
    const { data, error } = await client
      .from("tasks")
      .select("id, title, status, description, project_id")
      .eq("id", opts.taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  let q = client
    .from("tasks")
    .select("id, title, status, description, project_id, task_assignees!inner(user_id)")
    .eq("project_id", opts.projectId)
    .eq("task_assignees.user_id", opts.userId)
    .ilike("title", escapeIlikeExact(opts.taskTitle))
    .order("created_at", { ascending: false })
    .limit(1);
  if (!opts.includeDone) q = q.neq("status", "done");
  const { data, error } = await q.maybeSingle();
  if (error) {
    // Older PostgREST embeds can fail the inner join; fall back to assignee ids.
    if (!/could not find|does not exist|PGRST200|relationship/i.test(error.message)) {
      throw new Error(error.message);
    }
    const { data: mine, error: aErr } = await client
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", opts.userId);
    if (aErr) throw new Error(aErr.message);
    const myIds = (mine || []).map((m) => m.task_id);
    if (myIds.length === 0) return null;
    let fallback = client
      .from("tasks")
      .select("id, title, status, description, project_id")
      .eq("project_id", opts.projectId)
      .ilike("title", escapeIlikeExact(opts.taskTitle))
      .in("id", myIds)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!opts.includeDone) fallback = fallback.neq("status", "done");
    const retry = await fallback.maybeSingle();
    if (retry.error) throw new Error(retry.error.message);
    return retry.data;
  }
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    status: data.status,
    description: data.description,
    project_id: data.project_id,
  };
}

export const codingWorkTools: McpTool[] = [
  {
    name: "sync_coding_work",
    description:
      "Call this when you start or continue coding. Finds or creates a TaskFlow project by name, then finds or creates a task assigned to the connected user on that project. Pass progress_note (and optional task_id) on later calls so the same task stays updated. Defaults status to in_progress. Use status=done or complete_task when finished.",
    inputSchema: objectSchema(
      {
        project_name: {
          type: "string",
          description: "TaskFlow project name (usually the git repo or product name).",
        },
        task_title: { type: "string", description: "Short task title for this piece of work." },
        task_description: {
          type: "string",
          description: "Current write-up of the work (goal, files, PR). Replaces the task description.",
        },
        progress_note: {
          type: "string",
          description:
            "Short update to append (and store as a comment). Use this as you go so the task stays current.",
        },
        task_id: {
          type: "string",
          description: "Existing TaskFlow task UUID from a previous sync. Prefer this so updates hit the same task.",
        },
        status: {
          type: "string",
          enum: [...CODING_STATUSES],
          description: "Default in_progress. Use in_review when a PR is open, done when finished.",
        },
        priority: {
          type: "string",
          enum: PRIORITIES,
          description: "Optional. Default medium on create.",
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
      const status = normalizeCodingStatus(args.status);
      const descriptionArg = args.task_description != null ? String(args.task_description) : null;
      const progressNote = args.progress_note ? String(args.progress_note).trim() : null;
      const taskIdArg = args.task_id ? String(args.task_id).trim() : "";
      const priority = PRIORITIES.includes(String(args.priority || ""))
        ? String(args.priority)
        : null;

      const { project, created: projectCreated } = await findOrCreateProject(
        ctx,
        projectName,
        descriptionArg || undefined,
      );

      const existingTask = await findExistingTask(client, {
        userId,
        projectId: project.id,
        taskTitle,
        taskId: taskIdArg || undefined,
        includeDone: status === "done",
      });

      const now = new Date();
      const writeup = applyTaskWriteup(
        existingTask?.description,
        descriptionArg,
        progressNote,
        now,
      );

      if (existingTask) {
        const patch: Record<string, unknown> = { status, project_id: project.id };
        if (taskTitle && taskTitle !== existingTask.title) patch.title = taskTitle;
        if (writeup != null) patch.description = writeup;
        if (priority) patch.priority = priority;
        if (status === "done") patch.completed_at = now.toISOString();
        else if (existingTask.status === "done") patch.completed_at = null;
        const { data: updated, error: uErr } = await client
          .from("tasks")
          .update(patch)
          .eq("id", existingTask.id)
          .select("id, title, status, priority, due_date, project_id")
          .maybeSingle();
        if (uErr) throw new Error(uErr.message);
        await ensureAssigned(client, existingTask.id, userId);
        await addProgressComment(client, existingTask.id, userId, progressNote);
        return {
          project,
          project_created: projectCreated,
          task: updated,
          task_created: false,
          assigned_to: userId,
          task_url: taskDeepLink(existingTask.id, appBaseUrl()),
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
        description: writeup,
        status,
        priority: priority || "medium",
        department_id: profile?.department_id ?? null,
        organization_id: orgId,
        created_by: userId,
        project_id: project.id,
        completed_at: status === "done" ? now.toISOString() : null,
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
      await addProgressComment(client, task.id, userId, progressNote);

      return {
        project,
        project_created: projectCreated,
        task,
        task_created: true,
        assigned_to: userId,
        task_url: taskDeepLink(task.id, appBaseUrl()),
      };
    },
  },
];
