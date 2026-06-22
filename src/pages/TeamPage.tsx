import { useState, useEffect } from "react";
import { Search, MoreHorizontal, Download, Plus, Trash2, Edit, Phone, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/PageHeader";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { ScopeBanner } from "@/components/ScopeBanner";
import { ROLE_OPTIONS, roleLabel } from "@/lib/roleLabels";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { sendPasswordResetEmail } from "@/lib/passwordReset";
import { useToast } from "@/hooks/use-toast";
import { shouldShowInPerformanceLeaderboard } from "@/lib/performanceVisibility";
import { todayIST } from "@/lib/time";

interface ProfileWithRole {
  id: string;
  name: string;
  email: string;
  mobile_no: string | null;
  position: string | null;
  department_id: string | null;
  department_name?: string;
  active: boolean;
  performance_score: number;
  created_at: string;
  roles: AppRole[];
  managed_departments: string[];
}

interface DeptOption {
  id: string;
  name: string;
}

const roleColors: Record<string, string> = {
  managing_director: "bg-primary text-primary-foreground",
  system_admin: "bg-destructive text-destructive-foreground",
  department_manager: "bg-primary/20 text-primary",
  employee: "bg-muted text-muted-foreground",
  hr: "bg-warning/20 text-warning",
};

const roleLabels: Record<string, string> = {
  managing_director: "Managing Director",
  system_admin: "System Admin",
  department_manager: "Dept Manager",
  employee: "Employee",
  hr: "HR",
};

const TeamPage = () => {
  const { accessScope, isAdminOrMD, isDeptManager, isHR, user } = useAuth();
  const { filterDepartments } = useAccessScope();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [members, setMembers] = useState<ProfileWithRole[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMember, setEditMember] = useState<ProfileWithRole | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formMobile, setFormMobile] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<AppRole>("employee");
  const [formDept, setFormDept] = useState<string>("");
  const [formPosition, setFormPosition] = useState("");
  const [formManagedDepts, setFormManagedDepts] = useState<string[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, deptsRes, deptMgrsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("departments").select("id, name"),
      supabase.from("department_managers").select("*"),
    ]);

    const depts = filterDepartments(deptsRes.data || []);
    setDepartments(depts);

    const profiles = (profilesRes.data || []).map((p) => {
      const userRoles = (rolesRes.data || []).filter((r) => r.user_id === p.id).map((r) => r.role);
      const managedDepts = (deptMgrsRes.data || []).filter((d) => d.user_id === p.id).map((d) => d.department_id);
      const dept = depts.find((d) => d.id === p.department_id);
      return { ...p, roles: userRoles, managed_departments: managedDepts, department_name: dept?.name };
    });

    // Filter for dept managers: only show their department members
    if (!isAdminOrMD && isDeptManager) {
      const myDepts = user?.managedDepartments || [];
      setMembers(profiles.filter((p) => myDepts.includes(p.department_id || "")));
    } else {
      setMembers(profiles);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user?.id, accessScope.tier]);

  const filtered = members.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== "all" && !m.roles.includes(roleFilter as AppRole)) return false;
    if (deptFilter !== "all" && m.department_id !== deptFilter) return false;
    return true;
  });

  const handleExportCSV = () => {
    const headers = ["Name", "Email", "Role", "Department", "Mobile", "Active"];
    const rows = filtered.map((m) => [
      m.name, m.email,
      m.roles.map((r) => roleLabels[r] || r).join("; "),
      m.department_name || "", m.mobile_no || "", m.active ? "Yes" : "No",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-members-${todayIST()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${filtered.length} members exported.` });
  };

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormMobile("+91 "); setFormPassword("");
    setFormRole("employee"); setFormDept(""); setFormPosition(""); setFormManagedDepts([]);
  };

  const handleMobileChange = (v: string) => {
    // Always keep +91 prefix locked
    if (!v.startsWith("+91")) {
      setFormMobile("+91 " + v.replace(/^\+?91\s?/, ""));
    } else {
      setFormMobile(v);
    }
  };

  const openEdit = (m: ProfileWithRole) => {
    setEditMember(m);
    setFormName(m.name);
    setFormEmail(m.email);
    setFormMobile(m.mobile_no || "+91 ");
    setFormRole(m.roles[0] || "employee");
    setFormDept(m.department_id || "");
    setFormPosition(m.position || "");
    setFormManagedDepts(m.managed_departments);
    setFormPassword("");
  };

  const handleCreate = async () => {
    if (!formName || !formEmail || !formPassword) {
      toast({ title: "Missing fields", description: "Name, email, and password are required.", variant: "destructive" });
      return;
    }
    const roleMeta = ROLE_OPTIONS.find((r) => r.value === formRole);
    if (roleMeta?.needsDepartment && !formDept) {
      toast({ title: "Department required", description: "Create a department first, then assign Team Members or HOD to it.", variant: "destructive" });
      return;
    }
    if (departments.length === 0) {
      toast({ title: "No departments yet", description: "Go to Departments and create one before adding team members.", variant: "destructive" });
      return;
    }
    setFormLoading(true);
    try {
      const cleanedMobile = formMobile && formMobile.trim() !== "+91" ? formMobile.trim() : null;
      const managedDepts =
        formRole === "department_manager" && formDept
          ? [formDept]
          : formRole === "department_manager"
            ? formManagedDepts
            : [];
      const createData = await invokeEdgeFunction<{
        userId?: string;
        emailSent?: boolean;
        emailSubject?: string;
        emailError?: string;
        error?: string;
      }>("create-team-member", {
        body: {
          name: formName,
          email: formEmail,
          password: formPassword,
          mobile_no: cleanedMobile,
          position: formPosition || null,
          department_id: formDept || null,
          role: formRole,
          managed_departments: managedDepts,
        },
      });
      const newUserId = createData?.userId;
      if (!newUserId) throw new Error("User creation failed");

      if (createData.emailSent) {
        toast({
          title: "User created",
          description: `Welcome email sent to ${formEmail} with Login ID and password.`,
        });
      } else {
        toast({
          title: "User created — email not sent",
          description: createData.emailError || "Email is not configured. User can still sign in with the password you set.",
          variant: "destructive",
        });
      }
      setShowAddModal(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editMember) return;
    setFormLoading(true);
    try {
      await supabase.from("profiles").update({
        name: formName,
        mobile_no: formMobile || null,
        position: formPosition || null,
        department_id: formDept || null,
      }).eq("id", editMember.id);

      // Update role
      const currentRole = editMember.roles[0];
      if (currentRole !== formRole) {
        await supabase.from("user_roles").update({ role: formRole }).eq("user_id", editMember.id);
      }

      // Update managed departments
      await supabase.from("department_managers").delete().eq("user_id", editMember.id);
      if (formRole === "department_manager" && formManagedDepts.length > 0) {
        await supabase.from("department_managers").insert(
          formManagedDepts.map((dId) => ({ user_id: editMember.id, department_id: dId }))
        );
      }

      toast({ title: "User updated" });
      setEditMember(null);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleSendReset = async (m: ProfileWithRole) => {
    try {
      const result = await sendPasswordResetEmail(m.email);
      toast({
        title: "Reset email sent",
        description: result.messageId
          ? `Delivered to ${m.email}. Subject: "${result.subject || "Reset your TaskFlow Pro password"}"`
          : `Check ${m.email} for the reset email.`,
      });
    } catch (err: any) {
      toast({
        title: "Could not send reset",
        description: err.message?.includes("RESEND_API_KEY") || err.message?.includes("upload-email-secrets")
          ? "Email API not configured. Sign up at resend.com and run: node scripts/upload-email-secrets.mjs"
          : err.message?.includes("FIREBASE_SERVICE_ACCOUNT") || err.message?.includes("upload-firebase-secret")
            ? "Firebase service account missing. Run: node scripts/upload-firebase-secret.mjs"
            : err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { data, error } = await supabase.functions.invoke("delete-team-member", {
        body: { targetUserId: deleteId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Member deleted", description: "All account data removed." });
      setDeleteId(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const renderFormFields = (isEdit: boolean) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Full Name *</Label>
          <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@vbexports.co.in" disabled={isEdit} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Mobile No</Label>
          <Input value={formMobile} onChange={(e) => handleMobileChange(e.target.value)} placeholder="+91 XXXXX XXXXX" />
        </div>
        {!isEdit ? (
          <div className="space-y-2">
            <Label>Password *</Label>
            <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Temporary password" />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Position</Label>
            <Input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} placeholder="Job title" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Role *</Label>
          <Select value={formRole} onValueChange={(v) => {
            setFormRole(v as AppRole);
            if (v === "department_manager" && formDept) setFormManagedDepts([formDept]);
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.filter((r) => {
                if (r.value === "system_admin" || r.value === "managing_director") return isAdminOrMD;
                if (r.value === "hr") return isAdminOrMD || isHR;
                return true;
              }).map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  <span className="font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">— {r.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Department {(formRole === "employee" || formRole === "department_manager") ? "*" : ""}</Label>
          <Select value={formDept} onValueChange={(v) => {
            setFormDept(v);
            if (formRole === "department_manager") setFormManagedDepts([v]);
          }}>
            <SelectTrigger><SelectValue placeholder={departments.length ? "Select department" : "Create a department first"} /></SelectTrigger>
            <SelectContent>
              {departments.length === 0 ? (
                <SelectItem value="__none__" disabled>No departments — add one in Departments</SelectItem>
              ) : departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {!isEdit && (
        <div className="space-y-2">
          <Label>Position</Label>
          <Input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} placeholder="Job title" />
        </div>
      )}
      {formRole === "department_manager" && formDept && (
        <p className="text-xs text-muted-foreground">This user will manage: {departments.find((d) => d.id === formDept)?.name}</p>
      )}
      {formRole === "department_manager" && !formDept && (
        <div className="space-y-2">
          <Label>Manages Departments</Label>
          <div className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${formManagedDepts.includes(d.id) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary"}`}
                onClick={() => setFormManagedDepts((prev) => prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id])}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (!accessScope.canViewTeam) {
    return <div className="p-6"><p className="text-muted-foreground">You don't have access to this page.</p></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto page-enter space-y-4">
      {accessScope.tier !== "member" && !accessScope.hasFullAccess && (
        <ScopeBanner scope={accessScope} departmentNames={departments.map((d) => d.name)} />
      )}
      <PageHeader
        title="Team"
        description={
          accessScope.hasFullAccess
            ? `${members.length} members across the organization`
            : `${members.length} members in your department${departments.length === 1 ? `: ${departments[0].name}` : ""}`
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
            <Button size="sm" onClick={() => { resetForm(); setShowAddModal(true); }}><Plus className="h-4 w-4 mr-1" />Add Member</Button>
          </>
        }
      />

      {departments.length === 0 && isAdminOrMD && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Setup step 1: Create departments</p>
            <p className="text-xs text-muted-foreground">Add departments before assigning HODs and Team Members.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/departments")}>Go to Departments</Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-stat text-3xl text-foreground">{members.length}</p>
          <p className="text-stat-label mt-1.5">Total Members</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-stat text-3xl text-success">{members.filter((m) => m.active).length}</p>
          <p className="text-stat-label mt-1.5">Active</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-stat text-3xl text-primary">{members.filter((m) => m.roles.includes("department_manager")).length}</p>
          <p className="text-stat-label mt-1.5">Managers</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-stat text-3xl text-foreground">{departments.length}</p>
          <p className="text-stat-label mt-1.5">Departments</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="managing_director">Managing Director</SelectItem>
            <SelectItem value="system_admin">System Admin</SelectItem>
            <SelectItem value="department_manager">Team Leader (HOD)</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="hr">HR</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All Departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} members</span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No members found</div>
        ) : (
          filtered.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors group">
              <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0">
                {getInitials(m.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              {m.mobile_no && (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{m.mobile_no}</span>
              )}
              <Badge className={`text-[10px] ${roleColors[m.roles[0]] || roleColors.employee}`}>
                {roleLabels[m.roles[0]] || "Employee"}
              </Badge>
              <span className="text-xs text-muted-foreground w-28 text-center">{m.department_name || "—"}</span>
              <div className="w-16 flex items-center gap-1.5">
                {shouldShowInPerformanceLeaderboard(m.roles) ? (
                  <>
                    <div className="flex-1 h-1.5 bg-muted rounded-full">
                      <div className={`h-full rounded-full ${m.performance_score >= 80 ? "bg-success" : m.performance_score >= 60 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${m.performance_score}%` }} />
                    </div>
                    <span className="text-[10px] font-mono-num text-muted-foreground">{m.performance_score}%</span>
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground w-full text-center">—</span>
                )}
              </div>
              <Badge variant={m.active ? "secondary" : "outline"} className="text-[10px]">
                {m.active ? "Active" : "Inactive"}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(m)}><Edit className="h-3.5 w-3.5 mr-2" />Edit Member</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSendReset(m)}><KeyRound className="h-3.5 w-3.5 mr-2" />Send Password Reset</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(m.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete Member</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>

      <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) { setShowAddModal(false); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New Member</DialogTitle></DialogHeader>
          {renderFormFields(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={formLoading}>{formLoading ? "Saving…" : "Create Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editMember} onOpenChange={(open) => { if (!open) { setEditMember(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Member</DialogTitle></DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditMember(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={formLoading}>{formLoading ? "Saving…" : "Update"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this team member?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {(() => {
                  const m = members.find((x) => x.id === deleteId);
                  if (!m) return null;
                  return (
                    <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                      <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0">
                        {getInitials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        {m.department_name && <p className="text-[11px] text-muted-foreground">{m.department_name} · {roleLabels[m.roles[0]] || "Employee"}</p>}
                      </div>
                    </div>
                  );
                })()}
                <p className="text-sm">
                  This permanently removes the account, profile, role assignments, and login access. <span className="text-destructive font-medium">This action cannot be undone.</span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete this member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamPage;
