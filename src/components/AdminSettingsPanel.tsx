import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { toast } from "sonner";
import { Shield, Building2, Mail, ScrollText, Users, Workflow, SearchCheck, MailWarning, MailCheck } from "lucide-react";
import { formatDateTimeIST } from "@/lib/time";

interface EmailDeliveryLookup {
  email: string;
  suppressed: boolean;
  suppression: { reason: string; created_at: string } | null;
  recentSends: { template_name: string; status: string; error_message?: string | null; created_at: string }[];
}

export function AdminSettingsPanel() {
  const { user, isAdminOrMD, refetchProfile } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [orgDomain, setOrgDomain] = useState("");
  const [dailyDigest, setDailyDigest] = useState(true);
  const [auditLogs, setAuditLogs] = useState<{ action: string; created_at: string; metadata: unknown }[]>([]);
  const [saving, setSaving] = useState(false);
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupResult, setLookupResult] = useState<EmailDeliveryLookup | null>(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const [removingSuppression, setRemovingSuppression] = useState(false);

  useEffect(() => {
    if (!user?.organization) return;
    setOrgName(user.organization.name);
    setOrgDomain(user.organization.domain || "");
    const settings = user.organization.settings as { email?: { daily_digest_enabled?: boolean } };
    setDailyDigest(settings?.email?.daily_digest_enabled !== false);
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
        email: { daily_digest_enabled: dailyDigest, digest_hour_ist: 9.5 },
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

  const checkEmailDelivery = async () => {
    const email = lookupEmail.trim().toLowerCase();
    if (!email) return;
    setCheckingDelivery(true);
    try {
      const data = await invokeEdgeFunction<EmailDeliveryLookup>("manage-email-suppression", {
        body: { email, action: "lookup" },
      });
      setLookupResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
      setLookupResult(null);
    } finally {
      setCheckingDelivery(false);
    }
  };

  const removeSuppression = async () => {
    if (!lookupResult) return;
    setRemovingSuppression(true);
    try {
      await invokeEdgeFunction("manage-email-suppression", {
        body: { email: lookupResult.email, action: "unsuppress" },
      });
      toast.success(`${lookupResult.email} can receive email again`);
      await checkEmailDelivery();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove suppression");
    } finally {
      setRemovingSuppression(false);
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
              <p className="text-xs text-muted-foreground">
                Consolidated pending-task briefing Mon–Sat at 9:30 AM IST. Users with no due or pending work are skipped.
              </p>
            </div>
            <Switch checked={dailyDigest} onCheckedChange={setDailyDigest} />
          </div>
          <div className="rounded-lg border border-dashed p-4 space-y-1">
            <p className="font-medium text-sm">Friday management overview</p>
            <p className="text-xs text-muted-foreground">
              Admins and Managing Directors receive a weekly department performance overview every Friday (completion %, overdue, top teams, recommendations).
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <SearchCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Email Delivery Diagnostics</h3>
        </div>
        <p className="text-xs text-muted-foreground max-w-lg -mt-2">
          A recipient who bounced, complained, or clicked "Unsubscribe" on any TaskFlow email gets
          zero further emails (digests, reports, assignments) with no notice — check here instead
          of guessing why someone isn't receiving mail.
        </p>
        <div className="max-w-lg space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="name@company.com"
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && checkEmailDelivery()}
            />
            <Button onClick={checkEmailDelivery} disabled={checkingDelivery || !lookupEmail.trim()}>
              {checkingDelivery ? "Checking…" : "Check"}
            </Button>
          </div>

          {lookupResult && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {lookupResult.suppressed ? (
                    <MailWarning className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <MailCheck className="h-4 w-4 text-success shrink-0" />
                  )}
                  <span className="text-sm font-medium">{lookupResult.email}</span>
                </div>
                {lookupResult.suppressed ? (
                  <Badge variant="destructive">Suppressed</Badge>
                ) : (
                  <Badge variant="secondary">Deliverable</Badge>
                )}
              </div>

              {lookupResult.suppressed && lookupResult.suppression && (
                <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Reason: <span className="font-medium text-foreground capitalize">{lookupResult.suppression.reason}</span>
                    {" · "}
                    {formatDateTimeIST(lookupResult.suppression.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Every digest, report, and assignment email to this address is being silently
                    skipped. Only remove this if you've confirmed with the recipient they want
                    email again — an unsubscribe/complaint suppression exists to respect that choice.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={removeSuppression}
                    disabled={removingSuppression}
                  >
                    {removingSuppression ? "Removing…" : "Remove suppression"}
                  </Button>
                </div>
              )}

              {lookupResult.recentSends.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent send attempts</p>
                  <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                    {lookupResult.recentSends.map((s, i) => (
                      <div key={i} className="p-2 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium">{s.template_name}</span>
                          {s.error_message && (
                            <p className="text-muted-foreground truncate">{s.error_message}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={
                              s.status === "sent" ? "secondary"
                                : s.status === "pending" ? "outline"
                                : "destructive"
                            }
                            className="capitalize"
                          >
                            {s.status}
                          </Badge>
                          <span className="text-muted-foreground">{formatDateTimeIST(s.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lookupResult.recentSends.length === 0 && (
                <p className="text-xs text-muted-foreground">No send attempts logged for this address yet.</p>
              )}
            </div>
          )}
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
