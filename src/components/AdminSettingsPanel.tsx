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
import { Shield, Building2, Mail, ScrollText, Users, Workflow, SearchCheck, MailWarning, MailCheck, FlaskConical, TriangleAlert, MessageCircle, Send } from "lucide-react";
import { formatDateTimeIST } from "@/lib/time";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface EmailDeliveryLookup {
  email: string;
  suppressed: boolean;
  suppression: { reason: string; created_at: string } | null;
  recentSends: { template_name: string; status: string; error_message?: string | null; created_at: string }[];
}

interface SmokeTestMember {
  name: string;
  email: string | null;
  roles: string[];
  active: boolean;
  pendingTaskCount: number;
  verdict: string;
  whatsappVerdict?: string;
  mobileNo?: string | null;
  displayMobile?: string | null;
  whatsappDigits?: string | null;
  phoneFormatOk?: boolean;
}

interface SmokeTestResult {
  checkedAt: string;
  todayIST: string;
  resend: {
    apiKeyConfigured: boolean;
    fromEmail: string;
    domains: { name: string; status: string }[];
    warning?: string;
  };
  kapso?: {
    configured: boolean;
    schedule: string;
  };
  weeklyLeadershipReport: {
    recipientCount: number;
    warning?: string;
    recipients: { name: string; email: string | null; roles: string[] }[];
  };
  recentFailures: { template_name: string; recipient_email: string; status: string; error_message?: string | null; created_at: string }[];
  members: SmokeTestMember[];
}

const VERDICT_LABEL: Record<string, string> = {
  would_send: "Email today",
  skipped_no_pending_tasks: "No pending work",
  skipped_pref_off: "Digest turned off",
  skipped_org_disabled: "Org digest disabled",
  skipped_suppressed: "Suppressed",
  skipped_inactive: "Inactive",
  skipped_no_email: "No email",
};

const WA_VERDICT_LABEL: Record<string, string> = {
  would_send: "WhatsApp today",
  skipped_no_pending_tasks: "No pending work",
  skipped_pref: "WhatsApp off",
  skipped_no_phone: "No mobile",
  skipped_no_kapso_key: "Kapso key missing",
  skipped_inactive: "Inactive",
};

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
  const [smokeTest, setSmokeTest] = useState<SmokeTestResult | null>(null);
  const [runningSmokeTest, setRunningSmokeTest] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

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
        email: { daily_digest_enabled: dailyDigest, digest_hour_ist: 10 },
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

  const runSmokeTest = async () => {
    setRunningSmokeTest(true);
    try {
      const data = await invokeEdgeFunction<SmokeTestResult>("email-system-smoke-test", { body: {} });
      setSmokeTest(data);
      const problems = data.members.filter((m) =>
        (m.verdict !== "would_send" && m.verdict !== "skipped_no_pending_tasks")
        || m.phoneFormatOk === false
      ).length;
      if (data.resend.warning || data.weeklyLeadershipReport.warning || problems > 0) {
        toast.warning(`Smoke test found ${problems} member issue${problems === 1 ? "" : "s"}${data.resend.warning ? " + a Resend warning" : ""} — see below`);
      } else {
        toast.success("Smoke test passed — no issues found");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Smoke test failed to run");
    } finally {
      setRunningSmokeTest(false);
    }
  };

  const sendDigestNow = async () => {
    setSendingDigest(true);
    try {
      const data = await invokeEdgeFunction<{
        ok?: boolean;
        date?: string;
        results?: { email: string; status: string; whatsapp?: string }[];
      }>("trigger-daily-digest", { body: {} });
      const results = data.results || [];
      const emailSent = results.filter((r) => r.status === "sent").length;
      const waSent = results.filter((r) => r.whatsapp === "sent").length;
      toast.success(
        `Today's digest queued (${data.date || "IST today"}): ${emailSent} email, ${waSent} WhatsApp. Same-day duplicates are skipped.`,
      );
      await runSmokeTest();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send digest");
    } finally {
      setSendingDigest(false);
      setConfirmSend(false);
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
                Consolidated pending-task briefing Mon–Sat at 10:00 AM IST (no Sunday). Users with no due or pending work are skipped.
              </p>
            </div>
            <Switch checked={dailyDigest} onCheckedChange={setDailyDigest} />
          </div>
          <div className="rounded-lg border border-dashed p-4 space-y-1">
            <p className="font-medium text-sm">Admin daily team overview</p>
            <p className="text-xs text-muted-foreground">
              Admins and Managing Directors also receive a company-wide pending-tasks snapshot Mon–Sat at 9:30 AM IST — separate from their own personal digest above, skipped when the team has nothing open.
            </p>
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

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">WhatsApp (KwikEngage)</h3>
        </div>
        <p className="text-xs text-muted-foreground max-w-2xl">
          Assignment alerts use an approved Utility template. Complete / Done replies mark
          the matching TaskFlow task done. Paste this webhook in KwikEngage Chats → Setup
          and append <code className="text-[11px]">?token=</code> plus Vault secret
          {" "}<code className="text-[11px]">kwikengage_webhook_secret</code> (never commit that token).
        </p>
        <p className="text-xs font-mono break-all rounded-md border bg-muted/40 px-3 py-2">
          https://nekdjoquirhecmejuoba.supabase.co/functions/v1/kwikengage-webhook
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Daily digest check &amp; send</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={runSmokeTest} disabled={runningSmokeTest || sendingDigest} size="sm" variant="outline">
              {runningSmokeTest ? "Checking…" : "Check who would get it"}
            </Button>
            <Button onClick={() => setConfirmSend(true)} disabled={runningSmokeTest || sendingDigest} size="sm">
              <Send className="h-4 w-4 mr-1.5" />
              {sendingDigest ? "Sending…" : "Send today's digest"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground max-w-2xl -mt-2">
          Scheduled Mon–Sat at <span className="font-medium text-foreground">10:00 AM IST</span> (skipped on Sunday).
          Check lists every teammate’s name and <code className="text-[11px]">+91 XXXXXXXXXX</code> mobile, plus who
          would get email and WhatsApp today. Send runs the same job as the cron; same-day duplicates are skipped.
        </p>

        {smokeTest && (
          <div className="max-w-3xl space-y-4">
            <div className={`rounded-lg border p-4 space-y-2 ${smokeTest.resend.warning ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"}`}>
              <div className="flex items-center gap-2">
                {smokeTest.resend.warning ? (
                  <TriangleAlert className="h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <MailCheck className="h-4 w-4 text-success shrink-0" />
                )}
                <span className="text-sm font-medium">
                  Resend — sending as {smokeTest.resend.fromEmail}
                </span>
              </div>
              {smokeTest.resend.warning ? (
                <p className="text-xs text-muted-foreground">{smokeTest.resend.warning}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Domain verified: {smokeTest.resend.domains.map((d) => `${d.name} (${d.status})`).join(", ") || "—"}
                </p>
              )}
            </div>

            <div className={`rounded-lg border p-4 space-y-2 ${smokeTest.kapso && !smokeTest.kapso.configured ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"}`}>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">
                  Kapso WhatsApp {smokeTest.kapso?.configured ? "configured" : "key missing"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {smokeTest.kapso?.schedule || "Mon–Sat 10:00 AM IST (no Sunday)"}
                {smokeTest.kapso && !smokeTest.kapso.configured
                  ? " — email still sends; WhatsApp is skipped_no_kapso_key until Vault kapso_api_key is set."
                  : "."}
              </p>
            </div>

            <div className={`rounded-lg border p-4 space-y-2 ${smokeTest.weeklyLeadershipReport.warning ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"}`}>
              <p className="text-sm font-medium">
                Admin/MD mail (daily overview + Friday report) — {smokeTest.weeklyLeadershipReport.recipientCount} recipient{smokeTest.weeklyLeadershipReport.recipientCount === 1 ? "" : "s"}
              </p>
              {smokeTest.weeklyLeadershipReport.warning ? (
                <p className="text-xs text-muted-foreground">{smokeTest.weeklyLeadershipReport.warning}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {smokeTest.weeklyLeadershipReport.recipients.map((r) => r.name).join(", ")}
                </p>
              )}
            </div>

            {smokeTest.recentFailures.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Real send failures — last 48h ({smokeTest.recentFailures.length})
                </p>
                <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                  {smokeTest.recentFailures.map((f, i) => (
                    <div key={i} className="p-2 text-xs flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-medium">{f.recipient_email}</span>
                        <span className="text-muted-foreground"> · {f.template_name}</span>
                        {f.error_message && <p className="text-muted-foreground truncate">{f.error_message}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="destructive" className="capitalize">{f.status}</Badge>
                        <span className="text-muted-foreground">{formatDateTimeIST(f.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Every teammate — name, +91 mobile, email & WhatsApp for {smokeTest.todayIST}
              </p>
              <div className="rounded-md border divide-y max-h-96 overflow-y-auto">
                {smokeTest.members.map((m, i) => (
                  <div key={i} className="p-2.5 text-xs flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium">{m.name || "(no name)"}</span>
                      <span className="text-muted-foreground"> · {m.email || "no email"}</span>
                      {(m.roles.includes("managing_director") || m.roles.includes("system_admin")) && (
                        <Badge variant="outline" className="ml-2 text-[10px]">Admin/MD</Badge>
                      )}
                      <p className="text-muted-foreground mt-0.5">
                        {m.mobileNo || "no mobile"}
                        {m.whatsappDigits ? ` → ${m.whatsappDigits}` : ""}
                        {m.phoneFormatOk === false && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">Fix number</Badge>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-muted-foreground">{m.pendingTaskCount} pending</span>
                      <div className="flex items-center gap-1">
                        <Badge variant={m.verdict === "would_send" ? "secondary" : m.verdict === "skipped_no_pending_tasks" ? "outline" : "destructive"}>
                          {VERDICT_LABEL[m.verdict] || m.verdict}
                        </Badge>
                        <Badge variant={m.whatsappVerdict === "would_send" ? "secondary" : m.whatsappVerdict === "skipped_no_pending_tasks" ? "outline" : "destructive"}>
                          {WA_VERDICT_LABEL[m.whatsappVerdict || ""] || m.whatsappVerdict || "—"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Checked {formatDateTimeIST(smokeTest.checkedAt)}
            </p>
          </div>
        )}
      </section>

      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send today's digest now?</AlertDialogTitle>
            <AlertDialogDescription>
              This emails and WhatsApps everyone with pending work, using the same 10:00 AM IST job.
              People who already received today are skipped. MD numbers are not force-smoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingDigest}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void sendDigestNow();
              }}
              disabled={sendingDigest}
            >
              {sendingDigest ? "Sending…" : "Send now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
