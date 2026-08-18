// Admin/MD-only dry-run diagnostic for the whole email pipeline. Sends
// nothing — it re-evaluates send-daily-digest's exact eligibility logic per
// active user (would they get a digest today, and if not, why not), checks
// whether the weekly leadership report has any recipients at all, surfaces
// recent real send failures from email_send_log, and — critically — asks
// Resend directly whether the sending domain is actually verified.
//
// That last check exists because of a failure mode nothing else in this
// system catches: send-transactional-email returns success as soon as a
// message is enqueued; the actual Resend API call happens later inside
// process-email-queue. If Resend is still in sandbox mode (EMAIL_FROM is
// the default onboarding@resend.dev address, or the real domain was never
// verified), Resend accepts mail to the account owner's own verified
// address but rejects everyone else — which exactly matches "password
// reset arrived, the digest to a teammate never did."
import { createClient } from "npm:@supabase/supabase-js@2";
import { istToday } from "../_shared/ist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checkResendDomain(): Promise<{
  apiKeyConfigured: boolean;
  fromEmail: string;
  domains: { name: string; status: string }[];
  warning?: string;
}> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const fromEmail =
    Deno.env.get("EMAIL_FROM")?.trim() || Deno.env.get("GMAIL_SENDER_EMAIL")?.trim() || "task@youthnic.shop";

  if (!apiKey) {
    return {
      apiKeyConfigured: false,
      fromEmail,
      domains: [],
      warning: "RESEND_API_KEY is not set — no email of any kind can send.",
    };
  }

  if (fromEmail.endsWith("@resend.dev")) {
    return {
      apiKeyConfigured: true,
      fromEmail,
      domains: [],
      warning:
        'EMAIL_FROM is still the Resend sandbox address (onboarding@resend.dev). In sandbox mode Resend only delivers to the email address that owns the Resend account — every other recipient is silently rejected. Set EMAIL_FROM to an address on a verified domain.',
    };
  }

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        apiKeyConfigured: true,
        fromEmail,
        domains: [],
        warning: `Resend API rejected the domains check (HTTP ${res.status}) — RESEND_API_KEY may be invalid.`,
      };
    }
    const domains = ((body.data || []) as { name: string; status: string }[]).map((d) => ({
      name: d.name,
      status: d.status,
    }));
    const fromDomain = fromEmail.split("@")[1];
    const match = domains.find((d) => d.name === fromDomain);
    const warning = !match
      ? `No Resend domain matching "${fromDomain}" (from EMAIL_FROM=${fromEmail}) was found in this Resend account — sends to any recipient other than the account owner will likely fail.`
      : match.status !== "verified"
        ? `Domain "${fromDomain}" is registered in Resend but its status is "${match.status}", not "verified" — sends may be rejected or delayed until DNS verification completes.`
        : undefined;
    return { apiKeyConfigured: true, fromEmail, domains, warning };
  } catch (e) {
    return {
      apiKeyConfigured: true,
      fromEmail,
      domains: [],
      warning: `Could not reach Resend's API to check domain status: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

  const { data: isAdminOrMd } = await admin.rpc("is_admin_or_md", { _user_id: userData.user.id });
  if (!isAdminOrMd) return json({ error: "Forbidden — System Admin or Managing Director only" }, 403);

  const today = istToday();
  const failureSince = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const [
    resendCheck,
    { data: profiles },
    { data: rolesRows },
    { data: assignees },
    { data: openTasks },
    { data: suppressedRows },
    { data: prefsRows },
    { data: orgs },
    { data: recentFailures },
  ] = await Promise.all([
    checkResendDomain(),
    admin.from("profiles").select("id, name, email, active, organization_id"),
    admin.from("user_roles").select("user_id, role"),
    admin.from("task_assignees").select("task_id, user_id"),
    admin.from("tasks").select("id, created_by, due_date, status").neq("status", "done"),
    admin.from("suppressed_emails").select("email, reason"),
    admin.from("notification_preferences").select("user_id, daily_digest"),
    admin.from("organizations").select("id, settings"),
    admin
      .from("email_send_log")
      .select("template_name, recipient_email, status, error_message, created_at")
      .in("status", ["failed", "suppressed", "dlq"])
      .gte("created_at", failureSince)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const roleByUser = new Map<string, string[]>();
  for (const r of rolesRows || []) {
    const list = roleByUser.get(r.user_id) || [];
    list.push(r.role);
    roleByUser.set(r.user_id, list);
  }

  const suppressedSet = new Set((suppressedRows || []).map((s) => s.email.toLowerCase()));
  const prefByUser = new Map((prefsRows || []).map((p) => [p.user_id, p.daily_digest]));
  const orgDigestEnabled = new Map<string, boolean>();
  for (const o of orgs || []) {
    const settings = (o.settings || {}) as { email?: { daily_digest_enabled?: boolean } };
    orgDigestEnabled.set(o.id, settings.email?.daily_digest_enabled !== false);
  }

  // Dedup by task id per user (assigned OR created), same as send-daily-digest's
  // `merged` map — a user assigned to a task they also created is one task, not two.
  const taskById = new Map((openTasks || []).map((t) => [t.id, t]));
  const userTaskIds = new Map<string, Set<string>>();
  const addTask = (userId: string, taskId: string) => {
    if (!userTaskIds.has(userId)) userTaskIds.set(userId, new Set());
    userTaskIds.get(userId)!.add(taskId);
  };
  for (const a of assignees || []) {
    if (taskById.has(a.task_id)) addTask(a.user_id, a.task_id);
  }
  for (const t of openTasks || []) {
    if (t.created_by) addTask(t.created_by, t.id);
  }
  const tasksByUser = new Map<string, number>();
  for (const [uid, ids] of userTaskIds) tasksByUser.set(uid, ids.size);

  const members = (profiles || []).map((p) => {
    const roles = roleByUser.get(p.id) || ["employee"];
    const email = (p.email || "").toLowerCase();
    const pendingCount = tasksByUser.get(p.id) || 0;

    let verdict: string;
    if (!p.email) verdict = "skipped_no_email";
    else if (p.active === false) verdict = "skipped_inactive";
    else if (suppressedSet.has(email)) verdict = "skipped_suppressed";
    else if (p.organization_id && orgDigestEnabled.get(p.organization_id) === false) verdict = "skipped_org_disabled";
    else if (prefByUser.get(p.id) === false) verdict = "skipped_pref_off";
    else if (pendingCount === 0) verdict = "skipped_no_pending_tasks";
    else verdict = "would_send";

    return {
      name: p.name,
      email: p.email,
      roles,
      active: p.active !== false,
      pendingTaskCount: pendingCount,
      verdict,
    };
  });

  const adminRecipients = members.filter((m) =>
    m.roles.includes("managing_director") || m.roles.includes("system_admin")
  );

  return json({
    checkedAt: new Date().toISOString(),
    todayIST: today,
    resend: resendCheck,
    weeklyLeadershipReport: {
      recipientCount: adminRecipients.length,
      warning: adminRecipients.length === 0
        ? "No user has the managing_director or system_admin role — the Friday leadership report and any admin-targeted email have nobody to send to."
        : undefined,
      recipients: adminRecipients.map((m) => ({ name: m.name, email: m.email, roles: m.roles })),
    },
    recentFailures: recentFailures || [],
    members: members.sort((a, b) => {
      // Surface problems first: would_send and real skips before healthy no-task skips.
      const order = (v: string) => (v === "would_send" ? 0 : v === "skipped_no_pending_tasks" ? 3 : 1);
      return order(a.verdict) - order(b.verdict);
    }),
  });
});
