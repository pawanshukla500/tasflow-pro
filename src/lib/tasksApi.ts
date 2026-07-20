import { supabase } from "@/integrations/supabase/client";

/** Default page size — keeps initial payloads small. */
export const TASK_PAGE_SIZE = 50;
/** Hard cap per request to protect the DB / client. */
export const TASK_PAGE_SIZE_MAX = 100;

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
  /** Soft dependency graph — scrubbed when referenced tasks are deleted. */
  blocked_by?: string[];
  depends_on?: string[];
}

export type FetchTasksPageOptions = {
  /** 1-based page number (offset pagination). */
  page?: number;
  /** Rows per page (clamped to TASK_PAGE_SIZE_MAX). */
  limit?: number;
  /** Optional status filter. */
  status?: string;
  /** Optional department filter. */
  departmentId?: string | null;
  /** Cursor: fetch rows strictly older than this created_at (ISO). */
  cursorCreatedAt?: string | null;
  /** Cursor tie-breaker (UUID). */
  cursorId?: string | null;
};

export type FetchTasksPageResult = {
  tasks: TaskRow[];
  /** Total matching rows (when count is available). */
  total: number | null;
  page: number;
  limit: number;
  hasMore: boolean;
  /** Pass these into the next cursor page request. */
  nextCursor: { createdAt: string; id: string } | null;
};

type NestedAssignee = {
  user_id: string;
  profiles?: { id: string; name: string } | null;
};

type NestedTask = {
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
  frequency?: string;
  recurrence_parent_id?: string | null;
  requires_review?: boolean;
  reviewer_user_id?: string | null;
  review_note?: string | null;
  submitted_for_review_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  completed_on_time?: boolean | null;
  days_late?: number;
  blocked_by?: string[] | null;
  depends_on?: string[] | null;
  organization_id?: string | null;
  departments?: { id: string; name: string; color: string } | null;
  task_assignees?: NestedAssignee[] | null;
  task_subtasks?: { id: string; title: string; completed: boolean; position?: number }[] | null;
  task_attachments?: { count: number }[] | { id: string }[] | null;
  task_comments?: { count: number }[] | { id: string }[] | null;
  creator?: { id: string; name: string } | null;
};

function embedCount(rows: { count?: number; id?: string }[] | null | undefined): number {
  if (!rows?.length) return 0;
  const first = rows[0];
  if (typeof first.count === "number") return first.count;
  return rows.length;
}

const CORE_COLS = `
  id, title, description, status, priority, due_date, start_date,
  department_id, created_by, completed_at, created_at, updated_at,
  frequency, recurrence_parent_id,
  requires_review, reviewer_user_id, review_note,
  submitted_for_review_at, reviewed_at, reviewed_by,
  completed_on_time, days_late, organization_id
`.replace(/\s+/g, " ").trim();

const DEPS_COLS = `blocked_by, depends_on`;

const EMBEDS_WITH_PROFILE = `
  departments ( id, name, color ),
  task_assignees ( user_id, profiles ( id, name ) ),
  task_subtasks ( id, title, completed, position ),
  task_attachments ( count ),
  task_comments ( count )
`.replace(/\s+/g, " ").trim();

const EMBEDS_NO_PROFILE = `
  departments ( id, name, color ),
  task_assignees ( user_id ),
  task_subtasks ( id, title, completed, position ),
  task_attachments ( count ),
  task_comments ( count )
`.replace(/\s+/g, " ").trim();

const CREATOR_EMBED = `creator:profiles!tasks_created_by_profiles_fkey ( id, name )`;

/**
 * Progressive selects — production may not have applied the deps migration
 * or assignee→profiles FKs yet. Try richest shape first, then degrade.
 */
const TASK_SELECT_CANDIDATES = [
  `${CORE_COLS}, ${DEPS_COLS}, ${EMBEDS_WITH_PROFILE}, ${CREATOR_EMBED}`,
  `${CORE_COLS}, ${DEPS_COLS}, ${EMBEDS_WITH_PROFILE}`,
  `${CORE_COLS}, ${DEPS_COLS}, ${EMBEDS_NO_PROFILE}`,
  `${CORE_COLS}, ${EMBEDS_WITH_PROFILE}, ${CREATOR_EMBED}`,
  `${CORE_COLS}, ${EMBEDS_WITH_PROFILE}`,
  `${CORE_COLS}, ${EMBEDS_NO_PROFILE}`,
  `${CORE_COLS}, departments ( id, name, color ), task_assignees ( user_id )`,
  CORE_COLS,
];

export function mapEmbeddedTask(row: NestedTask): TaskRow {
  const subtasks = (row.task_subtasks || [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((s) => ({ id: s.id, title: s.title, completed: !!s.completed }));

  const assignees = (row.task_assignees || []).map((a) => ({
    user_id: a.user_id,
    name: a.profiles?.name || "Unknown",
  }));

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    due_date: row.due_date,
    start_date: row.start_date,
    department_id: row.department_id,
    created_by: row.created_by,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    frequency: row.frequency,
    recurrence_parent_id: row.recurrence_parent_id,
    requires_review: row.requires_review,
    reviewer_user_id: row.reviewer_user_id,
    review_note: row.review_note,
    submitted_for_review_at: row.submitted_for_review_at,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    completed_on_time: row.completed_on_time,
    days_late: row.days_late,
    blocked_by: row.blocked_by || [],
    depends_on: row.depends_on || [],
    department_name: row.departments?.name,
    department_color: row.departments?.color,
    assignees,
    creator_name: row.creator?.name,
    comment_count: embedCount(row.task_comments as { count?: number; id?: string }[] | null),
    attachment_count: embedCount(row.task_attachments as { count?: number; id?: string }[] | null),
    subtasks,
    subtask_done: subtasks.filter((s) => s.completed).length,
    subtask_total: subtasks.length,
  };
}

function isRecoverableSelectError(message: string): boolean {
  return /could not find|does not exist|PGRST204|PGRST200|42703|relationship/i.test(message);
}

async function hydrateAssigneeAndCreatorNames(tasks: TaskRow[]): Promise<TaskRow[]> {
  const missingIds = [
    ...new Set(
      tasks.flatMap((t) => {
        const ids: string[] = [];
        if (t.created_by && !t.creator_name) ids.push(t.created_by);
        for (const a of t.assignees) {
          if (!a.name || a.name === "Unknown") ids.push(a.user_id);
        }
        return ids;
      }),
    ),
  ];
  if (missingIds.length === 0) return tasks;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", missingIds);
  const byId = new Map((profiles || []).map((p) => [p.id, p.name]));

  return tasks.map((t) => ({
    ...t,
    creator_name: t.creator_name || (t.created_by ? byId.get(t.created_by) : undefined),
    assignees: t.assignees.map((a) => ({
      ...a,
      name: a.name !== "Unknown" ? a.name : byId.get(a.user_id) || "Unknown",
    })),
  }));
}

/**
 * Single-query task page with eager-loaded assignees, department (project),
 * subtasks, attachments, and comments — degrades if deps migration / FKs
 * are not yet applied on the remote database.
 */
export async function fetchTasksPage(
  options: FetchTasksPageOptions = {},
): Promise<FetchTasksPageResult> {
  const limit = Math.min(
    Math.max(1, options.limit ?? TASK_PAGE_SIZE),
    TASK_PAGE_SIZE_MAX,
  );
  const page = Math.max(1, options.page ?? 1);
  const offset = (page - 1) * limit;

  const buildQuery = (select: string) => {
    let q = supabase
      .from("tasks")
      .select(select, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (options.status) q = q.eq("status", options.status);
    if (options.departmentId) q = q.eq("department_id", options.departmentId);

    if (options.cursorCreatedAt && options.cursorId) {
      q = q.or(
        `created_at.lt.${options.cursorCreatedAt},and(created_at.eq.${options.cursorCreatedAt},id.lt.${options.cursorId})`,
      );
      q = q.limit(limit);
    } else {
      q = q.range(offset, offset + limit - 1);
    }
    return q;
  };

  let data: unknown = null;
  let error: { message: string } | null = null;
  let count: number | null = null;

  for (const select of TASK_SELECT_CANDIDATES) {
    const result = await buildQuery(select);
    data = result.data;
    error = result.error;
    count = typeof result.count === "number" ? result.count : null;
    if (!error) break;
    if (!isRecoverableSelectError(error.message)) break;
  }

  if (error) throw error;

  let tasks = ((data || []) as unknown as NestedTask[]).map(mapEmbeddedTask);
  tasks = await hydrateAssigneeAndCreatorNames(tasks);

  const total = typeof count === "number" ? count : null;
  const last = tasks[tasks.length - 1];
  const hasMore =
    total != null ? offset + tasks.length < total : tasks.length === limit;

  return {
    tasks,
    total,
    page,
    limit,
    hasMore,
    nextCursor: last
      ? { createdAt: last.created_at, id: last.id }
      : null,
  };
}

/**
 * Load up to `maxRows` tasks in paginated chunks (eager). Used by dashboards
 * that need a wider window without a single unbounded SELECT *.
 */
export async function fetchTasksBounded(
  maxRows = 300,
): Promise<{ tasks: TaskRow[]; total: number | null; hasMore: boolean }> {
  const out: TaskRow[] = [];
  let page = 1;
  let total: number | null = null;
  const limit = TASK_PAGE_SIZE_MAX;
  while (out.length < maxRows) {
    const result = await fetchTasksPage({ page, limit });
    total = result.total;
    out.push(...result.tasks);
    if (!result.hasMore || result.tasks.length === 0) {
      return { tasks: out, total, hasMore: false };
    }
    page += 1;
  }
  const tasks = out.slice(0, maxRows);
  const hasMore = total != null ? tasks.length < total : true;
  return { tasks, total, hasMore };
}
