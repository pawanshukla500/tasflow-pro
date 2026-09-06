import { parseNonNegativeNumber } from "@/lib/projectBudget";
import { normalizeTaskStatus } from "@/lib/taskStatus";

export const TASK_IMPORT_HEADERS = [
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
] as const;

export const IMPORT_CHUNK_SIZE = 25;

export const HEADER_ALIASES: Record<string, string[]> = {
  title: ["particulars", "task", "title"],
  description: ["description", "details", "notes"],
  assignee: ["concerned person", "concerned", "doer", "assignee", "person", "owner"],
  email: ["email id", "email", "mail", "email address"],
  due: ["due date", "due", "deadline", "target date"],
  priority: ["priority"],
  status: ["status"],
  project: ["project name", "project"],
  estimated: ["estimated hours", "estimate hours", "est hours", "estimated"],
  logged: ["logged hours", "actual hours", "time spent", "logged"],
};

export type ImportRowStatus = "ready" | "missing-title" | "no-match";

export type ImportProfile = { id: string; name: string; email: string; department_id: string | null };
export type ImportProject = { id: string; name: string; status?: string | null };

export const TASK_IMPORT_TEMPLATE_FILENAME = "task-import-template.xlsx";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type ParsedImportRow = {
  rowIdx: number;
  title: string;
  description: string;
  assigneeRaw: string;
  emailRaw: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: string;
  projectRaw: string;
  projectId: string | null;
  projectName: string | null;
  estimatedHours: number | null;
  loggedHours: number | null;
  matched: { id: string; name: string; department_id: string | null }[];
  unmatched: string[];
  warnings: string[];
  rowStatus: ImportRowStatus;
};

export type ExcelDateHelper = {
  SSF: { parse_date_code: (n: number) => { y: number; m: number; d: number } | null | undefined };
};

export const normHeader = (s: string) => s.toLowerCase().trim().replace(/[\s_-]+/g, " ");

export function findColumn(headers: string[], aliases: string[]) {
  for (let i = 0; i < headers.length; i++) {
    const h = normHeader(headers[i] || "");
    if (aliases.some((a) => h === a || h.includes(a))) return i;
  }
  return -1;
}

function utcYmd(year: number, monthIndex: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return null;
  const dt = new Date(Date.UTC(year, monthIndex, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== monthIndex || dt.getUTCDate() !== day) return null;
  return dt.toISOString().split("T")[0];
}

export function cellHasValue(val: unknown): boolean {
  if (val === 0) return true;
  if (val == null) return false;
  return String(val).trim() !== "";
}

export function parseExcelDate(val: unknown, XLSX: ExcelDateHelper): string | null {
  if (!cellHasValue(val)) return null;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return utcYmd(d.y, d.m - 1, d.d);
    return null;
  }
  const s = String(val).trim();
  const m1 = s.match(/^(\d{1,2})[-\s/](\w{3,})[-\s/](\d{4})$/);
  if (m1) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monIdx = months.indexOf(m1[2].toLowerCase().slice(0, 3));
    if (monIdx >= 0) return utcYmd(parseInt(m1[3], 10), monIdx, parseInt(m1[1], 10));
  }
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m2) return utcYmd(parseInt(m2[3], 10), parseInt(m2[2], 10) - 1, parseInt(m2[1], 10));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return utcYmd(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return utcYmd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function splitNames(s: string): string[] {
  if (!s) return [];
  return s.split(/[,;|/]| and |\s{2,}/i).map((x) => x.trim()).filter(Boolean);
}

export function splitEmails(s: string): string[] {
  if (!s) return [];
  return s.split(/[,;|\s]+/).map((x) => x.trim()).filter((x) => x.includes("@"));
}

const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = new Set(["todo", "in_progress", "pending_review", "done", "blocked"]);

export function parsePriority(val: unknown): "low" | "medium" | "high" | "critical" {
  const s = String(val || "").trim().toLowerCase();
  return (PRIORITIES as readonly string[]).includes(s) ? (s as (typeof PRIORITIES)[number]) : "medium";
}

export function parseImportStatus(val: unknown): string {
  const raw = String(val || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) return "todo";
  const normalized = normalizeTaskStatus(raw === "complete" || raw === "completed" ? "done" : raw);
  return STATUSES.has(normalized) ? normalized : "todo";
}

function matchName(name: string, profiles: ImportProfile[]): ImportProfile | null {
  const needle = name.toLowerCase();
  const exact = profiles.filter((row) => row.name.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = profiles.filter((row) => {
    const n = row.name.toLowerCase();
    return n.includes(needle) || needle.includes(n);
  });
  return partial.length === 1 ? partial[0] : null;
}

function matchAssignees(
  names: string[],
  emails: string[],
  profiles: ImportProfile[],
): { matched: ImportProfile[]; unmatched: string[] } {
  const matched: ImportProfile[] = [];
  const unmatched: string[] = [];
  for (const e of emails) {
    const hits = profiles.filter((row) => row.email.toLowerCase() === e.toLowerCase());
    if (hits.length === 1) {
      if (!matched.find((m) => m.id === hits[0].id)) matched.push(hits[0]);
    } else if (e) {
      unmatched.push(e);
    }
  }
  for (const n of names) {
    const p = matchName(n, profiles);
    if (p) {
      if (!matched.find((m) => m.id === p.id)) matched.push(p);
    } else if (n) {
      unmatched.push(n);
    }
  }
  return { matched, unmatched };
}

function isActiveProject(project: ImportProject): boolean {
  const status = (project.status || "active").toLowerCase();
  return status === "active";
}

function matchProject(raw: string, projects: ImportProject[]): { id: string; name: string } | null {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  return (
    projects.find((p) => isActiveProject(p) && p.name.trim().toLowerCase() === needle) || null
  );
}

export function parseImportGrid(
  data: unknown[][],
  options: {
    profiles: ImportProfile[];
    projects: ImportProject[];
    xlsx: ExcelDateHelper;
  },
): { rows: ParsedImportRow[]; error?: string } {
  if (data.length < 2) return { rows: [], error: "File has no data rows" };
  const headers = (data[0] || []).map((x) => String(x || ""));
  const cTitle = findColumn(headers, HEADER_ALIASES.title);
  if (cTitle < 0) return { rows: [], error: "Could not find a Title / Particulars / Task column" };

  const cDescription = findColumn(headers, HEADER_ALIASES.description);
  const cAssignee = findColumn(headers, HEADER_ALIASES.assignee);
  const cEmail = findColumn(headers, HEADER_ALIASES.email);
  const cDue = findColumn(headers, HEADER_ALIASES.due);
  const cPriority = findColumn(headers, HEADER_ALIASES.priority);
  const cStatus = findColumn(headers, HEADER_ALIASES.status);
  const cProject = findColumn(headers, HEADER_ALIASES.project);
  const cEstimated = findColumn(headers, HEADER_ALIASES.estimated);
  const cLogged = findColumn(headers, HEADER_ALIASES.logged);

  const rows: ParsedImportRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const r = (data[i] || []) as unknown[];
    const title = String(r[cTitle] || "").trim();
    const description = cDescription >= 0 ? String(r[cDescription] || "").trim() : "";
    const assigneeRaw = cAssignee >= 0 ? String(r[cAssignee] || "").trim() : "";
    const emailRaw = cEmail >= 0 ? String(r[cEmail] || "").trim() : "";
    const projectRaw = cProject >= 0 ? String(r[cProject] || "").trim() : "";
    const dueRaw = cDue >= 0 ? r[cDue] : "";
    const dueDate = cDue >= 0 ? parseExcelDate(dueRaw, options.xlsx) : null;
    const priority = parsePriority(cPriority >= 0 ? r[cPriority] : "");
    const status = parseImportStatus(cStatus >= 0 ? r[cStatus] : "");
    const estimatedHours = cEstimated >= 0 ? parseNonNegativeNumber(r[cEstimated]) : null;
    const loggedHours = cLogged >= 0 ? parseNonNegativeNumber(r[cLogged]) : null;

    if (!title && !description && !assigneeRaw && !emailRaw && !projectRaw && !dueDate && !cellHasValue(dueRaw)) continue;

    const { matched, unmatched } = matchAssignees(splitNames(assigneeRaw), splitEmails(emailRaw), options.profiles);
    const project = matchProject(projectRaw, options.projects);
    const warnings: string[] = [];
    if (cellHasValue(dueRaw) && !dueDate) warnings.push("Invalid due date");
    else if (!dueDate) warnings.push("No due date");
    if (unmatched.length > 0) warnings.push(`Unmatched: ${unmatched.join(", ")}`);
    if (projectRaw && !project) warnings.push(`Unknown project: ${projectRaw}`);

    let rowStatus: ImportRowStatus = "ready";
    if (!title) rowStatus = "missing-title";
    else if (matched.length === 0 && (assigneeRaw || emailRaw)) rowStatus = "no-match";

    rows.push({
      rowIdx: i + 1,
      title,
      description,
      assigneeRaw,
      emailRaw,
      dueDate,
      priority,
      status,
      projectRaw,
      projectId: project?.id || null,
      projectName: project?.name || null,
      estimatedHours,
      loggedHours,
      matched,
      unmatched,
      warnings,
      rowStatus,
    });
  }
  return { rows };
}

export function isImportableRow(row: ParsedImportRow): boolean {
  return row.rowStatus !== "missing-title";
}

export function chunkRows<T>(items: T[], size = IMPORT_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function formatImportToast(imported: number, attempted: number, warnings: number): string {
  const base = `Imported ${imported} of ${attempted}`;
  return warnings > 0 ? `${base} (${warnings} warning${warnings === 1 ? "" : "s"})` : base;
}

export function formatImportDateCell(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  const month = MONTHS_SHORT[Number(m[2]) - 1];
  if (!month) return String(iso);
  return `${m[3]}-${month}-${m[1]}`;
}

export type ExportableTask = {
  title: string;
  description?: string | null;
  assignees?: { name: string; email?: string | null }[];
  due_date?: string | null;
  priority?: string | null;
  status?: string | null;
  project_name?: string | null;
  estimated_hours?: number | null;
  logged_hours?: number | null;
};

export function taskToExportRow(task: ExportableTask): string[] {
  return [
    task.title ?? "",
    task.description ?? "",
    (task.assignees ?? []).map((a) => a.name).filter(Boolean).join(", "),
    (task.assignees ?? []).map((a) => a.email).filter(Boolean).join(", "),
    formatImportDateCell(task.due_date),
    task.priority ?? "",
    task.status ?? "",
    task.project_name ?? "",
    task.estimated_hours != null ? String(task.estimated_hours) : "",
    task.logged_hours != null ? String(task.logged_hours) : "",
  ];
}

export function toCsv(headers: readonly string[], rows: string[][]): string {
  const esc = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map((row) => row.map(esc).join(","))].join("\n");
}

export function buildTaskInsertRow(
  row: ParsedImportRow,
  opts: {
    createdBy: string | null;
    organizationId: string | null;
    creatorDepartmentId: string | null;
  },
): Record<string, unknown> {
  const insertRow: Record<string, unknown> = {
    title: row.title,
    description: row.description || null,
    priority: row.priority,
    status: row.status,
    department_id: row.matched[0]?.department_id || opts.creatorDepartmentId || null,
    organization_id: opts.organizationId,
    due_date: row.dueDate,
    created_by: opts.createdBy,
    frequency: "none",
  };
  if (row.projectId) insertRow.project_id = row.projectId;
  if (row.estimatedHours != null) insertRow.estimated_hours = row.estimatedHours;
  if (row.loggedHours != null) insertRow.logged_hours = row.loggedHours;
  return insertRow;
}
