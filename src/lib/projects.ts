/** AppFlowy-style space: icon + color + default database view. */
export const PROJECT_VIEWS = ["board", "list", "calendar", "workflows"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];

export const PROJECT_STATUSES = ["active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_COLOR_PRESETS = [
  "#0D9488",
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#3b82f6",
] as const;

export const PROJECT_ICON_PRESETS = [
  "📁",
  "🚀",
  "🎯",
  "🏗️",
  "💡",
  "📊",
  "🛠️",
  "🌟",
  "📦",
  "🧭",
] as const;

export interface ProjectRow {
  id: string;
  organization_id: string | null;
  department_id: string | null;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  status: ProjectStatus;
  default_view: ProjectView;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStats extends ProjectRow {
  openTaskCount: number;
  doneTaskCount: number;
  workflowCount: number;
  departmentName?: string;
}

export function isProjectView(value: string | null | undefined): value is ProjectView {
  return !!value && (PROJECT_VIEWS as readonly string[]).includes(value);
}

export function projectProgress(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

/** Remap retired Inbox deep-links onto Projects. */
export function remapRetiredInboxPath(path: string): string {
  if (path === "/inbox" || path.startsWith("/inbox/") || path.startsWith("/inbox?")) {
    return "/projects";
  }
  return path;
}
