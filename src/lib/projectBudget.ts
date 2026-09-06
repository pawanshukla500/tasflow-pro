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
  return `${String(n)}h`;
}

export function isUnknownColumnError(message: string | undefined): boolean {
  return /could not find|does not exist|PGRST204|42703|schema cache/i.test(message || "");
}

/** Drop hours fields so an insert/update can retry against a schema that lacks them. */
export function omitTaskHourColumns<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row };
  delete next.estimated_hours;
  delete next.logged_hours;
  return next;
}

export function formatBudget(amount: number | null | undefined, currency = "INR"): string | null {
  const n = parseNonNegativeNumber(amount);
  if (n == null) return null;
  const code = (currency || "INR").trim() || "INR";
  return `${code} ${n.toLocaleString("en-IN")}`;
}

export type ProjectMetricChip = { label: string; value: string };

/** Compact header chips. Unset money/hours use an em dash, never a jammed sentence. */
export function projectMetricChips(input: {
  budgetAmount?: number | null;
  budgetCurrency?: string;
  allocatedHours?: number | null;
  estimatedHours?: number | null;
  loggedHours?: number | null;
  /** True while task pages are still loading, so hour chips are not a partial sum. */
  hoursPending?: boolean;
}): ProjectMetricChip[] {
  const hourValue = (n: number | null | undefined) =>
    input.hoursPending ? "…" : formatHours(n) || "—";
  return [
    { label: "Budget", value: formatBudget(input.budgetAmount, input.budgetCurrency) || "—" },
    { label: "Allocated", value: formatHours(input.allocatedHours) || "—" },
    { label: "Estimated", value: hourValue(input.estimatedHours) },
    { label: "Logged", value: hourValue(input.loggedHours) },
  ];
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
