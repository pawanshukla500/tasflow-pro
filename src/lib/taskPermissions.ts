import type { TaskRow } from "@/hooks/useTasks";

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
};

export const ALL_TASK_STATUSES = [
  "todo",
  "in_progress",
  "pending_review",
  "done",
  "blocked",
] as const;

export function isTaskAssignee(task: Pick<TaskRow, "assignees">, userId?: string | null): boolean {
  if (!userId) return false;
  return task.assignees.some((a) => a.user_id === userId);
}

/** Creator or Admin/MD may edit metadata and delete. */
export function canDeleteTask(
  task: Pick<TaskRow, "created_by">,
  userId?: string | null,
  isAdminOrMD = false,
): boolean {
  if (!userId) return false;
  return isAdminOrMD || task.created_by === userId;
}

export function canEditTaskMetadata(
  task: Pick<TaskRow, "created_by">,
  userId?: string | null,
  isAdminOrMD = false,
): boolean {
  return canDeleteTask(task, userId, isAdminOrMD);
}

/** Who may approve/reject a pending review. */
export function canReviewTask(
  task: Pick<TaskRow, "created_by" | "reviewer_user_id" | "department_id">,
  userId?: string | null,
  isAdminOrMD = false,
  managedDepartments: string[] = [],
): boolean {
  if (!userId) return false;
  if (isAdminOrMD) return true;
  if (task.created_by === userId) return true;
  if (task.reviewer_user_id === userId) return true;
  if (task.department_id && managedDepartments.includes(task.department_id)) return true;
  return false;
}

/** Status options shown in UI for the current user. */
export function allowedStatusesForUser(
  task: Pick<TaskRow, "requires_review" | "status" | "created_by" | "reviewer_user_id" | "department_id" | "assignees">,
  userId?: string | null,
  isAdminOrMD = false,
  managedDepartments: string[] = [],
): string[] {
  if (canEditTaskMetadata(task, userId, isAdminOrMD)) {
    return [...ALL_TASK_STATUSES];
  }

  if (task.status === "pending_review" && canReviewTask(task, userId, isAdminOrMD, managedDepartments)) {
    return ["pending_review", "in_progress", "todo", "blocked", "done"];
  }

  if (isTaskAssignee(task, userId)) {
    if (task.requires_review) {
      return ["todo", "in_progress", "blocked", "pending_review"];
    }
    return ["todo", "in_progress", "blocked", "done"];
  }

  return [];
}

export function canSubmitForReview(
  task: Pick<TaskRow, "requires_review" | "status" | "assignees">,
  userId?: string | null,
): boolean {
  return (
    !!task.requires_review &&
    isTaskAssignee(task, userId) &&
    task.status !== "pending_review" &&
    task.status !== "done"
  );
}

export function canApproveOrRejectReview(
  task: Pick<TaskRow, "status" | "created_by" | "reviewer_user_id" | "department_id">,
  userId?: string | null,
  isAdminOrMD = false,
  managedDepartments: string[] = [],
): boolean {
  return task.status === "pending_review" && canReviewTask(task, userId, isAdminOrMD, managedDepartments);
}

/** Assignees may request a due-date extension when work is blocked or delayed. */
export function canExtendTaskDueDate(
  task: Pick<TaskRow, "status" | "due_date" | "assignees" | "created_by">,
  userId?: string | null,
  isAdminOrMD = false,
): boolean {
  if (!userId || task.status === "done") return false;
  if (isAdminOrMD || task.created_by === userId) return true;
  return isTaskAssignee(task, userId);
}

export function maxTaskDueDateExtension(task: Pick<TaskRow, "due_date">): Date {
  const base = task.due_date ? new Date(task.due_date) : new Date();
  const max = new Date(base);
  max.setDate(max.getDate() + 30);
  return max;
}

export function minTaskDueDateExtension(task: Pick<TaskRow, "due_date">): Date {
  if (task.due_date) {
    const min = new Date(task.due_date);
    min.setDate(min.getDate() + 1);
    return min;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
