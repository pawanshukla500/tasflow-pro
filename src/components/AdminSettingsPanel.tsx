import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Building2, Mail, ScrollText, Users, Workflow } from "lucide-react";
import { formatDateTimeIST } from "@/lib/time";

export function AdminSettingsPanel() {
  const { user, isAdminOrMD, refetchProfile } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [orgDomain, setOrgDomain] = useState("");
  const [dailyDigest, setDailyDigest] = useState(true);
  const [digestHour, setDigestHour] = useState("8");
  const [auditLogs, setAuditLogs] = useState<{ action: string; created_at: string; metadata: unknown }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.organization) return;
    setOrgName(user.organization.name);
    setOrgDomain(user.organization.domain || "");
    const settings = user.organization.settings as { email?: { daily_digest_enabled?: boolean; digest_hour_ist?: number } };
    setDailyDigest(settings?.email?.daily_digest_enabled !== false);
    setDigestHour(String(settings?.email?.digest_hour_ist ?? 8));
  }, [user?.organization]);

  useEffect(() => {
    if (!user?.organization?.id || !isAdminOrMD) return;
    supabase
      .from("audit_logs")
      .select("action, created_at, metadata")
      .eq("organization_id", user.organization.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error) setAuditLogs(data || []);
      });
  }, [user?.organization?.id, isAdminOrMD]);

  if (!isAdminOrMD) return null;

  const saveOrgSettings = async () => {
    if (!user?.organization?.id) return;
    setSaving(true);
    try {
      const settings = {
        ...(user.organization.settings || {}),
        email: { daily_digest_enabled: dailyDigest, digest_hour_ist: Number(digestHour) },
      };
      const { error } = await supabase.from("organizations").update({
        name: orgName,
        domain: orgDomain || null,
        settings,
      }).eq("id", user.organization.id);
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        organization_id: user.organization.id,
        actor_id: user.id,
        action: "organization.settings_updated",
        entity_type: "organization",
        entity_id: user.organization.id,
        metadata: { name: orgName, domain: orgDomain },
      });

      await refetchProfile();
      toast.success("Organization settings saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Organization Settings</h3>
        </div>
        <div className="grid gap-4 max-w-lg">
          <div className="space-y-2">
            <Label>Organization name</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Primary domain</Label>
            <Input value={orgDomain} onChange={(e) => setOrgDomain(e.target.value)} placeholder="vbexports.co.in" />
          </div>
          <Button onClick={saveOrgSettings} disabled={saving}>{saving ? "Saving…" : "Save organization"}</Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Email Settings</h3>
        </div>
        <div className="space-y-4 max-w-lg">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">Daily digest emails</p>
              <p className="text-xs text-muted-foreground">Send pending tasks & workflows summary each morning</p>
            </div>
            <Switch checked={dailyDigest} onCheckedChange={setDailyDigest} />
          </div>
          <div className="space-y-2">
            <Label>Digest send hour (IST)</Label>
            <Select value={digestHour} onValueChange={setDigestHour}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[6, 7, 8, 9, 10].map((h) => (
                  <SelectItem key={h} value={String(h)}>{h}:00 AM</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Security</h3>
        </div>
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <p><span className="text-muted-foreground">Auth provider:</span> Firebase Authentication</p>
          <p><span className="text-muted-foreground">Domain type:</span> {user?.organization?.domain_type || "—"}</p>
          <p><span className="text-muted-foreground">Your role:</span> {user?.roles.join(", ") || "—"}</p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Audit Logs</h3>
        </div>
        <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
          {auditLogs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No audit events yet.</p>
          ) : auditLogs.map((log, i) => (
            <div key={i} className="p-3 text-sm flex justify-between gap-4">
              <span className="font-medium">{log.action}</span>
              <span className="text-muted-foreground text-xs shrink-0">
                {formatDateTimeIST(log.created_at)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" /><span className="text-sm">User management → Team page</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Workflow className="h-4 w-4" /><span className="text-sm">Workflow configuration → Workflows page</span>
        </div>
      </section>
    </div>
  );
}
