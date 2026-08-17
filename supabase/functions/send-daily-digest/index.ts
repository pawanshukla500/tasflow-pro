// Daily digest: consolidated pending / due / overdue tasks (+ workflow stages) per active user.
// Schedule via pg_cron Mon–Sat at 09:30 IST (04:00 UTC). Skips users with nothing pending.
import { createClient } from "npm:@supabase/supabase-js@2";
import { istToday, istAddDays } from "../_shared/ist.ts";
import { dispatchTransactionalEmail } from "../_shared/dispatch-transactional-email.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("x-internal-service-key") !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const appUrl = (Deno.env.get("APP_URL") || "https://task.youthnic.shop").replace(/\/$/, "");
  const today = istToday();
  const dueSoonEnd = istAddDays(today, 3);
  const digestKey = `daily-digest-${today}`;
  const dateLabel = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric", month: "short", year: "numeric",
  });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, email, active, organization_id")
    .eq("active", true);

  const orgDigestCache = new Map<string, boolean>();
  const results: { email: string; status: string; reason?: string }[] = [];

  for (const profile of profiles || []) {
    if (!profile.email) continue;

    if (profile.organization_id) {
      let orgEnabled = orgDigestCache.get(profile.organization_id);
      if (orgEnabled === undefined) {
        const { data: org } = await supabase
          .from("organizations")
          .select("settings")
          .eq("id", profile.organization_id)
          .maybeSingle();
        const settings = (org?.settings || {}) as { email?: { daily_digest_enabled?: boolean } };
        orgEnabled = settings.email?.daily_digest_enabled !== false;
        orgDigestCache.set(profile.organization_id, orgEnabled);
      }
      if (!orgEnabled) {
        results.push({ email: profile.email, status: "skipped_org_disabled" });
        continue;
      }
    }

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("daily_digest")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (prefs && prefs.daily_digest === false) {
      results.push({ email: profile.email, status: "skipped_pref" });
      continue;
    }

    const { data: assigned } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", profile.id);
    const taskIds = (assigned || []).map((a) => a.task_id);

    let assignedTasks: TaskRow[] = [];
    if (taskIds.length) {
      let taskQuery = supabase
        .from("tasks")
        .select("id, title, due_date, status, priority, organization_id")
        .in("id", taskIds)
        .neq("status", "done");
      if (profile.organization_id) {
        taskQuery = taskQuery.or(`organization_id.eq.${profile.organization_id},organization_id.is.null`);
      }
      const { data: tasks } = await taskQuery;
      assignedTasks = tasks || [];
    }

    let createdQuery = supabase
      .from("tasks")
      .select("id, title, due_date, status, priority, organization_id")
      .eq("created_by", profile.id)
      .neq("status", "done");
    if (profile.organization_id) {
      createdQuery = createdQuery.or(`organization_id.eq.${profile.organization_id},organization_id.is.null`);
    }
    const { data: createdTasks } = await createdQuery;

    const merged = new Map<string, TaskRow>();
    for (const t of [...assignedTasks, ...(createdTasks || [])]) merged.set(t.id, t);
    const allTasks = Array.from(merged.values());

    const delayed = allTasks.filter((t) => t.due_date && t.due_date < today);
    const dueSoon = allTasks.filter((t) => t.due_date && t.due_date >= today && t.due_date <= dueSoonEnd);
    const pending = allTasks.filter((t) => !t.due_date || (t.due_date > dueSoonEnd));

    const criticalCount = allTasks.filter((t) => t.priority === "critical").length;
    const highCount = allTasks.filter((t) => t.priority === "high").length;
    const mediumCount = allTasks.filter((t) => t.priority === "medium").length;
    const lowCount = allTasks.filter((t) => t.priority === "low").length;

    const { data: myStages } = await supabase
      .from("workflow_stages")
      .select("id, workflow_id, name, status, started_at, tat_hours")
      .eq("assignee_user_id", profile.id)
      .in("status", ["pending", "in_progress"]);

    const workflowIds = Array.from(new Set((myStages || []).map((s) => s.workflow_id)));
    const { data: myWorkflows } = workflowIds.length
      ? await supabase.from("workflows").select("id, title, tracking_number, priority").in("id", workflowIds)
      : { data: [] as { id: string; title: string; tracking_number: string | null; priority: string }[] };

    const wfMap = new Map((myWorkflows || []).map((w) => [w.id, w]));
    const nowMs = Date.now();

    const workflowItems = (myStages || []).map((s) => {
      const wf = wfMap.get(s.workflow_id);
      const dueMs = s.started_at && s.tat_hours
        ? new Date(s.started_at).getTime() + s.tat_hours * 3600 * 1000
        : null;
      return {
        id: s.workflow_id,
        title: wf?.title || "Workflow",
        trackingNumber: wf?.tracking_number || undefined,
        stageName: s.name,
        status: s.status,
        dueDate: dueMs ? new Date(dueMs).toISOString().slice(0, 16).replace("T", " ") : undefined,
        url: `${appUrl}/workflows?wf=${s.workflow_id}&stage=${s.id}`,
        overdue: dueMs ? nowMs > dueMs : false,
      };
    });

    const overdueWorkflows = workflowItems.filter((w) => w.overdue);
    const activeWorkflows = workflowItems.filter((w) => !w.overdue);

    // No email when the user has nothing due / pending (tasks or workflow stages).
    if (allTasks.length === 0 && workflowItems.length === 0) {
      results.push({ email: profile.email, status: "skipped_empty" });
      continue;
    }

    const fmt = (t: TaskRow) => ({
      id: t.id,
      title: t.title,
      dueDate: t.due_date,
      status: t.status,
      priority: t.priority,
      url: `${appUrl}/my-tasks?task=${t.id}`,
    });

    const dispatch = await dispatchTransactionalEmail({
      supabaseUrl,
      serviceRoleKey,
      templateName: "daily-digest",
      recipientEmail: profile.email,
      idempotencyKey: `${digestKey}-${profile.id}`,
      templateData: {
        title: `Your daily summary — ${allTasks.length} task${allTasks.length === 1 ? "" : "s"}, ${workflowItems.length} workflow${workflowItems.length === 1 ? "" : "s"}`,
        recipientName: profile.name,
        dateLabel,
        delayed: delayed.map(fmt),
        dueSoon: dueSoon.map(fmt),
        pending: pending.map(fmt),
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        workflowItems: activeWorkflows.map(({ overdue: _, ...w }) => w),
        overdueWorkflows: overdueWorkflows.map(({ overdue: _, ...w }) => w),
      },
    });
    results.push({ email: profile.email, status: dispatch.status, reason: dispatch.reason });
  }

  // Admin / MD department overlook is Friday-only via send-weekly-pending-report.
  return new Response(JSON.stringify({ ok: true, date: today, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
