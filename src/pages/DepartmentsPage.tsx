import { useState, useEffect, useMemo } from "react";
import { Plus, Edit, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { ScopeBanner } from "@/components/ScopeBanner";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Department = Tables<"departments">;

interface DeptWithStats extends Department {
  memberCount: number;
  openTaskCount: number;
  managerName?: string;
}

const colorPresets = ["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316"];

const DepartmentsPage = () => {
  const { accessScope, user } = useAuth();
  const { filterDepartments } = useAccessScope();
  const { toast } = useToast();
  const [allDepartments, setAllDepartments] = useState<DeptWithStats[]>([]);
  const departments = useMemo(() => filterDepartments(allDepartments), [allDepartments, filterDepartments]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState<DeptWithStats | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formColor, setFormColor] = useState("#6366f1");
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const deptToDelete = deleteId ? departments.find((d) => d.id === deleteId) : null;

  const fetchDepts = async () => {
    setLoading(true);
    const [deptsRes, profilesRes, deptMgrsRes, tasksRes] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("profiles").select("id, name, department_id"),
      supabase.from("department_managers").select("user_id, department_id"),
      supabase.from("tasks").select("department_id, status").neq("status", "done"),
    ]);

    const profiles = profilesRes.data || [];
    const deptMgrs = deptMgrsRes.data || [];
    const openTasks = tasksRes.data || [];

    const depts: DeptWithStats[] = (deptsRes.data || []).map((d) => {
      const memberCount = profiles.filter((p) => p.department_id === d.id).length;
      const openTaskCount = openTasks.filter((t) => t.department_id === d.id).length;
      const mgr = deptMgrs.find((dm) => dm.department_id === d.id);
      const mgrProfile = mgr ? profiles.find((p) => p.id === mgr.user_id) : null;
      return { ...d, memberCount, openTaskCount, managerName: mgrProfile?.name };
    });

    setAllDepartments(depts);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchDepts();
  }, [user?.id, accessScope.tier]);

  const resetForm = () => { setFormName(""); setFormDesc(""); setFormColor("#6366f1"); };

  const openEdit = (d: DeptWithStats) => {
    setEditDept(d);
    setFormName(d.name);
    setFormDesc(d.description || "");
    setFormColor(d.color);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setFormLoading(true);
    try {
      if (editDept) {
        await supabase.from("departments").update({ name: formName, description: formDesc, color: formColor }).eq("id", editDept.id);
        toast({ title: "Department updated" });
      } else {
        const orgId = user?.organization?.id ?? (user?.profile as { organization_id?: string })?.organization_id;
        await supabase.from("departments").insert({
          name: formName,
          description: formDesc,
          color: formColor,
          organization_id: orgId || null,
        });
        toast({ title: "Department created", description: "You can now add HOD and Team Members in Team." });
      }
      setShowModal(false);
      setEditDept(null);
      resetForm();
      fetchDepts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase.rpc("delete_department" as never, { _dept_id: deleteId } as never);
      if (error) throw error;
      toast({
        title: "Department deleted",
        description: deptToDelete?.memberCount
          ? `${deptToDelete.memberCount} member(s) were unassigned from this department.`
          : undefined,
      });
      setDeleteId(null);
      fetchDepts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not delete department";
      toast({ title: "Delete failed", description: message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <PageHeader
        title="Departments"
        description={
          accessScope.canManageDepartments
            ? "Create and manage organization departments"
            : "View your department structure, members, and open tasks"
        }
        actions={
          accessScope.canManageDepartments ? (
            <Button size="sm" onClick={() => { resetForm(); setShowModal(true); }}>
              <Plus className="h-4 w-4 mr-1" />Add Department
            </Button>
          ) : undefined
        }
      />
      {accessScope.tier !== "member" && !accessScope.hasFullAccess && (
        <ScopeBanner scope={accessScope} departmentNames={departments.map((d) => d.name)} />
      )}

      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div key={dept.id} className="bg-card rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-1" style={{ backgroundColor: dept.color }} />
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-semibold text-foreground">{dept.name}</h3>
                  {accessScope.canManageDepartments && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(dept)}><Edit className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(dept.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{dept.description || "No description"}</p>
                {dept.managerName && (
                  <p className="text-xs text-muted-foreground mt-2">Manager: <span className="text-foreground font-medium">{dept.managerName}</span></p>
                )}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-lg font-mono-num font-bold text-foreground">{dept.memberCount}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Members</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-lg font-mono-num font-bold text-foreground">{dept.openTaskCount}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Open Tasks</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal || !!editDept} onOpenChange={(open) => { if (!open) { setShowModal(false); setEditDept(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDept ? "Edit Department" : "Add Department"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Department Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Operations" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="What this department does" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {colorPresets.map((c) => (
                  <button key={c} className={`w-7 h-7 rounded-full border-2 transition-all ${formColor === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} onClick={() => setFormColor(c)} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowModal(false); setEditDept(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={formLoading}>
              {formLoading ? "Saving…" : editDept ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department?</AlertDialogTitle>
            <AlertDialogDescription>
              {deptToDelete
                ? `"${deptToDelete.name}" will be removed. ${deptToDelete.memberCount} member(s) will be unassigned; ${deptToDelete.openTaskCount} open task(s) will lose their department tag.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DepartmentsPage;
