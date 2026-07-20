import { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { toast } from "sonner";
import {
  Upload,
  Download,
  User,
  Bell,
  Palette,
  Plug,
  Settings2,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  RefreshCw,
  Unplug,
  CalendarDays,
} from "lucide-react";
import { firebaseChangePassword, isFirebaseAuthError } from "@/integrations/firebase/auth";
import { todayIST } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { AdminSettingsPanel } from "@/components/AdminSettingsPanel";
import { McpTokensPanel } from "@/components/McpTokensPanel";
import {
  type GoogleConnection,
  connectGoogle,
  disconnectGoogle,
  getGoogleConnection,
  syncGoogleCalendar,
} from "@/lib/googleIntegration";

const baseTabs = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "appearance", label: "Appearance", icon: Palette },
] as const;

const GmailLogo = ({ className = "h-6 w-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 256 193" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
    <path d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727Z" fill="#4285F4"/>
    <path d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.504l-31.156 17.837-27.026 25.798v98.91Z" fill="#34A853"/>
    <path d="m58.182 93.14-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.669 33.738-4.669 41.898L128 145.504z" fill="#EA4335"/>
    <path d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945l-16.292 12.218Z" fill="#FBBC04"/>
    <path d="m0 49.504 26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23v23.273Z" fill="#C5221F"/>
  </svg>
);

const notificationEvents = [
  { label: "Task assigned to me", dbKey: "task_assigned" as const },
  { label: "Task due / overdue reminders", dbKey: "task_due_reminder" as const },
  { label: "Monthly report email", dbKey: "monthly_report" as const },
  { label: "Daily digest summary", dbKey: "daily_digest" as const },
];

const SettingsPage = () => {
  const { user, refetchProfile, isAdminOrMD } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "profile";
    return new URLSearchParams(window.location.search).get("tab") || "profile";
  });
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [mobileNo, setMobileNo] = useState("+91 ");
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [emailPrefs, setEmailPrefs] = useState({
    task_assigned: true,
    task_due_reminder: true,
    monthly_report: true,
    daily_digest: true,
  });

  const [fontSize, setFontSize] = useState(() => localStorage.getItem("app-font-size") || "default");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setName(user.profile?.name || "");
    setPosition(user.profile?.position || "");
    setMobileNo(user.profile?.mobile_no || "+91 ");
  }, [user?.id, user?.profile?.name, user?.profile?.position, user?.profile?.mobile_no]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get("google");
    const reason = params.get("reason");
    if (googleStatus === "connected") {
      setActiveTab("integrations");
      toast.success("Google Calendar connected");
      window.history.replaceState({}, "", "/settings?tab=integrations");
    } else if (googleStatus === "error") {
      setActiveTab("integrations");
      toast.error(reason ? `Google connection failed: ${reason}` : "Google connection failed");
      window.history.replaceState({}, "", "/settings?tab=integrations");
    }
  }, []);

  const refreshGoogleConnection = useCallback(async () => {
    if (!user?.id) return;
    setGoogleLoading(true);
    try {
      setGoogleConnection(await getGoogleConnection());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Google connection");
    } finally {
      setGoogleLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshGoogleConnection();
  }, [refreshGoogleConnection]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("notification_preferences")
      .select("task_assigned, task_due_reminder, monthly_report, daily_digest")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEmailPrefs({
            task_assigned: data.task_assigned,
            task_due_reminder: data.task_due_reminder,
            monthly_report: data.monthly_report,
            daily_digest: data.daily_digest ?? true,
          });
        }
      });
  }, [user?.id]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("text-sm", "text-base", "text-lg");
    if (fontSize === "small") root.classList.add("text-sm");
    else if (fontSize === "large") root.classList.add("text-lg");
    else root.classList.add("text-base");
    localStorage.setItem("app-font-size", fontSize);
  }, [fontSize]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name, position, mobile_no: mobileNo })
        .eq("id", user.id);
      if (error) throw error;
      await refetchProfile();
      toast.success("Profile saved successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Fill in all password fields");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      await firebaseChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully");
    } catch (err: unknown) {
      if (isFirebaseAuthError(err, "auth/wrong-password") || isFirebaseAuthError(err, "auth/invalid-credential")) {
        toast.error("Current password is incorrect");
      } else if (isFirebaseAuthError(err, "auth/weak-password")) {
        toast.error("New password is too weak");
      } else if (isFirebaseAuthError(err, "auth/too-many-requests")) {
        toast.error("Too many attempts — try again in a few minutes");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to change password");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File must be under 2MB");
      return;
    }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "avatars");
      fd.append("filename", file.name);
      const data = await invokeEdgeFunction<{ url?: string }>("firebase-upload", { body: fd });
      if (!data?.url) throw new Error("Upload failed — check Firebase secrets in Supabase Edge Functions");
      const { error: upErr } = await supabase
        .from("profiles")
        .update({ avatar_url: data.url })
        .eq("id", user.id);
      if (upErr) throw upErr;
      await refetchProfile?.();
      toast.success("Profile photo updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveNotifications = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("notification_preferences").upsert({
        user_id: user.id,
        task_assigned: emailPrefs.task_assigned,
        task_due_reminder: emailPrefs.task_due_reminder,
        monthly_report: emailPrefs.monthly_report,
        daily_digest: emailPrefs.daily_digest,
      });
      if (error) throw error;
      toast.success("Notification preferences saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    try {
      const [{ data: assigneeRows }, { data: tasks }] = await Promise.all([
        supabase.from("task_assignees").select("task_id").eq("user_id", user.id),
        supabase.from("tasks").select("id, title, status, priority, due_date, created_at, created_by").order("created_at", { ascending: false }),
      ]);
      const myTaskIds = new Set((assigneeRows || []).map((a) => a.task_id));
      const mine = (tasks || []).filter((t) => myTaskIds.has(t.id) || t.created_by === user.id);
      const csv = [
        "Title,Status,Priority,Due Date,Created",
        ...mine.map((t) =>
          [`"${t.title}"`, t.status, t.priority, t.due_date || "", t.created_at].join(","),
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taskflow-export-${todayIST()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${mine.length} tasks`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleConnectGoogle = async () => {
    try {
      await connectGoogle(`${window.location.origin}/settings?tab=integrations`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start Google connection");
    }
  };

  const handleSyncGoogleCalendar = async () => {
    setGoogleSyncing(true);
    try {
      const result = await syncGoogleCalendar();
      await refreshGoogleConnection();
      toast.success(`Google Calendar synced (${result.synced} meetings)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync Google Calendar");
    } finally {
      setGoogleSyncing(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setGoogleDisconnecting(true);
    try {
      await disconnectGoogle();
      setGoogleConnection(null);
      toast.success("Google disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect Google");
    } finally {
      setGoogleDisconnecting(false);
    }
  };

  const getInitials = (n: string) => n.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);

  const tabs = isAdminOrMD
    ? [...baseTabs, { id: "admin", label: "Admin", icon: Settings2 }]
    : [...baseTabs];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5 page-enter">
      <PageHeader
        title="Settings"
        description="Manage your profile, notifications, and preferences."
        actions={
          <Button variant="outline" size="sm" onClick={handleExportData}>
            <Download className="h-3.5 w-3.5 mr-1" />Export Data
          </Button>
        }
      />

      <div className="flex gap-1 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && (
        <div className="glass-card rounded-xl p-6 space-y-6 animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold relative overflow-hidden">
              {user?.profile?.avatar_url ? (
                <img src={user.profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                getInitials(user?.profile?.name || "U")
              )}
            </div>
            <div>
              <label className="cursor-pointer">
                <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleAvatarUpload} />
                <Button variant="outline" size="sm" asChild disabled={avatarUploading}>
                  <span><Upload className="h-3.5 w-3.5 mr-1" />{avatarUploading ? "Uploading..." : "Upload Photo"}</span>
                </Button>
              </label>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG. Max 2MB. Stored in Firebase Storage.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="opacity-60" />
            </div>
            <div className="space-y-2">
              <Label>Mobile No.</Label>
              <Input
                value={mobileNo}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v.startsWith("+91")) setMobileNo("+91 " + v.replace(/^\+?91\s?/, ""));
                  else setMobileNo(v);
                }}
                placeholder="+91 XXXXX XXXXX"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={user?.roles[0]?.replace(/_/g, " ") || "Employee"} disabled className="opacity-60 capitalize" />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>

          {/* Change password */}
          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
              <div className="space-y-2">
                <Label>Current password</Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-2">
                <Label>New password</Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label>Confirm new password</Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? "Changing…" : "Change Password"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPasswords(!showPasswords)} className="text-muted-foreground">
                {showPasswords ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showPasswords ? "Hide" : "Show"} passwords
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="bg-card rounded-xl border p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Email Notification Preferences</h2>
          <div className="space-y-4">
            {notificationEvents.map(({ label, dbKey }) => (
              <div key={dbKey} className="flex items-center justify-between py-1">
                <span className="text-sm text-foreground">{label}</span>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={emailPrefs[dbKey]}
                    onCheckedChange={() =>
                      setEmailPrefs((prev) => ({ ...prev, [dbKey]: !prev[dbKey] }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">Email</span>
                </div>
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={handleSaveNotifications} disabled={saving}>
            {saving ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      )}

      {activeTab === "integrations" && (
        <div className="bg-card rounded-xl border p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Integrations</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Backend: Supabase (database + auth). Files: Firebase Storage.</p>
          </div>
          <div className="rounded-lg border bg-background/50">
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-11 h-11 rounded-lg bg-white border flex items-center justify-center shrink-0">
                  <GmailLogo className="h-6 w-6" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Google Workspace</p>
                    {googleConnection && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sync meetings from your Google Calendar into TaskFlow Calendar. Gmail task automation can be enabled later.
                  </p>
                  {googleConnection && (
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      <p>{googleConnection.google_email}</p>
                      <p>
                        Last calendar sync:{" "}
                        {googleConnection.last_calendar_sync_at
                          ? new Date(googleConnection.last_calendar_sync_at).toLocaleString()
                          : "Not synced yet"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {googleConnection ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSyncGoogleCalendar}
                      disabled={googleSyncing || googleLoading}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${googleSyncing ? "animate-spin" : ""}`} />
                      {googleSyncing ? "Syncing" : "Sync"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnectGoogle}
                      disabled={googleDisconnecting}
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1" />
                      {googleDisconnecting ? "Disconnecting" : "Disconnect"}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConnectGoogle}
                    disabled={googleLoading}
                  >
                    <CalendarDays className="h-3.5 w-3.5 mr-1" />
                    Connect Google
                  </Button>
                )}
              </div>
            </div>
            <div className="border-t px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">Gmail email-to-task automation</p>
                  <p className="text-xs text-muted-foreground">Planned next. Calendar sync does not request Gmail read access.</p>
                </div>
                <Button variant="ghost" size="sm" disabled>
                  Coming soon
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <McpTokensPanel />
          </div>
        </div>
      )}

      {activeTab === "appearance" && (
        <div className="bg-card rounded-xl border p-6 space-y-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Appearance</h2>

          <div className="space-y-3">
            <Label>Theme</Label>
            <div className="flex gap-3">
              {[
                { id: "light" as const, label: "Light", preview: "bg-background border" },
                { id: "dark" as const, label: "Dark", preview: "bg-[#1a1a2e] border border-[#333]" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTheme(t.id);
                    toast.success(`Theme: ${t.label}`);
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    theme === t.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className={`w-20 h-14 rounded-lg ${t.preview}`} />
                  <span className="text-xs font-medium text-foreground">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Font Size</Label>
            <Select value={fontSize} onValueChange={setFontSize}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {activeTab === "admin" && isAdminOrMD && (
        <div className="bg-card rounded-xl border p-6">
          <AdminSettingsPanel />
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
