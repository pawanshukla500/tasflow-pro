import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDateIST } from "@/lib/time";

interface Props { onClose: () => void; onImported?: () => void; }
interface ParsedRow {
  rowIdx: number;
  particulars: string;
  description: string;
  concernedRaw: string;
  emailRaw: string;
  dueDate: string | null;
  matched: { id: string; name: string; department_id: string | null }[];
  unmatched: string[];
  status: "ready" | "missing-title" | "missing-due" | "no-match";
}
interface Profile { id: string; name: string; email: string; department_id: string | null; }

const HEADER_ALIASES: Record<string, string[]> = {
  particulars: ["particulars", "task", "title"],
  description: ["description", "details", "notes"],
  concerned:   ["concerned person", "concerned", "doer", "assignee", "person", "owner", "name"],
  email:       ["email id", "email", "mail", "email address"],
  due:         ["due date", "due", "deadline", "target date"],
};

const normHeader = (s: string) => s.toLowerCase().trim().replace(/[\s_-]+/g, " ");

const findColumn = (headers: string[], aliases: string[]) => {
  for (let i = 0; i < headers.length; i++) {
    const h = normHeader(headers[i] || "");
    if (aliases.some(a => h === a || h.includes(a))) return i;
  }
  return -1;
};

const parseDate = (val: any): string | null => {
  if (!val && val !== 0) return null;
  // Excel serial number
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const iso = new Date(Date.UTC(d.y, d.m - 1, d.d));
      return iso.toISOString().split("T")[0];
    }
  }
  const s = String(val).trim();
  if (!s) return null;
  // dd-MMM-yyyy e.g. 20-Apr-2026
  const m1 = s.match(/^(\d{1,2})[-\s\/](\w{3,})[-\s\/](\d{4})$/);
  if (m1) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const monIdx = months.indexOf(m1[2].toLowerCase().slice(0, 3));
    if (monIdx >= 0) {
      const d = new Date(Date.UTC(parseInt(m1[3]), monIdx, parseInt(m1[1])));
      return d.toISOString().split("T")[0];
    }
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const m2 = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m2) {
    const d = new Date(Date.UTC(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1])));
    return d.toISOString().split("T")[0];
  }
  // ISO yyyy-mm-dd or anything Date can parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
};

const splitNames = (s: string): string[] => {
  if (!s) return [];
  return s.split(/[,;|\/]| and |\s{2,}/i).map(x => x.trim()).filter(Boolean);
};

const splitEmails = (s: string): string[] => {
  if (!s) return [];
  return s.split(/[,;|\s]+/).map(x => x.trim()).filter(x => x.includes("@"));
};

export default function ImportTasksModal({ onClose, onImported }: Props) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    supabase.from("profiles").select("id, name, email, department_id").eq("active", true)
      .then(r => setProfiles((r.data || []) as Profile[]));
  }, []);

  const downloadTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "TaskFlow Pro";
    const ws = wb.addWorksheet("Tasks");
    const members = wb.addWorksheet("Members"); // hidden helper sheet for dropdown source
    members.state = "hidden";

    // Populate Members sheet with team names + emails (for reference)
    members.addRow(["Name", "Email"]);
    profiles.forEach((p) => members.addRow([p.name, p.email]));

    ws.columns = [
      { header: "Particulars", key: "particulars", width: 38 },
      { header: "Description", key: "description", width: 44 },
      { header: "Concerned Person", key: "concerned", width: 26 },
      { header: "Due Date", key: "due", width: 14 },
    ];
    // Header styling
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };

    // Sample rows (no email — user is matched by name only)
    const samples: Array<[string, string, string, string]> = [
      ["Prepare Q2 sales report", "Compile sales numbers from all regions and prepare summary deck for MD review.", profiles[0]?.name || "Rahul Sharma", "30-Apr-2026"],
      ["Verify Myntra shipment docs", "Cross-check invoice, packing list, and BOE for Myntra PO #4521.", profiles[1]?.name || "Priya Singh", "05-May-2026"],
      ["", "", "", ""],
    ];
    samples.forEach((r) => ws.addRow(r));

    // Data validation: dropdown for Concerned Person column (C) referencing Members!A2:A{n}
    const lastMemberRow = profiles.length + 1; // header + N
    if (profiles.length > 0) {
      for (let row = 2; row <= 1000; row++) {
        ws.getCell(`C${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Members!$A$2:$A$${lastMemberRow}`],
          showErrorMessage: false, // allow free-text too (commas for multi-assignee)
          promptTitle: "Pick a teammate",
          prompt: "Choose from the list, or type names separated by commas for multiple assignees.",
          showInputMessage: true,
        } as any;
      }
    }
    // Wrap text on Description column
    for (let row = 2; row <= 1000; row++) {
      ws.getCell(`B${row}`).alignment = { wrapText: true, vertical: "top" };
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "task-import-template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded — assignees are picked from the team-name dropdown");
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (data.length < 2) {
        toast.error("File has no data rows");
        setParsing(false);
        return;
      }
      const headers = (data[0] as any[]).map(x => String(x || ""));
      const cParticulars = findColumn(headers, HEADER_ALIASES.particulars);
      const cDescription = findColumn(headers, HEADER_ALIASES.description);
      const cConcerned = findColumn(headers, HEADER_ALIASES.concerned);
      const cEmail = findColumn(headers, HEADER_ALIASES.email);
      const cDue = findColumn(headers, HEADER_ALIASES.due);

      if (cParticulars < 0) {
        toast.error("Could not find a 'Particulars' / 'Task' / 'Title' column");
        setParsing(false);
        return;
      }

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < data.length; i++) {
        const r = data[i] || [];
        const particulars = String(r[cParticulars] || "").trim();
        if (!particulars) continue;

        const description = cDescription >= 0 ? String(r[cDescription] || "").trim() : "";
        const concernedRaw = cConcerned >= 0 ? String(r[cConcerned] || "").trim() : "";
        const emailRaw = cEmail >= 0 ? String(r[cEmail] || "").trim() : "";
        const dueDate = cDue >= 0 ? parseDate(r[cDue]) : null;

        const names = splitNames(concernedRaw);
        const emails = splitEmails(emailRaw);

        const matched: { id: string; name: string; department_id: string | null }[] = [];
        const unmatched: string[] = [];

        // Match by email first (more reliable)
        for (const e of emails) {
          const p = profiles.find(p => p.email.toLowerCase() === e.toLowerCase());
          if (p && !matched.find(m => m.id === p.id)) matched.push(p);
        }
        // Then by name (case-insensitive contains either way)
        for (const n of names) {
          const nl = n.toLowerCase();
          const p = profiles.find(p =>
            p.name.toLowerCase() === nl ||
            p.name.toLowerCase().includes(nl) ||
            nl.includes(p.name.toLowerCase().split(" ")[0])
          );
          if (p) {
            if (!matched.find(m => m.id === p.id)) matched.push(p);
          } else if (n) {
            unmatched.push(n);
          }
        }

        let status: ParsedRow["status"] = "ready";
        if (!particulars) status = "missing-title";
        else if (!dueDate) status = "missing-due";
        else if (matched.length === 0) status = "no-match";

        parsed.push({
          rowIdx: i + 1,
          particulars, description, concernedRaw, emailRaw, dueDate,
          matched, unmatched, status,
        });
      }

      setRows(parsed);
    } catch (e: any) {
      toast.error("Could not read file: " + (e?.message || "unknown"));
    } finally {
      setParsing(false);
    }
  };

  const stats = useMemo(() => {
    const ready = rows.filter(r => r.status === "ready").length;
    const issues = rows.length - ready;
    return { total: rows.length, ready, issues };
  }, [rows]);

  const handleImport = async () => {
    const importable = rows.filter(r => r.status === "ready");
    if (importable.length === 0) { toast.error("Nothing to import"); return; }
    setImporting(true);
    let ok = 0;
    for (const r of importable) {
      try {
        const deptId = r.matched.find(m => m.department_id)?.department_id || null;
        const { data: task, error } = await supabase.from("tasks").insert({
          title: r.particulars,
          description: r.description || null,
          priority: "medium",
          status: "todo",
          department_id: deptId,
          due_date: r.dueDate,
          created_by: user?.id || null,
          frequency: "none",
        } as any).select("id").single();
        if (error || !task) { console.warn("import row failed", r.rowIdx, error); continue; }

        if (r.matched.length > 0) {
          await supabase.from("task_assignees").insert(r.matched.map(m => ({ task_id: task.id, user_id: m.id })));
          // Send assignment email
          supabase.functions.invoke("notify-task-assigned", {
            body: {
              taskId: task.id,
              assigneeUserIds: r.matched.map(m => m.id),
              assignedByName: user?.profile?.name || user?.email || "A teammate",
            },
          }).catch(e => console.warn("notify failed", e));
        }
        ok++;
      } catch (e) { console.warn("import row err", e); }
    }
    setImportedCount(ok);
    setImporting(false);
    toast.success(`Imported ${ok} of ${importable.length} tasks`);
    onImported?.();
    if (ok === importable.length) onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground/20 z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-lg border shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col animate-fade-in">
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />Import tasks from Excel / CSV
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Columns: <strong>Particulars</strong> (title), optional <strong>Description</strong>, <strong>Concerned Person</strong> (pick from dropdown), <strong>Due Date</strong>. No email needed — we match by name.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {rows.length === 0 ? (
              <>
                <div className="flex items-center justify-between gap-2 bg-primary/5 border border-primary/20 rounded-md px-3 py-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                    <span className="text-foreground">
                      <strong>New here?</strong> Download our ready-to-fill Excel template — headers are already set.
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0">
                    <Download className="h-3.5 w-3.5 mr-1.5" />Download template
                  </Button>
                </div>
                <label className="block border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground">Click to upload .xlsx, .xls or .csv</p>
                  <p className="text-xs text-muted-foreground mt-1">First row must be headers. We auto-match by name and email.</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {parsing && <p className="text-xs text-primary mt-2">Reading file…</p>}
                </label>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm bg-muted/40 rounded-md px-3 py-2">
                  <div className="flex items-center gap-2">
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

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-2 py-2 w-10">#</th>
                        <th className="px-2 py-2">Task</th>
                        <th className="px-2 py-2 w-40">Assignees (matched)</th>
                        <th className="px-2 py-2 w-24">Due</th>
                        <th className="px-2 py-2 w-20">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.rowIdx} className="border-t">
                          <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{r.rowIdx}</td>
                          <td className="px-2 py-1.5 text-foreground">
                            <div className="line-clamp-2">{r.particulars}</div>
                          </td>
                          <td className="px-2 py-1.5">
                            {r.matched.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {r.matched.map(m => <Badge key={m.id} variant="secondary" className="text-[10px]">{m.name}</Badge>)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">{r.concernedRaw || r.emailRaw || "—"}</span>
                            )}
                            {r.unmatched.length > 0 && r.matched.length > 0 && (
                              <div className="text-[10px] text-warning mt-1">unmatched: {r.unmatched.join(", ")}</div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {r.dueDate ? (
                              <span className="text-foreground tabular-nums">
                                {formatDateIST(r.dueDate, { day: "2-digit", month: "short" })}
                              </span>
                            ) : <span className="text-warning">—</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            {r.status === "ready" && <Badge variant="outline" className="text-[10px] border-success text-success">Ready</Badge>}
                            {r.status === "no-match" && <Badge variant="outline" className="text-[10px] border-warning text-warning">No match</Badge>}
                            {r.status === "missing-due" && <Badge variant="outline" className="text-[10px] border-warning text-warning">No date</Badge>}
                            {r.status === "missing-title" && <Badge variant="outline" className="text-[10px] border-destructive text-destructive">Skip</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Rows without a matched assignee are skipped. Every imported task must have a doer.
                </p>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 p-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={importing || rows.filter(r => r.status === "ready").length === 0}
            >
              {importing ? `Importing… (${importedCount})` : `Import ${rows.filter(r => r.status === "ready").length} task${rows.filter(r => r.status === "ready").length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
