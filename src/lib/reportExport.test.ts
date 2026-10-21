import { describe, expect, it } from "vitest";
import { reportCsv } from "./reportExport";

const data = {
  tasks: [{ title: 'Say "hi"', status: "in_progress", priority: "high", due_date: "2026-10-21", department_name: "Ops" }],
  departments: [{ name: "Ops", completion: 50, total: 4 }],
  stages: [{ name: "Review", avgHours: 3.25, tat: 2, total: 4, breaches: 1, breachRate: 25 }],
  people: [{ name: "Ada", position: "Lead", score: 80 }],
};

describe("report export", () => {
  it("exports workflow stages from the Workflows view", () => {
    const csv = reportCsv("Workflows", data);
    expect(csv.startsWith('"Stage"')).toBe(true);
    expect(csv).toContain('"Review"');
    expect(csv).not.toContain('"Ada"');
  });

  it("exports scores from Performance and departments from Overview", () => {
    expect(reportCsv("Performance", data)).toContain('"Ada"');
    expect(reportCsv("Overview", data).startsWith('"Department"')).toBe(true);
  });

  it("escapes quotes in a task title", () => {
    expect(reportCsv("Tasks", data)).toContain('"Say ""hi"""');
  });
});
