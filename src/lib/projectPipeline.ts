import { todayIST } from "@/lib/time";
import { isTaskInReview, normalizeTaskStatus } from "@/lib/taskStatus";

/** Kanban / pipeline statuses used on the project board. */
export const PROJECT_PIPELINE_STATUSES = [
  "todo",
  "in_progress",
  "pending_review",
  "done",
  "blocked",
] as const;

export type ProjectPipelineStatus = (typeof PROJECT_PIPELINE_STATUSES)[number];

export const PROJECT_FLOW_STEPS = [
  {
    id: "todo" as const,
    status: "todo" as ProjectPipelineStatus,
    label: "To Do",
    shortLabel: "To Do",
    description: "Not started yet",
    accent: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground",
    bar: "bg-muted-foreground/70",
    ring: "ring-muted-foreground/40",
  },
  {
    id: "in_progress" as const,
    status: "in_progress" as ProjectPipelineStatus,
    label: "In Progress",
    shortLabel: "Doing",
    description: "Actively being worked",
    accent: "bg-primary",
    chip: "bg-primary/12 text-primary",
    bar: "bg-primary",
    ring: "ring-primary/40",
  },
  {
    id: "pending_review" as const,
    status: "pending_review" as ProjectPipelineStatus,
    label: "Pending Review",
    shortLabel: "Review",
    description: "Waiting on review",
    accent: "bg-warning",
    chip: "bg-warning/15 text-warning",
    bar: "bg-warning",
    ring: "ring-warning/40",
  },
  {
    id: "done" as const,
    status: "done" as ProjectPipelineStatus,
    label: "Done",
    shortLabel: "Done",
    description: "Finished",
    accent: "bg-success",
    chip: "bg-success/12 text-success",
    bar: "bg-success",
    ring: "ring-success/40",
  },
] as const;

export const PROJECT_BLOCKED_STEP = {
  id: "blocked" as const,
  status: "blocked" as ProjectPipelineStatus,
  label: "Blocked",
  shortLabel: "Blocked",
  description: "Needs attention",
  accent: "bg-destructive",
  chip: "bg-destructive/12 text-destructive",
  bar: "bg-destructive",
  ring: "ring-destructive/40",
} as const;

/** All board columns: the four flow steps plus Blocked. */
export const PROJECT_BOARD_COLUMNS = [...PROJECT_FLOW_STEPS, PROJECT_BLOCKED_STEP] as const;

export type ProjectHealth = "not_started" | "in_progress" | "delayed" | "blocked" | "complete";

export type ProjectStatusCounts = Record<ProjectPipelineStatus, number>;

export interface ProjectPipelineSummary {
  total: number;
  done: number;
  open: number;
  overdue: number;
  percentComplete: number;
  currentStepId: ProjectPipelineStatus;
  health: ProjectHealth;
  healthLabel: string;
  counts: ProjectStatusCounts;
}

export function emptyStatusCounts(): ProjectStatusCounts {
  return {
    todo: 0,
    in_progress: 0,
    pending_review: 0,
    done: 0,
    blocked: 0,
  };
}

export function pipelineStatusOf(status: string): ProjectPipelineStatus {
  const normalized = normalizeTaskStatus(status);
  if ((PROJECT_PIPELINE_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as ProjectPipelineStatus;
  }
  return "todo";
}

export function taskMatchesStatus(status: string, column: ProjectPipelineStatus): boolean {
  if (column === "pending_review") return isTaskInReview(status);
  return pipelineStatusOf(status) === column;
}

export function countTasksByStatus(tasks: { status: string }[]): ProjectStatusCounts {
  const counts = emptyStatusCounts();
  for (const task of tasks) {
    counts[pipelineStatusOf(task.status)] += 1;
  }
  return counts;
}

export function isIncompleteOverdue(
  task: { status: string; due_date: string | null },
  today = todayIST(),
): boolean {
  if (pipelineStatusOf(task.status) === "done" || !task.due_date) return false;
  return task.due_date.slice(0, 10) < today;
}

function healthLabel(health: ProjectHealth): string {
  switch (health) {
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
    case "delayed":
      return "Delayed";
    case "in_progress":
      return "In progress";
    default:
      return "Not started";
  }
}

export function summarizeProjectPipeline(
  tasks: { status: string; due_date: string | null }[],
  today = todayIST(),
): ProjectPipelineSummary {
  const counts = countTasksByStatus(tasks);
  const total = tasks.length;
  const done = counts.done;
  const open = total - done;
  const overdue = tasks.filter((task) => isIncompleteOverdue(task, today)).length;
  const percentComplete = total === 0 ? 0 : Math.round((done / total) * 100);

  let health: ProjectHealth = "not_started";
  if (total === 0) {
    health = "not_started";
  } else if (open === 0) {
    health = "complete";
  } else if (counts.blocked > 0) {
    health = "blocked";
  } else if (overdue > 0) {
    health = "delayed";
  } else if (counts.in_progress > 0 || counts.pending_review > 0) {
    health = "in_progress";
  } else {
    health = "not_started";
  }

  let currentStepId: ProjectPipelineStatus = "todo";
  if (health === "complete") {
    currentStepId = "done";
  } else if (counts.in_progress > 0) {
    currentStepId = "in_progress";
  } else if (counts.pending_review > 0) {
    currentStepId = "pending_review";
  } else if (counts.todo > 0) {
    currentStepId = "todo";
  } else if (counts.blocked > 0) {
    currentStepId = "blocked";
  }

  return {
    total,
    done,
    open,
    overdue,
    percentComplete,
    currentStepId,
    health,
    healthLabel: healthLabel(health),
    counts,
  };
}

export function tasksInStatus<T extends { status: string }>(tasks: T[], status: ProjectPipelineStatus): T[] {
  return tasks.filter((task) => taskMatchesStatus(task.status, status));
}
