// Daily digest: pending tasks bifurcated (delayed / due soon / pending) per user.
// Schedule via pg_cron daily at 08:00 IST.
import { createClient } from "npm:@supabase/supabase-js@2";

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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
  const appUrl = (Deno.env.get("APP_URL") || "https://task.youthnic.shop").replace(/\/$/, "");
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dueSoonEnd = new Date(Date.now() + (5.5 * 60 * 60 * 1000) + 3 * 86400000).toISOString().slice(0, 10);
  const digestKey = `daily-digest-${today}`;
  const dateLabel = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, email, active, organization_id")
    .eq("active", true);

  const results: { email: string; status: string }[] = [];

  for (const profile of profiles || []) {
    if (!profile.email) continue;

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("daily_digest, task_due_reminder")
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

    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "x-internal-service-key": serviceRoleKey,
        },
        body: JSON.stringify({
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
        }),
      });
      results.push({ email: profile.email, status: "sent" });
    } catch {
      results.push({ email: profile.email, status: "failed" });
    }
  }

  // Executive daily insight for MD / System Admin (org-wide snapshot)
  const executiveResults: { email: string; status: string }[] = [];
  try {
    const [{ data: allTasks }, { data: departments }, { data: execRoles }] = await Promise.all([
      supabase.from("tasks").select("id, department_id, status, due_date, completed_at, organization_id"),
      supabase.from("departments").select("id, name, organization_id"),
      supabase.from("user_roles").select("user_id").in("role", ["managing_director", "system_admin"]),
    ]);
    const execIds = Array.from(new Set((execRoles || []).map((r) => r.user_id)));
    const { data: execProfiles } = await supabase
      .from("profiles")
      .select("id, name, email, active, organization_id")
      .in("id", execIds);

    for (const exec of execProfiles || []) {
      if (!exec.email || exec.active === false) continue;
      const orgTasks = (allTasks || []).filter((t) =>
        !exec.organization_id || !t.organization_id || t.organization_id === exec.organization_id
      );
      const orgDepts = (departments || []).filter((d) =>
        !exec.organization_id || !d.organization_id || d.organization_id === exec.organization_id
      );
      const deptName = new Map(orgDepts.map((d) => [d.id, d.name]));
      const byDept = new Map<string, { total: number; overdue: number; dueSoon: number }>();
      for (const t of orgTasks) {
        if (t.status === "done") continue;
        const key = t.department_id || "unassigned";
        if (!byDept.has(key)) byDept.set(key, { total: 0, overdue: 0, dueSoon: 0 });
        const row = byDept.get(key)!;
        row.total++;
        if (t.due_date && t.due_date < today) row.overdue++;
        else if (t.due_date && t.due_date <= dueSoonEnd) row.dueSoon++;
      }
      const deptRows = Array.from(byDept.entries())
        .map(([id, s]) => ({
          name: deptName.get(id) || "Unassigned",
          total: s.total,
          overdue: s.overdue,
          dueSoon: s.dueSoon,
          completionPct: 0,
          doneThisWeek: 0,
        }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.overdue - a.overdue);
      if (deptRows.length === 0) {
        executiveResults.push({ email: exec.email, status: "skipped_empty" });
        continue;
      }
      const totalPending = deptRows.reduce((a, r) => a + r.total, 0);
      const totalOverdue = deptRows.reduce((a, r) => a + r.overdue, 0);
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "x-internal-service-key": serviceRoleKey,
        },
        body: JSON.stringify({
          templateName: "weekly-leadership-insight",
          recipientEmail: exec.email,
          idempotencyKey: `exec-daily-${today}-${exec.id}`,
          templateData: {
            title: `Executive daily insight — ${totalPending} open tasks`,
            recipientName: exec.name,
            weekLabel: dateLabel,
            totalPending,
            totalOverdue,
            departments: deptRows,
            topPerformers: deptRows.filter((r) => r.overdue === 0).slice(0, 3).map((r) => r.name),
            needsAttention: deptRows.filter((r) => r.overdue >= 2).slice(0, 3).map((r) => r.name),
            ctaLabel: "Open Reports",
            ctaUrl: `${appUrl}/reports`,
          },
        }),
      });
      executiveResults.push({ email: exec.email, status: "sent" });
    }
  } catch {
    executiveResults.push({ email: "executive", status: "failed" });
  }

  return new Response(JSON.stringify({ ok: true, date: today, results, executiveResults }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
