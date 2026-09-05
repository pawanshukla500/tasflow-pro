// Daily company-wide pending-tasks snapshot for Managing Directors and System Admins.
// Schedule via pg_cron Mon–Sat 09:30 IST (04:00 UTC) — same time as the personal digest.
//
// Distinct from the other two admin-facing emails:
//   - send-daily-digest: personal, only the recipient's own assigned/created tasks
//   - send-weekly-pending-report: Friday-only week-in-review (top performers, employee
//     productivity, insights/recommendations)
// This one is "what does my team have pending right now" — a lean daily pulse, every working
// day, skipped when there's nothing open across the org.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { istToday, istAddDays } from '../_shared/ist.ts'
import { dispatchTransactionalEmail } from '../_shared/dispatch-transactional-email.ts'
import { isInternalServiceRequest } from '../_shared/internal-auth.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!await isInternalServiceRequest(req, serviceRoleKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const appUrl = (Deno.env.get('APP_URL') || 'https://task.youthnic.shop').replace(/\/$/, '')

  const today = istToday()
  const dueSoonEnd = istAddDays(today, 3)
  const dateLabel = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  })

  const [{ data: allTasks }, { data: departments }, { data: roles }, { data: profiles }] = await Promise.all([
    supabase.from('tasks').select('id, due_date, status, department_id, organization_id'),
    supabase.from('departments').select('id, name, organization_id'),
    supabase.from('user_roles').select('user_id, role').in('role', ['managing_director', 'system_admin']),
    supabase.from('profiles').select('id, name, email, active, organization_id'),
  ])

  const recipientIds = new Set((roles || []).map((r) => r.user_id))
  const recipients = (profiles || []).filter((p) => recipientIds.has(p.id))

  const results: { email: string; status: string; reason?: string }[] = []

  for (const r of recipients) {
    if (!r.email || r.active === false) continue

    const { data: prefs } = await supabase
      .from('notification_preferences').select('daily_digest').eq('user_id', r.id).maybeSingle()
    if (prefs?.daily_digest === false) {
      results.push({ email: r.email, status: 'skipped_pref' })
      continue
    }

    const orgTasks = (allTasks || []).filter((t) =>
      !r.organization_id || !t.organization_id || t.organization_id === r.organization_id
    )
    const orgDepts = (departments || []).filter((d) =>
      !r.organization_id || !d.organization_id || d.organization_id === r.organization_id
    )
    const deptName = new Map(orgDepts.map((d) => [d.id, d.name]))

    const byDept = new Map<string, { total: number; overdue: number; dueSoon: number; done: number }>()
    for (const t of orgTasks) {
      const key = t.department_id || 'unassigned'
      if (!byDept.has(key)) byDept.set(key, { total: 0, overdue: 0, dueSoon: 0, done: 0 })
      const row = byDept.get(key)!
      if (t.status === 'done') {
        row.done++
      } else {
        row.total++
        if (t.due_date && t.due_date < today) row.overdue++
        else if (t.due_date && t.due_date >= today && t.due_date <= dueSoonEnd) row.dueSoon++
      }
    }

    const rows = Array.from(byDept.entries())
      .map(([id, s]) => {
        const totalAll = s.total + s.done
        return {
          name: deptName.get(id) || 'Unassigned',
          total: s.total,
          overdue: s.overdue,
          dueSoon: s.dueSoon,
          completionPct: totalAll > 0 ? Math.round((s.done / totalAll) * 100) : 0,
        }
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total)

    if (rows.length === 0) {
      results.push({ email: r.email, status: 'skipped_empty' })
      continue
    }

    const totalPending = rows.reduce((a, row) => a + row.total, 0)
    const totalOverdue = rows.reduce((a, row) => a + row.overdue, 0)
    const totalDueSoon = rows.reduce((a, row) => a + row.dueSoon, 0)
    const completedNow = Array.from(byDept.values()).reduce((a, s) => a + s.done, 0)
    const companyAll = totalPending + completedNow
    const companyCompletionPct = companyAll > 0 ? Math.round((completedNow / companyAll) * 100) : 0

    const needsAttention = rows
      .filter((row) => row.overdue >= 2)
      .slice(0, 3)
      .map((row) => row.name)

    const dispatch = await dispatchTransactionalEmail({
      supabaseUrl,
      serviceRoleKey,
      templateName: 'admin-daily-overview',
      recipientEmail: r.email,
      idempotencyKey: `admin-daily-overview-${today}-${r.id}`,
      templateData: {
        title: `Team overview — ${totalPending} open · ${totalOverdue} overdue`,
        recipientName: r.name,
        dateLabel,
        totalPending,
        totalOverdue,
        totalDueSoon,
        companyCompletionPct,
        departments: rows,
        needsAttention,
        ctaUrl: `${appUrl}/reports`,
      },
    })
    results.push({ email: r.email, status: dispatch.status, reason: dispatch.reason })
  }

  return new Response(JSON.stringify({ ok: true, date: today, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
