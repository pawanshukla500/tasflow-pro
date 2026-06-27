import type { TaskRow } from "@/hooks/useTasks";

export type MyTasksTab = "assigned_to_me" | "assigned_by_me" | "unassigned" | "all";

export function resolveSubjectUserId(
  viewerUserId: string | null | undefined,
  canFilterByUser: boolean,
  userFilter: string,
): string | null {
  if (canFilterByUser && userFilter !== "all") return userFilter;
  return viewerUserId ?? null;
}

export function isTaskAssignedToUser(task: TaskRow, userId: string | null): boolean {
  return !!userId && task.assignees.some((assignee) => assignee.user_id === userId);
}

export function isTaskAssignedByUser(task: TaskRow, userId: string | null): boolean {
  return !!userId && task.created_by === userId;
}

export function filterMyTasksView(
  tasks: TaskRow[],
  options: {
    activeTab: MyTasksTab;
    search: string;
    subjectUserId: string | null;
    canFilterByUser: boolean;
    userFilter: string;
  },
): TaskRow[] {
  const { activeTab, search, subjectUserId, canFilterByUser, userFilter } = options;

  return tasks.filter((task) => {
    if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTab === "assigned_to_me" && !isTaskAssignedToUser(task, subjectUserId)) return false;
    if (activeTab === "assigned_by_me" && !isTaskAssignedByUser(task, subjectUserId)) return false;
    if (activeTab === "unassigned" && task.assignees.length > 0) return false;
    if (canFilterByUser && userFilter !== "all") {
      const matchesUser =
        isTaskAssignedToUser(task, userFilter) || isTaskAssignedByUser(task, userFilter);
      if (!matchesUser) return false;
    }
    return true;
  });
}

export function myTasksTabCounts(
  tasks: TaskRow[],
  subjectUserId: string | null,
  options?: { canFilterByUser?: boolean; userFilter?: string },
) {
  const scopedTasks =
    options?.canFilterByUser && options.userFilter && options.userFilter !== "all"
      ? tasks.filter(
          (task) =>
            isTaskAssignedToUser(task, options.userFilter!) ||
            isTaskAssignedByUser(task, options.userFilter!),
        )
      : tasks;

  return {
    assigned_to_me: scopedTasks.filter((task) => isTaskAssignedToUser(task, subjectUserId)).length,
    assigned_by_me: scopedTasks.filter((task) => isTaskAssignedByUser(task, subjectUserId)).length,
    unassigned: scopedTasks.filter((task) => task.assignees.length === 0).length,
    all: scopedTasks.length,
  };
}
