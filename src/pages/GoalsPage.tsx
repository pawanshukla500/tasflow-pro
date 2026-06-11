import { useState, useEffect } from "react";
import { Search, Target as TargetIcon, Plus, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  department_name?: string;
  category: string;
  target_value: number;
  current_value: number;
  unit: string;
  deadline: string | null;
  status: string;
  priority: string;
  updated_at: string;
}
interface DeptOption { id: string; name: string }

const statusConfig: Record<string, { label: string; color: string }> = {
  achieved: { label: "Achieved", color: "bg-success text-success-foreground" },
  on_track: { label: "On Track", color: "bg-primary text-primary-foreground" },
  at_risk: { label: "At Risk", color: "bg-warning text-warning-foreground" },
  behind: { label: "Behind", color: "bg-destructive text-destructive-foreground" },
};

const GoalsPage = () => {
  const { user, isAdminOrMD, isDeptManager, canManageDept } = useAuth();
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fDept, setFDept] = useState("");
  const [fCategory, setFCategory] = useState("general");
  const [fTarget, setFTarget] = useState("0");
  const [fCurrent, setFCurrent] = useState("0");
  const [fUnit, setFUnit] = useState("");
  const [fDeadline, setFDeadline] = useState("");
  const [fStatus, setFStatus] = useState("on_track");
  const [fPriority, setFPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  const canEditGoal = (g: Goal) =>
    isAdminOrMD || (isDeptManager && g.department_id != null && canManageDept(g.department_id));

  const canCreate = isAdminOrMD || isDeptManager;

  const fetchData = async () => {
    setLoading(true);
    const [gRes, dRes] = await Promise.all([
      supabase.from("goals").select("*").order("created_at", { ascending: false }),
      supabase.from("departments").select("id, name"),
    ]);
    const depts = dRes.data || [];
    setDepartments(depts);
    setGoals((gRes.data || []).map((g: any) => ({
      ...g,
      department_name: depts.find((d) => d.id === g.department_id)?.name,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const reset = () => {
    setFTitle(""); setFDesc(""); setFDept(""); setFCategory("general");
    setFTarget("0"); setFCurrent("0"); setFUnit(""); setFDeadline("");
    setFStatus("on_track"); setFPriority("medium");
  };

  const openCreate = () => { reset(); setEditGoal(null); setShowModal(true); };
  const openEdit = (g: Goal) => {
    setEditGoal(g);
    setFTitle(g.title); setFDesc(g.description || ""); setFDept(g.department_id || "");
    setFCategory(g.category); setFTarget(String(g.target_value)); setFCurrent(String(g.current_value));
    setFUnit(g.unit); setFDeadline(g.deadline || ""); setFStatus(g.status); setFPriority(g.priority);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!fTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      title: fTitle.trim(),
      description: fDesc || null,
      department_id: fDept || null,
      category: fCategory,
      target_value: Number(fTarget) || 0,
      current_value: Number(fCurrent) || 0,
      unit: fUnit,
      deadline: fDeadline || null,
      status: fStatus,
      priority: fPriority,
      updated_by: user?.id,
    };
    let err: any = null;
    if (editGoal) {
      const { error } = await supabase.from("goals").update(payload).eq("id", editGoal.id);
      err = error;
    } else {
      const { error } = await supabase.from("goals").insert({ ...payload, created_by: user?.id });
      err = error;
    }
    setSaving(false);
    if (err) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
      return;
    }
    toast({ title: editGoal ? "Goal updated" : "Goal created" });
    setShowModal(false);
    setEditGoal(null);
    reset();
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("goals").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Goal deleted" });
      fetchData();
    }
    setDeleteId(null);
  };

  const filtered = goals.filter((g) =>
    !search || g.title.toLowerCase().includes(search.toLowerCase()) ||
    (g.department_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Goals</h1>
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />Create Goal
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search goals…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground text-sm">Loading goals…</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-lg border">
          <TargetIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            {goals.length === 0 ? "No goals yet" : "No goals match your search"}
          </p>
          {goals.length === 0 && canCreate && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />Create your first goal
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((goal) => {
            const target = goal.target_value || 1;
            const pct = Math.round((goal.current_value / target) * 100);
            const barColor = pct >= 80 ? "bg-success" : pct >= 50 ? "bg-primary" : pct >= 30 ? "bg-warning" : "bg-destructive";
            const cfg = statusConfig[goal.status] || statusConfig.on_track;
            const daysLeft = goal.deadline
              ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;
            return (
              <div key={goal.id} className="bg-card rounded-lg border p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{goal.title}</h3>
                    {goal.department_name && (
                      <Badge variant="secondary" className="text-[10px] mt-1">{goal.department_name}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                    <Badge variant="outline" className="text-[10px]">{goal.category}</Badge>
                    {canEditGoal(goal) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(goal)}>
                            <Edit className="h-3.5 w-3.5 mr-2" />Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(goal.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {goal.description && (
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{goal.description}</p>
                )}

                <div className="mt-3">
                  <div className="h-2 bg-muted rounded-full">
                    <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-mono-num text-foreground">{goal.current_value} {goal.unit}</span>
                    <span className="text-xs text-muted-foreground font-mono-num">/ {goal.target_value} {goal.unit}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className={`text-xs ${daysLeft === null ? "text-muted-foreground" : daysLeft < 0 ? "text-destructive font-medium" : daysLeft < 7 ? "text-warning" : "text-muted-foreground"}`}>
                    {daysLeft === null ? "No deadline" : daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d remaining`}
                  </span>
                  {canEditGoal(goal) && goal.status !== "achieved" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(goal)}>
                      Update
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(o) => { if (!o) { setShowModal(false); setEditGoal(null); reset(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editGoal ? "Edit Goal" : "Create Goal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="e.g. Achieve ₹50 Cr quarterly revenue" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} placeholder="Optional details" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={fDept} onValueChange={setFDept}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments
                      .filter((d) => isAdminOrMD || canManageDept(d.id))
                      .map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={fCategory} onValueChange={setFCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="Revenue">Revenue</SelectItem>
                    <SelectItem value="Quality">Quality</SelectItem>
                    <SelectItem value="Growth">Growth</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Current</Label>
                <Input type="number" value={fCurrent} onChange={(e) => setFCurrent(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Target</Label>
                <Input type="number" value={fTarget} onChange={(e) => setFTarget(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={fUnit} onChange={(e) => setFUnit(e.target.value)} placeholder="%, Cr, units" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Deadline</Label>
                <Input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_track">On Track</SelectItem>
                    <SelectItem value="at_risk">At Risk</SelectItem>
                    <SelectItem value="behind">Behind</SelectItem>
                    <SelectItem value="achieved">Achieved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={fPriority} onValueChange={setFPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowModal(false); setEditGoal(null); reset(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editGoal ? "Save changes" : "Create goal"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GoalsPage;
