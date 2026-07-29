import { useState, useEffect, useMemo } from "react";
import {
  Search, MoreHorizontal, Download, Plus, Trash2, Edit, Phone, KeyRound,
  Users, Building2, UserCog, CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { ScopeBanner } from "@/components/ScopeBanner";
import { ROLE_OPTIONS } from "@/lib/roleLabels";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { sendPasswordResetEmail } from "@/lib/passwordReset";
import { useToast } from "@/hooks/use-toast";
import { shouldShowInPerformanceLeaderboard } from "@/lib/performanceVisibility";
import { todayIST } from "@/lib/time";
import { cn } from "@/lib/utils";

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

/** Soft role chips — readable on light surfaces, brand-aligned */
const roleColors: Record<string, string> = {
  managing_director: "bg-primary text-primary-foreground border-transparent",
  system_admin: "bg-destructive/12 text-destructive border-destructive/20",
  department_manager: "bg-accent text-accent-foreground border-primary/15",
  employee: "bg-secondary text-secondary-foreground border-border",
  hr: "bg-warning/15 text-foreground border-warning/30",
};

const roleLabels: Record<string, string> = {
  managing_director: "Managing Director",
  system_admin: "System Admin",
  department_manager: "Dept Manager",
  employee: "Employee",
  hr: "HR",
};

const AVATAR_TONES = [
  "bg-primary/90 text-primary-foreground",
  "bg-[hsl(220,40%,42%)] text-white",
  "bg-[hsl(162,42%,32%)] text-white",
  "bg-[hsl(28,55%,42%)] text-white",
  "bg-[hsl(250,30%,45%)] text-white",
] as const;

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

function performanceBarClass(score: number) {
  if (score >= 80) return "bg-success";
  if (score >= 60) return "bg-warning";
  return "bg-destructive";
}

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

  const kpis = useMemo(() => [
    { label: "Total", value: members.length, tone: "text-foreground", icon: Users },
    { label: "Active", value: members.filter((m) => m.active).length, tone: "text-success", icon: CircleDot },
    { label: "Managers", value: members.filter((m) => m.roles.includes("department_manager")).length, tone: "text-primary", icon: UserCog },
    { label: "Departments", value: departments.length, tone: "text-foreground", icon: Building2 },
  ], [members, departments.length]);

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
    <div className="relative p-4 md:p-6 max-w-6xl mx-auto page-enter space-y-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-2 h-40 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 0% 0%, hsl(var(--primary) / 0.08), transparent 55%), radial-gradient(ellipse 45% 60% at 100% 0%, hsl(142 71% 45% / 0.05), transparent 50%)",
        }}
      />

      {accessScope.tier !== "member" && !accessScope.hasFullAccess && (
        <ScopeBanner scope={accessScope} departmentNames={departments.map((d) => d.name)} />
      )}

      <PageHeader
        className="relative mb-0"
        title="Team"
        description={
          accessScope.hasFullAccess
            ? `${members.length} members across the organization`
            : `${members.length} members in your department${departments.length === 1 ? `: ${departments[0].name}` : ""}`
        }
        actions={
          <>
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
            <Button size="sm" className="cursor-pointer" onClick={() => { resetForm(); setShowAddModal(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add Member
            </Button>
          </>
        }
      />

      {departments.length === 0 && isAdminOrMD && (
        <div className="relative rounded-lg border border-dashed border-primary/35 bg-primary/[0.04] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm font-semibold text-foreground">Setup step 1: Create departments</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add departments before assigning HODs and Team Members.</p>
          </div>
          <Button size="sm" variant="outline" className="cursor-pointer shrink-0" onClick={() => navigate("/departments")}>
            Go to Departments
          </Button>
        </div>
      )}

      {/* Compact KPI strip — denser than card grid */}
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/70 pb-3">
        {kpis.map((k, i) => (
          <div key={k.label} className="inline-flex items-center gap-2">
            {i > 0 && <span className="hidden sm:block w-px h-4 bg-border/80 -ml-2 mr-0" aria-hidden />}
            <k.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
            <span className={cn("font-mono-num text-lg font-semibold tabular-nums leading-none", k.tone)}>{k.value}</span>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</span>
          </div>
        ))}
      </div>

      {/* Filter toolbar */}
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-lg border bg-card/80 backdrop-blur-sm px-3 py-2.5 shadow-[0_1px_0_hsl(var(--border)/0.6)]">
        <div className="relative flex-1 min-w-0">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm bg-background"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[160px] h-9 text-sm cursor-pointer">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
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
            <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm cursor-pointer">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap sm:ml-1 font-mono-num">
            {filtered.length} shown
          </span>
        </div>
      </div>

      {/* Member directory table */}
      <div className="relative rounded-lg border bg-card overflow-hidden shadow-[0_1px_0_hsl(var(--border)/0.5)]">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading team…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No members found</p>
            <p className="text-xs text-muted-foreground">Try a different search or clear filters.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/40">
                <TableHead className="h-9 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground pl-4">Member</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground hidden md:table-cell">Contact</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Role</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground hidden lg:table-cell">Department</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground w-[7.5rem]">Score</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground hidden sm:table-cell">Status</TableHead>
                <TableHead className="h-9 w-10 pr-3"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id} className="group transition-colors duration-150">
                  <TableCell className="pl-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ring-2 ring-background",
                          avatarTone(m.name),
                        )}
                      >
                        {getInitials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate leading-tight">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{m.email}</p>
                        {m.position && (
                          <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5 md:hidden">{m.position}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 hidden md:table-cell">
                    {m.mobile_no ? (
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 font-mono-num">
                        <Phone className="h-3 w-3 shrink-0 opacity-70" />
                        {m.mobile_no}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-md border",
                        roleColors[m.roles[0]] || roleColors.employee,
                      )}
                    >
                      {roleLabels[m.roles[0]] || "Employee"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2.5 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{m.department_name || "—"}</span>
                  </TableCell>
                  <TableCell className="py-2.5">
                    {shouldShowInPerformanceLeaderboard(m.roles) ? (
                      <div className="flex items-center gap-2 min-w-[5.5rem]">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-[width] duration-300", performanceBarClass(m.performance_score))}
                            style={{ width: `${Math.max(0, Math.min(100, m.performance_score))}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono-num tabular-nums text-muted-foreground w-8 text-right">
                          {m.performance_score}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 hidden sm:table-cell">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[11px] font-medium",
                        m.active ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", m.active ? "bg-success" : "bg-muted-foreground/40")} />
                      {m.active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 pr-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 cursor-pointer opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(m)}>
                          <Edit className="h-3.5 w-3.5 mr-2" />Edit Member
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendReset(m)}>
                          <KeyRound className="h-3.5 w-3.5 mr-2" />Send Password Reset
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeleteId(m.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" />Delete Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) { setShowAddModal(false); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display">Add New Member</DialogTitle></DialogHeader>
          {renderFormFields(false)}
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => { setShowAddModal(false); resetForm(); }}>Cancel</Button>
            <Button className="cursor-pointer" onClick={handleCreate} disabled={formLoading}>{formLoading ? "Saving…" : "Create Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editMember} onOpenChange={(open) => { if (!open) { setEditMember(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display">Edit Member</DialogTitle></DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => { setEditMember(null); resetForm(); }}>Cancel</Button>
            <Button className="cursor-pointer" onClick={handleUpdate} disabled={formLoading}>{formLoading ? "Saving…" : "Update"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete this team member?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {(() => {
                  const m = members.find((x) => x.id === deleteId);
                  if (!m) return null;
                  return (
                    <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                          avatarTone(m.name),
                        )}
                      >
                        {getInitials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        {m.department_name && (
                          <p className="text-[11px] text-muted-foreground">
                            {m.department_name} · {roleLabels[m.roles[0]] || "Employee"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <p className="text-sm">
                  This permanently removes the account, profile, role assignments, and login access.{" "}
                  <span className="text-destructive font-medium">This action cannot be undone.</span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, delete this member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamPage;
