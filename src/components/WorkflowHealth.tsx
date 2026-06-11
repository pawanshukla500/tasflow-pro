import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, AlertCircle, UserX, Bell, Ban, Search, Mail, UserCog, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Reason = "breached" | "approaching" | "no_assignee" | "escalated" | "blocked";

interface Profile { id: string; name: string; email: string; department_id: string | null; }
interface Department { id: string; name: string; }
interface StuckRow {
  stage_id: string;
  stage_name: string;
  position: number;
  workflow_id: string;
  workflow_title: string;
  assignee_user_id: string | null;
  assignee_name: string | null;
  owner_department_id: string | null;
  dept_name: string | null;
  tat_hours: number;
  started_at: string | null;
  status: string;
  blocked_reason: string | null;
  escalated_at: string | null;
  reasons: Reason[];
  elapsedHours: number;
  pctTat: number;
  severity: number;
  tier: "P1" | "P2" | "P3";
  refId: string;
}

const reasonMeta: Record<Reason, { label: string; icon: any; cls: string }> = {
  breached:     { label: "TAT breached",      icon: AlertTriangle, cls: "bg-destructive/10 text-destructive border-destructive/30" },
  approaching:  { label: "Approaching breach", icon: Clock,        cls: "bg-warning/10 text-warning border-warning/30" },
  no_assignee:  { label: "No assignee",       icon: UserX,         cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  escalated:    { label: "Escalated",         icon: Bell,          cls: "bg-purple-500/10 text-purple-600 border-purple-500/30" },
  blocked:      { label: "Blocked",           icon: Ban,           cls: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
};

const fmtElapsed = (h: number) => {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${Math.round(h - d * 24)}h`;
};

interface Props {
  departments: Department[];
  profiles: Profile[];
  currentUserId: string | null;
  isAdminOrMD: boolean;
  onChanged?: () => void;
}

export const WorkflowHealth = ({ departments, profiles, currentUserId, isAdminOrMD, onChanged }: Props) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StuckRow[]>([]);
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<"all" | Reason>("all");

  // Action dialogs
  const [reassign, setReassign] = useState<StuckRow | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [extendTat, setExtendTat] = useState<StuckRow | null>(null);
  const [extendHours, setExtendHours] = useState<number>(24);
  const [extendNote, setExtendNote] = useState("");
  const [block, setBlock] = useState<StuckRow | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    const { data: stages, error } = await supabase
      .from("workflow_stages")
      .select("id, workflow_id, position, name, owner_department_id, assignee_user_id, tat_hours, status, started_at, escalated_at, blocked_reason, last_escalated_at, workflows!inner(id,title,status)")
      .in("status", ["in_progress", "blocked"]);
    if (error) {
      toast.error("Failed to load workflow health");
      setLoading(false);
      return;
    }
    // Fetch reference_id (Indent ID) for these workflows so health uses the same ID as the workflow list
    const wfIds = Array.from(new Set((stages || []).map((s: any) => s.workflow_id)));
    const refMap = new Map<string, string>();
    if (wfIds.length) {
      const { data: refs } = await supabase
        .from("workflow_field_values")
        .select("workflow_id, value")
        .eq("field_key", "reference_id")
        .in("workflow_id", wfIds);
      (refs || []).forEach((r: any) => { if (r.value) refMap.set(r.workflow_id, r.value); });
    }
    const now = Date.now();
    const out: StuckRow[] = (stages || [])
      .filter((s: any) => s.workflows?.status === "active")
      .map((s: any) => {
        const reasons: Reason[] = [];
        const elapsedMs = s.started_at ? now - new Date(s.started_at).getTime() : 0;
        const elapsedHours = elapsedMs / 3600000;
        const pctTat = s.tat_hours > 0 ? (elapsedHours / s.tat_hours) * 100 : 0;

        if (s.status === "blocked") reasons.push("blocked");
        // Only flag as breached when the stage has actually crossed its TAT
        if (s.started_at && elapsedHours > s.tat_hours) reasons.push("breached");
        if (!s.assignee_user_id && !s.owner_department_id) reasons.push("no_assignee");
        if (s.escalated_at) reasons.push("escalated");

        if (reasons.length === 0) return null;

        const assignee = profiles.find((p) => p.id === s.assignee_user_id);
        const dept = departments.find((d) => d.id === s.owner_department_id);

        // Severity score: weighted by reason type + how far past TAT
        let severity = 0;
        if (reasons.includes("breached")) severity += 50 + Math.min(50, Math.max(0, pctTat - 100));
        if (reasons.includes("approaching")) severity += 25;
        if (reasons.includes("escalated")) severity += 20;
        if (reasons.includes("blocked")) severity += 30;
        if (reasons.includes("no_assignee")) severity += 15;

        const tier: "P1" | "P2" | "P3" = severity >= 70 ? "P1" : severity >= 35 ? "P2" : "P3";
        const refId = refMap.get(s.workflow_id) || `WF-${String(s.workflow_id).slice(0, 8).toUpperCase()}`;

        return {
          stage_id: s.id,
          stage_name: s.name,
          position: s.position,
          workflow_id: s.workflow_id,
          workflow_title: s.workflows?.title || "Workflow",
          assignee_user_id: s.assignee_user_id,
          assignee_name: assignee?.name || null,
          owner_department_id: s.owner_department_id,
          dept_name: dept?.name || null,
          tat_hours: s.tat_hours,
          started_at: s.started_at,
          status: s.status,
          blocked_reason: s.blocked_reason,
          escalated_at: s.escalated_at,
          reasons,
          elapsedHours,
          pctTat,
          severity,
          tier,
          refId,
        } as StuckRow;
      })
      .filter(Boolean) as StuckRow[];

    out.sort((a, b) => b.severity - a.severity || b.pctTat - a.pctTat);
    setRows(out);
    setLoading(false);
  };

  useEffect(() => { fetchHealth(); /* eslint-disable-next-line */ }, [profiles.length, departments.length]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (reasonFilter !== "all" && !r.reasons.includes(reasonFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.workflow_title.toLowerCase().includes(q) ||
          r.stage_name.toLowerCase().includes(q) ||
          r.refId.toLowerCase().includes(q) ||
          (r.assignee_name || "").toLowerCase().includes(q) ||
          (r.dept_name || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, search, reasonFilter]);

  const counts = useMemo(() => {
    const c: Record<Reason, number> = { breached: 0, approaching: 0, no_assignee: 0, escalated: 0, blocked: 0 };
    rows.forEach((r) => r.reasons.forEach((x) => { c[x]++; }));
    return c;
  }, [rows]);

  // ---- Actions ----
  const logEvent = async (row: StuckRow, event_type: string, patch: { from_value?: string | null; to_value?: string | null; note?: string | null; metadata?: any }) => {
    if (!currentUserId) return;
    await supabase.from("workflow_stage_events").insert({
      stage_id: row.stage_id,
      workflow_id: row.workflow_id,
      actor_id: currentUserId,
      event_type,
      from_value: patch.from_value ?? null,
      to_value: patch.to_value ?? null,
      note: patch.note ?? null,
      metadata: patch.metadata ?? {},
    });
  };

  const doReassign = async () => {
    if (!reassign || !reassignTo) return;
    setBusy(true);
    const newId = reassignTo === "none" ? null : reassignTo;
    const { error } = await supabase
      .from("workflow_stages")
      .update({ assignee_user_id: newId })
      .eq("id", reassign.stage_id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    await logEvent(reassign, "reassigned", {
      from_value: reassign.assignee_user_id, to_value: newId,
    });
    toast.success("Stage reassigned");
    setReassign(null); setReassignTo(""); setBusy(false);
    fetchHealth(); onChanged?.();
  };

  const doExtendTat = async () => {
    if (!extendTat || extendHours <= 0) return;
    setBusy(true);
    const newTat = extendTat.tat_hours + extendHours;
    const { error } = await supabase
      .from("workflow_stages")
      .update({ tat_hours: newTat, escalated_at: null, last_escalated_at: null })
      .eq("id", extendTat.stage_id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    await logEvent(extendTat, "tat_extended", {
      from_value: String(extendTat.tat_hours), to_value: String(newTat), note: extendNote,
    });
    toast.success(`TAT extended by ${extendHours}h`);
    setExtendTat(null); setExtendHours(24); setExtendNote(""); setBusy(false);
    fetchHealth(); onChanged?.();
  };

  const doBlock = async () => {
    if (!block || !blockReason.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("workflow_stages")
      .update({ status: "blocked", blocked_reason: blockReason.trim() })
      .eq("id", block.stage_id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    await logEvent(block, "blocked", { note: blockReason.trim() });
    toast.success("Stage marked as blocked");
    setBlock(null); setBlockReason(""); setBusy(false);
    fetchHealth(); onChanged?.();
  };

  const doUnblock = async (row: StuckRow) => {
    const { error } = await supabase
      .from("workflow_stages")
      .update({ status: "in_progress", blocked_reason: null })
      .eq("id", row.stage_id);
    if (error) { toast.error(error.message); return; }
    await logEvent(row, "unblocked", {});
    toast.success("Stage unblocked");
    fetchHealth(); onChanged?.();
  };

  const doNudge = async (row: StuckRow) => {
    if (!row.assignee_user_id) {
      toast.error("No assignee to nudge");
      return;
    }
    const assignee = profiles.find((p) => p.id === row.assignee_user_id);
    if (!assignee?.email) { toast.error("Assignee has no email"); return; }
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "workflow-stage-assigned",
          recipientEmail: assignee.email,
          idempotencyKey: `wf-nudge-${row.stage_id}-${Date.now()}`,
          templateData: {
            recipientName: assignee.name,
            workflowTitle: row.workflow_title,
            stageName: row.stage_name,
            stagePosition: row.position,
            tatHours: row.tat_hours,
            isOverdue: row.reasons.includes("breached"),
          },
        },
      });
      await logEvent(row, "nudged", { to_value: assignee.email });
      toast.success(`Nudged ${assignee.name}`);
    } catch (e: any) {
      toast.error("Could not send nudge");
    }
  };

  return (
    <div className="space-y-4">
      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(Object.keys(reasonMeta) as Reason[]).map((r) => {
          const m = reasonMeta[r];
          const Icon = m.icon;
          return (
            <button
              key={r}
              onClick={() => setReasonFilter(reasonFilter === r ? "all" : r)}
              className={`text-left rounded-lg border p-3 transition-all hover:shadow-sm ${reasonFilter === r ? "ring-2 ring-primary/40 border-primary/40" : "bg-card"}`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`h-3.5 w-3.5 ${m.cls.split(" ").find((x) => x.startsWith("text-")) || ""}`} />
                <span className="text-lg font-semibold text-foreground tabular-nums">{counts[r]}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{m.label}</div>
            </button>
          );
        })}
      </div>

      {/* Search + reset */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Ref ID, workflow, stage, assignee, department…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        {(reasonFilter !== "all" || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setReasonFilter("all"); setSearch(""); }}>
            Clear filters
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} of {rows.length}</div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading workflow health…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border">
          <AlertCircle className="h-10 w-10 text-success mx-auto mb-2 opacity-60" />
          <p className="text-sm font-medium text-foreground">All clear — nothing stuck right now</p>
          <p className="text-xs text-muted-foreground mt-1">Stages will appear here when they breach TAT, approach breach, or get blocked.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-[11px] uppercase text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium w-16">Rank</th>
                  <th className="text-left px-3 py-2 font-medium w-32">Ref ID</th>
                  <th className="text-left px-3 py-2 font-medium">Workflow / blocking step</th>
                  <th className="text-left px-3 py-2 font-medium">Assignee</th>
                  <th className="text-left px-3 py-2 font-medium">In stage</th>
                  <th className="text-left px-3 py-2 font-medium">Reasons</th>
                  <th className="text-right px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const overshoot = r.elapsedHours - r.tat_hours;
                  const tierCls =
                    r.tier === "P1" ? "bg-destructive/10 text-destructive border-destructive/30" :
                    r.tier === "P2" ? "bg-warning/10 text-warning border-warning/30" :
                    "bg-muted text-muted-foreground border-border";
                  return (
                    <tr key={r.stage_id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-semibold tabular-nums text-foreground">#{idx + 1}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${tierCls}`}>{r.tier}</Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-mono text-[11px] tracking-tight">{r.refId}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">{r.workflow_title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-primary/10 text-primary text-[10px] font-semibold">
                            {r.position}
                          </span>
                          <span className="font-medium text-foreground">{r.stage_name}</span>
                          <span className="text-muted-foreground">— blocking</span>
                        </div>
                        {r.blocked_reason && (
                          <div className="text-[11px] text-warning mt-1 italic">Blocked: {r.blocked_reason}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.assignee_name ? (
                          <div className="text-foreground">{r.assignee_name}</div>
                        ) : (
                          <div className="text-orange-600 italic">Unassigned</div>
                        )}
                        {r.dept_name && <div className="text-xs text-muted-foreground">{r.dept_name}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-mono-num text-foreground">{fmtElapsed(r.elapsedHours)}</div>
                        <div className="text-xs text-muted-foreground">
                          TAT {r.tat_hours}h
                          {overshoot > 0 && <span className="text-destructive ml-1">+{fmtElapsed(overshoot)}</span>}
                        </div>
                        <div className="mt-1 h-1 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${r.pctTat > 100 ? "bg-destructive" : r.pctTat >= 75 ? "bg-warning" : "bg-primary"}`}
                            style={{ width: `${Math.min(100, r.pctTat)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.reasons.map((x) => {
                            const m = reasonMeta[x];
                            return (
                              <Badge key={x} variant="outline" className={`text-[10px] ${m.cls}`}>
                                {m.label}
                              </Badge>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {r.assignee_user_id && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => doNudge(r)} title="Nudge by email">
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2"
                            onClick={() => { setReassign(r); setReassignTo(r.assignee_user_id || "none"); }}
                            title="Reassign"
                          >
                            <UserCog className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2"
                            onClick={() => { setExtendTat(r); setExtendHours(24); setExtendNote(""); }}
                            title="Extend TAT"
                            disabled={!isAdminOrMD}
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                          {r.status === "blocked" ? (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-success" onClick={() => doUnblock(r)} title="Unblock">
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              size="sm" variant="ghost" className="h-7 px-2 text-orange-600"
                              onClick={() => { setBlock(r); setBlockReason(""); }}
                              title="Mark blocked"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reassign dialog */}
      <Dialog open={!!reassign} onOpenChange={(o) => !o && setReassign(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">New assignee</Label>
            <Select value={reassignTo} onValueChange={setReassignTo}>
              <SelectTrigger><SelectValue placeholder="Pick a team member" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {profiles
                  .filter((p) => !reassign?.owner_department_id || p.department_id === reassign?.owner_department_id)
                  .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground pt-1">
              Stage: <strong>{reassign?.stage_name}</strong> · {reassign?.workflow_title}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassign(null)}>Cancel</Button>
            <Button onClick={doReassign} disabled={busy || !reassignTo}>Reassign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend TAT dialog */}
      <Dialog open={!!extendTat} onOpenChange={(o) => !o && setExtendTat(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend TAT</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Add hours</Label>
              <Input type="number" min={1} value={extendHours} onChange={(e) => setExtendHours(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label className="text-xs">Reason (required)</Label>
              <Textarea value={extendNote} onChange={(e) => setExtendNote(e.target.value)} placeholder="Why is more time needed?" rows={3} />
            </div>
            <p className="text-xs text-muted-foreground">
              Current TAT: <strong>{extendTat?.tat_hours}h</strong> → New: <strong>{(extendTat?.tat_hours || 0) + extendHours}h</strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTat(null)}>Cancel</Button>
            <Button onClick={doExtendTat} disabled={busy || extendHours <= 0 || !extendNote.trim()}>Extend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block dialog */}
      <Dialog open={!!block} onOpenChange={(o) => !o && setBlock(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark stage as blocked</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">What's blocking it?</Label>
            <Textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="e.g. Waiting on vendor sample, missing approval from finance…" rows={3} />
            <p className="text-xs text-muted-foreground">
              Stage: <strong>{block?.stage_name}</strong> · TAT timer pauses while blocked.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlock(null)}>Cancel</Button>
            <Button onClick={doBlock} disabled={busy || !blockReason.trim()}>Mark blocked</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
