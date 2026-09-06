/** Budget and time totals that belong to a single project. */

export function parseNonNegativeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function formatHours(value: number | null | undefined): string | null {
  const n = parseNonNegativeNumber(value);
  if (n == null) return null;
  const label = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  return `${label}h`;
}

export function formatBudget(amount: number | null | undefined, currency = "INR"): string | null {
  const n = parseNonNegativeNumber(amount);
  if (n == null) return null;
  const code = (currency || "INR").trim() || "INR";
  return `${code} ${n.toLocaleString("en-IN")}`;
}

export type ProjectHourTask = {
  project_id?: string | null;
  estimated_hours?: number | null;
  logged_hours?: number | null;
};

/** Sums hours only for tasks whose project_id matches. Never includes other projects. */
export function sumProjectTaskHours(tasks: ProjectHourTask[], projectId: string): {
  estimated: number;
  logged: number;
} {
  let estimated = 0;
  let logged = 0;
  for (const task of tasks) {
    if (task.project_id !== projectId) continue;
    estimated += parseNonNegativeNumber(task.estimated_hours) || 0;
    logged += parseNonNegativeNumber(task.logged_hours) || 0;
  }
  return { estimated, logged };
}

export function filterTasksForProject<T extends { project_id?: string | null }>(
  tasks: T[],
  projectId: string,
): T[] {
  return tasks.filter((task) => task.project_id === projectId);
}
