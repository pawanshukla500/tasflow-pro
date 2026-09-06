import { describe, expect, it } from "vitest";
import {
  TASK_IMPORT_HEADERS,
  chunkRows,
  formatImportToast,
  isImportableRow,
  parseImportGrid,
  taskToExportRow,
  type ExcelDateHelper,
  type ImportProfile,
  type ImportProject,
} from "./taskImport";

const xlsx: ExcelDateHelper = {
  SSF: { parse_date_code: () => undefined },
};

const members: ImportProfile[] = [
  { id: "u1", name: "Priya Shah", email: "priya@youthnic.shop", department_id: "d1" },
  { id: "u2", name: "Rahul Mehta", email: "rahul@youthnic.shop", department_id: "d2" },
];

const projects: ImportProject[] = [
  { id: "p1", name: "Website Redesign", status: "active" },
  { id: "p2", name: "Archived One", status: "archived" },
];

const parse = (grid: unknown[][]) => parseImportGrid(grid, { profiles: members, projects, xlsx }).rows;

describe("TASK_IMPORT_HEADERS", () => {
  it("includes Project and Estimated hours", () => {
    expect(TASK_IMPORT_HEADERS).toContain("Project");
    expect(TASK_IMPORT_HEADERS).toContain("Estimated hours");
    expect(TASK_IMPORT_HEADERS).toEqual([
      "Title",
      "Description",
      "Assignee",
      "Email",
      "Due Date",
      "Priority",
      "Status",
      "Project",
      "Estimated hours",
      "Logged hours",
    ]);
  });
});

describe("parseImportGrid", () => {
  it("maps Title, Project, Priority, and hours", () => {
    const rows = parse([
      ["Title", "Project", "Priority", "Estimated hours", "Logged hours", "Status"],
      ["Ship catalog", "Website Redesign", "high", "4", "1.5", "in_progress"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Ship catalog");
    expect(rows[0].projectId).toBe("p1");
    expect(rows[0].projectName).toBe("Website Redesign");
    expect(rows[0].priority).toBe("high");
    expect(rows[0].estimatedHours).toBe(4);
    expect(rows[0].loggedHours).toBe(1.5);
    expect(rows[0].status).toBe("in_progress");
    expect(rows[0].rowStatus).toBe("ready");
    expect(rows[0].warnings).toContain("No due date");
  });

  it("treats empty due as ready-with-warning, not a skip", () => {
    const rows = parse([
      ["Title", "Due Date"],
      ["No due yet", ""],
    ]);
    expect(rows[0].rowStatus).toBe("ready");
    expect(rows[0].dueDate).toBeNull();
    expect(rows[0].warnings).toContain("No due date");
    expect(isImportableRow(rows[0])).toBe(true);
  });

  it("does not throw on unknown project; imports with null project_id", () => {
    expect(() =>
      parse([
        ["Title", "Project"],
        ["Orphan task", "Does Not Exist"],
      ]),
    ).not.toThrow();
    const rows = parse([
      ["Title", "Project"],
      ["Orphan task", "Does Not Exist"],
    ]);
    expect(rows[0].projectId).toBeNull();
    expect(rows[0].warnings.some((w) => w.startsWith("Unknown project"))).toBe(true);
    expect(isImportableRow(rows[0])).toBe(true);
  });

  it("keeps unmatched assignees importable as unassigned", () => {
    const rows = parse([
      ["Title", "Assignee", "Email"],
      ["Unowned", "Nobody Here", "ghost@example.com"],
    ]);
    expect(rows[0].matched).toEqual([]);
    expect(rows[0].unmatched).toEqual(expect.arrayContaining(["Nobody Here", "ghost@example.com"]));
    expect(rows[0].unmatched).toHaveLength(2);
    expect(rows[0].rowStatus).toBe("no-match");
    expect(isImportableRow(rows[0])).toBe(true);
  });

  it("matches Particulars / Concerned Person aliases and Excel-style dates", () => {
    const rows = parse([
      ["Particulars", "Concerned Person", "Due Date"],
      ["Legacy title", "Priya Shah", "15-Mar-2026"],
    ]);
    expect(rows[0].title).toBe("Legacy title");
    expect(rows[0].matched.map((m) => m.id)).toEqual(["u1"]);
    expect(rows[0].dueDate).toBe("2026-03-15");
    expect(rows[0].rowStatus).toBe("ready");
  });

  it("skips archived projects when matching by name", () => {
    const rows = parse([
      ["Title", "Project"],
      ["Old work", "Archived One"],
    ]);
    expect(rows[0].projectId).toBeNull();
    expect(rows[0].warnings.some((w) => w.startsWith("Unknown project"))).toBe(true);
  });

  it("does not overflow invalid dates such as 31-Feb-2026", () => {
    const rows = parse([
      ["Title", "Due Date"],
      ["Bad date", "31-Feb-2026"],
    ]);
    expect(rows[0].dueDate).toBeNull();
    expect(rows[0].warnings).toContain("Invalid due date");
    expect(isImportableRow(rows[0])).toBe(true);
  });

  it("leaves colliding partial names unmatched instead of picking the first", () => {
    const rows = parseImportGrid(
      [
        ["Title", "Assignee"],
        ["Shared", "Priya"],
      ],
      {
        profiles: [
          ...members,
          { id: "u3", name: "Priya Singh", email: "priya.s@youthnic.shop", department_id: "d1" },
        ],
        projects,
        xlsx,
      },
    ).rows;
    expect(rows[0].matched).toEqual([]);
    expect(rows[0].unmatched).toContain("Priya");
    expect(rows[0].rowStatus).toBe("no-match");
    expect(isImportableRow(rows[0])).toBe(true);
  });
});

describe("chunkRows / toast", () => {
  it("chunks in 25s", () => {
    const items = Array.from({ length: 52 }, (_, i) => i);
    const chunks = chunkRows(items, 25);
    expect(chunks.map((c) => c.length)).toEqual([25, 25, 2]);
  });

  it("formats the import toast", () => {
    expect(formatImportToast(8, 10, 2)).toBe("Imported 8 of 10 (2 warnings)");
    expect(formatImportToast(10, 10, 0)).toBe("Imported 10 of 10");
  });

  it("writes assignee emails on export", () => {
    expect(
      taskToExportRow({
        title: "Ship catalog",
        assignees: [{ name: "Priya Shah", email: "priya@youthnic.shop" }],
      })[3],
    ).toBe("priya@youthnic.shop");
  });
});
