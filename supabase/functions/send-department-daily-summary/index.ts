// Daily department summary for department managers (team workload, overdue, pending).
// Schedule via pg_cron daily at 08:30 IST (after user digests).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  department_id: string | null;
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
  const dueSoonEnd = new Date(Date.now() + (5.5 * 60 * 60 * 1000) + 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  const dateLabel = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  const [{ data: managers }, { data: departments }, { data: allTasks }] = await Promise.all([
    supabase.from("department_managers").select("user_id, department_id"),
    supabase.from("departments").select("id, name, organization_id"),
    supabase.from("tasks").select("id, title, due_date, status, department_id").neq("status", "done"),
  ]);

  const deptName = new Map<string, string>();
  const deptOrg = new Map<string, string | null>();
  for (const d of departments || []) {
    deptName.set(d.id, d.name);
    deptOrg.set(d.id, d.organization_id ?? null);
  }

  const managerDepts = new Map<string, Set<string>>();
  for (const m of managers || []) {
    if (!managerDepts.has(m.user_id)) managerDepts.set(m.user_id, new Set());
    managerDepts.get(m.user_id)!.add(m.department_id);
  }

  const results: { email: string; status: string }[] = [];

  for (const [userId, deptIds] of managerDepts) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, email, active, organization_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.email || profile.active === false) continue;

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("daily_digest")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefs?.daily_digest === false) {
      results.push({ email: profile.email, status: "skipped_pref" });
      continue;
    }

    const managedIds = Array.from(deptIds);
    const deptTasks = (allTasks || []).filter((t: TaskRow) =>
      t.department_id && managedIds.includes(t.department_id)
      && (deptOrg.get(t.department_id) === profile.organization_id
        || deptOrg.get(t.department_id) === null
        || profile.organization_id === null)
    );

    const delayed = deptTasks.filter((t) => t.due_date && t.due_date < today);
    const dueSoon = deptTasks.filter((t) =>
      t.due_date && t.due_date >= today && t.due_date <= dueSoonEnd
    );
    const pending = deptTasks.filter((t) => !t.due_date || (t.due_date > dueSoonEnd));

    if (deptTasks.length === 0) {
      results.push({ email: profile.email, status: "skipped_empty" });
      continue;
    }

    const deptSummaries = managedIds.map((id) => {
      const tasks = deptTasks.filter((t) => t.department_id === id);
      return {
        name: deptName.get(id) || "Department",
        total: tasks.length,
        overdue: tasks.filter((t) => t.due_date && t.due_date < today).length,
        dueSoon: tasks.filter((t) =>
          t.due_date && t.due_date >= today && t.due_date <= dueSoonEnd
        ).length,
      };
    }).filter((d) => d.total > 0);

    const fmt = (t: TaskRow) => ({
      id: t.id,
      title: t.title,
      dueDate: t.due_date,
      status: t.status,
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
          templateName: "department-daily-summary",
          recipientEmail: profile.email,
          idempotencyKey: `dept-daily-${today}-${userId}`,
          templateData: {
            title: `Department summary — ${deptTasks.length} open tasks`,
            recipientName: profile.name,
            dateLabel,
            departments: deptSummaries,
            delayed: delayed.map(fmt),
            dueSoon: dueSoon.map(fmt),
            pending: pending.map(fmt),
            ctaUrl: `${appUrl}/reports`,
          },
        }),
      });
      results.push({ email: profile.email, status: "sent" });
    } catch {
      results.push({ email: profile.email, status: "failed" });
    }
  }

  return new Response(JSON.stringify({ ok: true, date: today, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
