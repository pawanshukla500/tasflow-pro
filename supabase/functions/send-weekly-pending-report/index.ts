// Friday leadership overlook for Managing Directors and System Admins.
// Schedule via pg_cron every Friday 09:00 IST (03:30 UTC).
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
  const weekAgo = istAddDays(today, -7)
  const weekKey = (() => {
    const d = new Date(`${today}T12:00:00+05:30`)
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
  })()
  const weekLabel = new Date(`${today}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const fridayLabel = `Week ending ${weekLabel}`

  const [{ data: allTasks }, { data: departments }, { data: assignees }, { data: profiles }] = await Promise.all([
    supabase.from('tasks').select('id, title, due_date, priority, department_id, status, completed_at, organization_id, created_by'),
    supabase.from('departments').select('id, name, organization_id'),
    supabase.from('task_assignees').select('task_id, user_id'),
    supabase.from('profiles').select('id, name, organization_id, active'),
  ])

  const { data: roles } = await supabase
    .from('user_roles').select('user_id, role')
    .in('role', ['managing_director', 'system_admin'])
  const recipientIds = Array.from(new Set((roles || []).map((r) => r.user_id)))
  const { data: recipients } = await supabase
    .from('profiles').select('id, name, email, active, organization_id').in('id', recipientIds)

  const taskAssignees = new Map<string, string[]>()
  for (const a of assignees || []) {
    const list = taskAssignees.get(a.task_id) || []
    list.push(a.user_id)
    taskAssignees.set(a.task_id, list)
  }
  const profileName = new Map((profiles || []).map((p) => [p.id, p.name || 'Team member']))

  const results: { user: string; ok: boolean; error?: string }[] = []
  for (const r of recipients || []) {
    if (!r.email || r.active === false) continue

    const orgTasks = (allTasks || []).filter((t) =>
      !r.organization_id || !t.organization_id || t.organization_id === r.organization_id
    )
    const orgDepts = (departments || []).filter((d) =>
      !r.organization_id || !d.organization_id || d.organization_id === r.organization_id
    )

    const deptNameLocal = new Map<string, string>()
    for (const d of orgDepts) deptNameLocal.set(d.id, d.name)

    const byDept = new Map<string, {
      total: number; overdue: number; dueSoon: number; done: number; doneThisWeek: number
    }>()

    const byEmployee = new Map<string, { completedThisWeek: number; overdue: number; open: number }>()

    for (const t of orgTasks) {
      const key = t.department_id || 'unassigned'
      if (!byDept.has(key)) byDept.set(key, { total: 0, overdue: 0, dueSoon: 0, done: 0, doneThisWeek: 0 })
      const row = byDept.get(key)!

      const assigneeIds = taskAssignees.get(t.id) || (t.created_by ? [t.created_by] : [])

      if (t.status === 'done') {
        row.done++
        const doneThisWeek = !!(t.completed_at && t.completed_at.slice(0, 10) >= weekAgo)
        if (doneThisWeek) {
          row.doneThisWeek++
          for (const uid of assigneeIds) {
            if (!byEmployee.has(uid)) byEmployee.set(uid, { completedThisWeek: 0, overdue: 0, open: 0 })
            byEmployee.get(uid)!.completedThisWeek++
          }
        }
      } else {
        row.total++
        const isOverdue = !!(t.due_date && t.due_date < today)
        const isDueSoon = !!(t.due_date && t.due_date >= today && t.due_date <= istAddDays(today, 3))
        if (isOverdue) row.overdue++
        else if (isDueSoon) row.dueSoon++

        for (const uid of assigneeIds) {
          if (!byEmployee.has(uid)) byEmployee.set(uid, { completedThisWeek: 0, overdue: 0, open: 0 })
          const emp = byEmployee.get(uid)!
          emp.open++
          if (isOverdue) emp.overdue++
        }
      }
    }

    const rows = Array.from(byDept.entries())
      .map(([id, s]) => {
        const totalAll = s.total + s.done
        const completionPct = totalAll > 0 ? Math.round((s.done / totalAll) * 100) : 0
        return {
          name: deptNameLocal.get(id) || 'Unassigned',
          total: s.total,
          overdue: s.overdue,
          dueSoon: s.dueSoon,
          completed: s.done,
          completionPct,
          doneThisWeek: s.doneThisWeek,
        }
      })
      .filter((row) => row.total > 0 || row.doneThisWeek > 0 || row.completed > 0)
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total)

    if (rows.length === 0) {
      results.push({ user: r.email, ok: true, error: 'skipped_empty' })
      continue
    }

    const totalPending = rows.reduce((a, row) => a + row.total, 0)
    const totalOverdue = rows.reduce((a, row) => a + row.overdue, 0)
    const totalCompleted = rows.reduce((a, row) => a + row.completed, 0)
    const totalDoneThisWeek = rows.reduce((a, row) => a + row.doneThisWeek, 0)
    const companyAll = totalPending + totalCompleted
    const companyCompletionPct = companyAll > 0 ? Math.round((totalCompleted / companyAll) * 100) : 0

    const topPerformers = [...rows]
      .filter((row) => row.overdue === 0 && (row.completionPct >= 70 || row.doneThisWeek >= 3))
      .sort((a, b) => b.completionPct - a.completionPct || b.doneThisWeek - a.doneThisWeek)
      .slice(0, 3)
      .map((row) => row.name)
    const needsAttention = [...rows]
      .filter((row) => row.overdue >= 2 || (row.total > 0 && row.completionPct < 50))
      .sort((a, b) => b.overdue - a.overdue || a.completionPct - b.completionPct)
      .slice(0, 3)
      .map((row) => row.name)

    const topEmployees = Array.from(byEmployee.entries())
      .map(([uid, s]) => ({
        name: profileName.get(uid) || 'Team member',
        completedThisWeek: s.completedThisWeek,
        overdue: s.overdue,
        open: s.open,
      }))
      .filter((e) => e.completedThisWeek > 0 || e.overdue > 0)
      .sort((a, b) => b.completedThisWeek - a.completedThisWeek || a.overdue - b.overdue)
      .slice(0, 5)

    const insights: string[] = []
    if (topPerformers[0]) {
      insights.push(`${topPerformers[0]} is leading department health this week.`)
    }
    if (totalOverdue > 0) {
      const share = totalPending > 0 ? Math.round((totalOverdue / totalPending) * 100) : 0
      insights.push(`${totalOverdue} overdue tasks (${share}% of open work) need leadership follow-up.`)
    }
    if (totalDoneThisWeek > 0) {
      insights.push(`Teams closed ${totalDoneThisWeek} tasks in the last 7 days — company completion sits at ${companyCompletionPct}%.`)
    }
    if (needsAttention[0] && !insights.some((i) => i.includes(needsAttention[0]))) {
      insights.push(`${needsAttention[0]} shows elevated overdue / low completion — prioritize a check-in.`)
    }

    const recommendations: string[] = []
    if (needsAttention.length > 0) {
      recommendations.push(`Review ${needsAttention.join(' & ')} overdue lists in Reports and rebalance assignees if capacity is uneven.`)
    }
    if (topPerformers.length > 0) {
      recommendations.push(`Share practices from ${topPerformers[0]} with other departments in the next standup.`)
    }
    if (totalOverdue >= 5) {
      recommendations.push('Schedule a short overdue scrub this week — clear critical/high items first.')
    }
    if (recommendations.length === 0) {
      recommendations.push('Keep the Mon–Sat 09:30 IST briefings enabled so individuals stay on top of pending work.')
    }

    try {
      const dispatch = await dispatchTransactionalEmail({
        supabaseUrl,
        serviceRoleKey,
        templateName: 'weekly-leadership-insight',
        recipientEmail: r.email,
        idempotencyKey: `weekly-insight-friday-${r.id}-${weekKey}`,
        templateData: {
          title: `Friday management overview — ${companyCompletionPct}% completion · ${totalPending} open`,
          recipientName: r.name,
          weekLabel: fridayLabel,
          totalPending,
          totalOverdue,
          totalCompleted,
          totalDoneThisWeek,
          companyCompletionPct,
          departments: rows,
          topPerformers,
          needsAttention,
          topEmployees,
          insights,
          recommendations,
          ctaLabel: 'Open Reports',
          ctaUrl: `${appUrl}/reports`,
        },
      })
      results.push({
        user: r.email,
        ok: dispatch.status === 'sent' || dispatch.status === 'deduped',
        error: dispatch.status === 'sent' || dispatch.status === 'deduped' ? undefined : (dispatch.reason || dispatch.status),
      })
    } catch (e) {
      results.push({ user: r.email, ok: false, error: (e as Error).message })
    }
  }

  return new Response(JSON.stringify({ ok: true, week: weekKey, schedule: 'friday', recipients: results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
