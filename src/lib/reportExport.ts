export type ReportTab = "Overview" | "Workflows" | "Performance" | "Tasks";

function cell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function line(values: Array<string | number | null | undefined>): string {
  return values.map(cell).join(",");
}

export function reportCsv(
  tab: ReportTab,
  data: {
    tasks: { title: string; status: string; priority: string; due_date: string | null; department_name: string | null }[];
    departments: { name: string; completion: number; total: number }[];
    stages: { name: string; avgHours: number; tat: number; total: number; breaches: number; breachRate: number }[];
    people: { name: string; position: string | null; score: number | null }[];
  },
): string {
  if (tab === "Workflows") {
    return [
      line(["Stage", "Avg hours", "TAT hours", "Runs", "Breaches", "Breach rate"]),
      ...data.stages.map((stage) => line([
        stage.name,
        stage.avgHours.toFixed(1),
        stage.tat,
        stage.total,
        stage.breaches,
        stage.breachRate,
      ])),
    ].join("\n");
  }
  if (tab === "Performance") {
    return [
      line(["Name", "Position", "Score"]),
      ...data.people.map((person) => line([person.name, person.position, person.score])),
    ].join("\n");
  }
  if (tab === "Overview") {
    return [
      line(["Department", "Completion %", "Tasks"]),
      ...data.departments.map((department) => line([department.name, department.completion, department.total])),
    ].join("\n");
  }
  return [
    line(["Title", "Status", "Priority", "Due Date", "Department"]),
    ...data.tasks.map((task) => line([task.title, task.status, task.priority, task.due_date, task.department_name])),
  ].join("\n");
}
