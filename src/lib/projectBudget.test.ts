import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterTasksForProject,
  formatBudget,
  formatHours,
  isUnknownColumnError,
  omitTaskHourColumns,
  parseNonNegativeNumber,
  projectMetricChips,
  sumProjectTaskHours,
} from "./projectBudget";

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");

describe("project budget and hours", () => {
  it("formats hours and INR budget", () => {
    expect(formatHours(4)).toBe("4h");
    expect(formatHours(1.5)).toBe("1.5h");
    expect(formatHours(1.25)).toBe("1.25h");
    expect(formatHours(1e-9)).toBe("1e-9h");
    expect(formatHours(null)).toBeNull();
    expect(formatBudget(50000, "INR")).toBe("INR 50,000");
    expect(parseNonNegativeNumber("-1")).toBeNull();
  });

  it("renders unset budget as an em dash in labeled chips", () => {
    expect(projectMetricChips({ budgetAmount: null, allocatedHours: null, estimatedHours: 0, loggedHours: 0 })).toEqual([
      { label: "Budget", value: "—" },
      { label: "Allocated", value: "—" },
      { label: "Estimated", value: "0h" },
      { label: "Logged", value: "0h" },
    ]);
    expect(projectMetricChips({ budgetAmount: 50000, budgetCurrency: "INR", allocatedHours: 80, estimatedHours: 4, loggedHours: 1 })).toEqual([
      { label: "Budget", value: "INR 50,000" },
      { label: "Allocated", value: "80h" },
      { label: "Estimated", value: "4h" },
      { label: "Logged", value: "1h" },
    ]);
    expect(projectMetricChips({ estimatedHours: 4, loggedHours: 1, hoursPending: true }).find((c) => c.label === "Estimated")?.value).toBe("…");
  });

  it("rolls up estimated and logged hours only for the given project", () => {
    const tasks = [
      { project_id: "p1", estimated_hours: 4, logged_hours: 1 },
      { project_id: "p1", estimated_hours: 2, logged_hours: 2 },
      { project_id: "p2", estimated_hours: 99, logged_hours: 99 },
      { project_id: null, estimated_hours: 8, logged_hours: 8 },
    ];
    expect(sumProjectTaskHours(tasks, "p1")).toEqual({ estimated: 6, logged: 3 });
    expect(filterTasksForProject(tasks, "p1")).toHaveLength(2);
    expect(filterTasksForProject(tasks, "p1").every((t) => t.project_id === "p1")).toBe(true);
  });

  it("omits hour columns so writes can retry against older schemas", () => {
    expect(isUnknownColumnError("Could not find the 'estimated_hours' column of 'tasks' in the schema cache")).toBe(true);
    expect(isUnknownColumnError("duplicate key")).toBe(false);
    expect(omitTaskHourColumns({ title: "A", estimated_hours: 4, logged_hours: 1 })).toEqual({ title: "A" });
  });

  it("rejects numeric NaN with <> because Postgres NaN = NaN is true", () => {
    const sql = readFileSync(
      resolve(migrationsDir, "20260906160000_numeric_nan_neq_budget_hours.sql"),
      "utf8",
    );
    expect(sql).toContain("budget_amount <> 'NaN'::numeric");
    expect(sql).toContain("allocated_hours <> 'NaN'::numeric");
    expect(sql).toContain("estimated_hours <> 'NaN'::numeric");
    expect(sql).toContain("logged_hours <> 'NaN'::numeric");
    expect(sql).not.toMatch(/budget_amount = budget_amount/);
  });
});
