import { useState, useEffect, useMemo } from "react";
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { SEND_EMAIL_ON_TASK_IMPORT } from "@/lib/taskAssignmentNotify";
import { isUnknownColumnError, omitTaskHourColumns } from "@/lib/projectBudget";
import { filterProfilesInScope, resolveAccessScope } from "@/lib/accessControl";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDateIST } from "@/lib/time";
import {
  IMPORT_CHUNK_SIZE,
  TASK_IMPORT_HEADERS,
  TASK_IMPORT_TEMPLATE_FILENAME,
  buildTaskInsertRow,
  chunkRows,
  formatImportToast,
  isImportableRow,
  parseImportGrid,
  type ImportProfile,
  type ImportProject,
  type ParsedImportRow,
} from "@/lib/taskImport";

// exceljs (~23MB) and xlsx (~7MB) are loaded on demand — never in the initial bundle.
type XlsxModule = typeof import("xlsx");
let xlsxModule: XlsxModule | null = null;
async function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxModule) xlsxModule = await import("xlsx");
  return xlsxModule;
}

interface Props { onClose: () => void; onImported?: () => void; }

function hoursLabel(row: ParsedImportRow): string {
  const est = row.estimatedHours != null ? `${row.estimatedHours}h` : null;
  const logged = row.loggedHours != null ? `${row.loggedHours}h` : null;
  if (est && logged) return `${est} / ${logged}`;
  return est || logged || "—";
}

export default function ImportTasksModal({ onClose, onImported }: Props) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ImportProfile[]>([]);
  const [projects, setProjects] = useState<ImportProject[]>([]);
  const [lookupsReady, setLookupsReady] = useState(false);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const orgId = (user?.profile as { organization_id?: string | null } | undefined)?.organization_id;
    let projectQuery = supabase.from("projects").select("id, name, status");
    if (orgId) projectQuery = projectQuery.eq("organization_id", orgId);

    Promise.all([
      supabase.from("profiles").select("id, name, email, department_id").eq("active", true),
      projectQuery,
    ]).then(([profileRes, projectRes]) => {
      if (cancelled) return;
      const scoped = filterProfilesInScope(
        (profileRes.data || []) as ImportProfile[],
        resolveAccessScope(user),
        user?.id,
      );
      setProfiles(scoped);
      setProjects(
        ((projectRes.data || []) as ImportProject[]).filter((p) => !p.status || p.status === "active"),
      );
      setLookupsReady(true);
    });

    return () => { cancelled = true; };
  }, [user]);

  const downloadTemplate = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "TaskFlow Pro";
    const ws = wb.addWorksheet("Tasks");
    const members = wb.addWorksheet("Members");
    members.state = "hidden";

    members.addRow(["Name", "Email"]);
    profiles.forEach((p) => members.addRow([p.name, p.email]));

    ws.columns = [
      { header: TASK_IMPORT_HEADERS[0], key: "title", width: 36 },
      { header: TASK_IMPORT_HEADERS[1], key: "description", width: 44 },
      { header: TASK_IMPORT_HEADERS[2], key: "assignee", width: 26 },
      { header: TASK_IMPORT_HEADERS[3], key: "email", width: 28 },
      { header: TASK_IMPORT_HEADERS[4], key: "due", width: 14 },
      { header: TASK_IMPORT_HEADERS[5], key: "priority", width: 12 },
      { header: TASK_IMPORT_HEADERS[6], key: "status", width: 16 },
      { header: TASK_IMPORT_HEADERS[7], key: "project", width: 22 },
      { header: TASK_IMPORT_HEADERS[8], key: "estimated", width: 16 },
      { header: TASK_IMPORT_HEADERS[9], key: "logged", width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };

    ws.addRow([
      "Prepare Q2 sales report",
      "Compile sales numbers from all regions and prepare summary deck for MD review.",
      profiles[0]?.name || "Rahul Sharma",
      profiles[0]?.email || "",
      "30-Apr-2026",
      "medium",
      "todo",
      projects[0]?.name || "",
      "4",
      "0",
    ]);

    const lastMemberRow = profiles.length + 1;
    if (profiles.length > 0) {
      for (let row = 2; row <= 1000; row++) {
        ws.getCell(`C${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Members!$A$2:$A$${lastMemberRow}`],
          showErrorMessage: false,
          promptTitle: "Pick a teammate",
          prompt: "Choose from the list, or type names separated by commas for multiple assignees.",
          showInputMessage: true,
        } as never;
      }
    }
    for (let row = 2; row <= 1000; row++) {
      ws.getCell(`B${row}`).alignment = { wrapText: true, vertical: "top" };
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = TASK_IMPORT_TEMPLATE_FILENAME;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded — fill Title, then optional assignee, project, hours, and due date");
  };

  const handleFile = async (file: File) => {
    if (!lookupsReady) {
      toast.error("Still loading team and projects — try again in a moment");
      return;
    }
    setParsing(true);
    setFileName(file.name);
    try {
      const XLSX = await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const parsed = parseImportGrid(data, { profiles, projects, xlsx: XLSX });
      if (parsed.error) {
        toast.error(parsed.error);
        setParsing(false);
        return;
      }
      setRows(parsed.rows);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "unknown";
      toast.error("Could not read file: " + message);
    } finally {
      setParsing(false);
    }
  };

  const importable = useMemo(() => rows.filter(isImportableRow), [rows]);
  const stats = useMemo(() => {
    const ready = rows.filter((r) => r.rowStatus === "ready").length;
    const issues = rows.length - ready;
    const warnings = importable.filter((r) => r.warnings.length > 0 || r.rowStatus === "no-match").length;
    return { total: rows.length, ready, issues, warnings };
  }, [rows, importable]);

  const handleImport = async () => {
    if (importable.length === 0) { toast.error("Nothing to import"); return; }
    setImporting(true);
    const orgId = (user?.profile as { organization_id?: string | null } | undefined)?.organization_id ?? null;
    const creatorDepartmentId = user?.profile?.department_id ?? null;
    let ok = 0;

    const insertRow = async (r: ParsedImportRow): Promise<boolean> => {
      try {
        const payload = buildTaskInsertRow(r, {
          createdBy: user?.id || null,
          organizationId: orgId,
          creatorDepartmentId,
        });
        let { data: task, error } = await supabase.from("tasks").insert(payload as never).select("id").single();
        if (error && isUnknownColumnError(error.message) && ("estimated_hours" in payload || "logged_hours" in payload)) {
          ({ data: task, error } = await supabase
            .from("tasks")
            .insert(omitTaskHourColumns(payload) as never)
            .select("id")
            .single());
        }
        if (error || !task) {
          console.warn("import row failed", r.rowIdx, error);
          return false;
        }
        if (r.matched.length > 0) {
          const { error: assigneeError } = await supabase
            .from("task_assignees")
            .insert(r.matched.map((m) => ({ task_id: task.id, user_id: m.id })));
          if (assigneeError) {
            console.warn("import assignees failed; task kept unassigned", r.rowIdx, assigneeError);
            return true;
          }
          try {
            await invokeEdgeFunction("notify-task-assigned", {
              body: {
                taskId: task.id,
                assigneeUserIds: r.matched.map((m) => m.id),
                assignedByName: user?.profile?.name || user?.email || "A teammate",
                sendEmail: SEND_EMAIL_ON_TASK_IMPORT,
              },
            });
          } catch (e) {
            console.warn("notify-task-assigned failed", e);
          }
        }
        return true;
      } catch (e) {
        console.warn("import row err", e);
        return false;
      }
    };

    for (const chunk of chunkRows(importable, IMPORT_CHUNK_SIZE)) {
      const results = await Promise.all(chunk.map(insertRow));
      ok += results.filter(Boolean).length;
      setImportedCount(ok);
    }

    setImporting(false);
    toast.success(formatImportToast(ok, importable.length, stats.warnings));
    onImported?.();
    if (ok === importable.length) onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground/20 z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-lg border shadow-lg w-full max-w-5xl max-h-[90vh] flex flex-col animate-fade-in">
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />Import tasks from Excel / CSV
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Required: <strong>Title</strong>. Optional: Description, Assignee, Email, Due Date, Priority, Status, Project, Estimated hours, Logged hours.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {rows.length === 0 ? (
              <>
                <div className="flex items-center justify-between gap-2 bg-muted/40 border rounded-md px-3 py-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground">
                      Download the Excel template — headers, one example row, and a hidden Members list.
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0" disabled={!lookupsReady}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />Download template
                  </Button>
                </div>
                <label className="block border rounded-lg p-8 text-center cursor-pointer hover:border-foreground/30 transition-colors bg-muted/20">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground">Click to upload .xlsx, .xls or .csv</p>
                  <p className="text-xs text-muted-foreground mt-1">First row must be headers. Unmatched assignees import as unassigned.</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    disabled={!lookupsReady || parsing}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {!lookupsReady && <p className="text-xs text-muted-foreground mt-2">Loading team and projects…</p>}
                  {parsing && <p className="text-xs text-primary mt-2">Reading file…</p>}
                </label>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm bg-muted/40 rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{fileName}</span>
                    <Badge variant="secondary">{stats.total} rows</Badge>
                    <Badge variant="outline" className="border-success text-success">
                      <CheckCircle2 className="h-3 w-3 mr-1" />{stats.ready} ready
                    </Badge>
                    {stats.issues > 0 && (
                      <Badge variant="outline" className="border-warning text-warning">
                        <AlertCircle className="h-3 w-3 mr-1" />{stats.issues} need attention
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setRows([]); setFileName(""); }}>
                    Choose different file
                  </Button>
                </div>

                <div className="border rounded-md overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-2 py-2 w-10">#</th>
                        <th className="px-2 py-2">Title</th>
                        <th className="px-2 py-2 w-40">Assignees</th>
                        <th className="px-2 py-2 w-24">Due</th>
                        <th className="px-2 py-2 w-32">Project</th>
                        <th className="px-2 py-2 w-16">Priority</th>
                        <th className="px-2 py-2 w-20">Hours</th>
                        <th className="px-2 py-2 w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.rowIdx} className="border-t">
                          <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{r.rowIdx}</td>
                          <td className="px-2 py-1.5 text-foreground">
                            <div className="line-clamp-2">{r.title || "—"}</div>
                          </td>
                          <td className="px-2 py-1.5">
                            {r.matched.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {r.matched.map((m) => <Badge key={m.id} variant="secondary" className="text-[10px]">{m.name}</Badge>)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">{r.assigneeRaw || r.emailRaw || "Unassigned"}</span>
                            )}
                            {r.unmatched.length > 0 && (
                              <div className="text-[10px] text-warning mt-1">unmatched: {r.unmatched.join(", ")}</div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {r.dueDate ? (
                              <span className="text-foreground font-mono-num tabular-nums">
                                {formatDateIST(r.dueDate, { day: "2-digit", month: "short" })}
                              </span>
                            ) : <span className="text-warning">—</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            {r.projectName ? (
                              <span>{r.projectName}</span>
                            ) : r.projectRaw ? (
                              <span className="text-warning">{r.projectRaw}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 capitalize text-muted-foreground">{r.priority}</td>
                          <td className="px-2 py-1.5 font-mono-num tabular-nums text-muted-foreground">{hoursLabel(r)}</td>
                          <td className="px-2 py-1.5">
                            {r.rowStatus === "ready" && <Badge variant="outline" className="text-[10px] border-success text-success">ready</Badge>}
                            {r.rowStatus === "no-match" && <Badge variant="outline" className="text-[10px] border-warning text-warning">no-match</Badge>}
                            {r.rowStatus === "missing-title" && <Badge variant="outline" className="text-[10px] border-destructive text-destructive">missing-title</Badge>}
                            {r.warnings.length > 0 && r.rowStatus !== "missing-title" && (
                              <div className="text-[10px] text-warning mt-1">{r.warnings.join(" · ")}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Missing due date is a warning, not a skip. Unmatched assignees import as unassigned. Unknown projects are left blank.
                </p>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 p-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={importing || importable.length === 0}
            >
              {importing ? `Importing… (${importedCount})` : `Import ${importable.length} task${importable.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
