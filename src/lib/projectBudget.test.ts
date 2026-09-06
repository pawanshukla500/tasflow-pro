import { describe, expect, it } from "vitest";
import {
  filterTasksForProject,
  formatBudget,
  formatHours,
  isUnknownColumnError,
  omitTaskHourColumns,
  parseNonNegativeNumber,
  sumProjectTaskHours,
} from "./projectBudget";

describe("project budget and hours", () => {
  it("formats hours and INR budget", () => {
    expect(formatHours(4)).toBe("4h");
    expect(formatHours(1.5)).toBe("1.5h");
    expect(formatHours(1.25)).toBe("1.25h");
    expect(formatHours(null)).toBeNull();
    expect(formatBudget(50000, "INR")).toBe("INR 50,000");
    expect(parseNonNegativeNumber("-1")).toBeNull();
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
});
