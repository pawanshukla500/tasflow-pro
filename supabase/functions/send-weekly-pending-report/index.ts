// Weekly department insight for Managing Directors and System Admins.
// Schedule via pg_cron (e.g. every Monday 09:00 IST).
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('x-internal-service-key') !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const appUrl = (Deno.env.get('APP_URL') || 'https://task.youthnic.shop').replace(/\/$/, '')

  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const today = istNow.toISOString().slice(0, 10)
  const weekAgo = new Date(istNow.getTime() - 7 * 86400000).toISOString().slice(0, 10)
  const weekKey = (() => {
    const d = new Date(istNow)
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
  })()

  const [{ data: allTasks }, { data: departments }] = await Promise.all([
    supabase.from('tasks').select('id, title, due_date, priority, department_id, status, completed_at, organization_id'),
    supabase.from('departments').select('id, name, organization_id'),
  ])

  const { data: roles } = await supabase
    .from('user_roles').select('user_id, role')
    .in('role', ['managing_director', 'system_admin'])
  const recipientIds = Array.from(new Set((roles || []).map((r) => r.user_id)))
  const { data: recipients } = await supabase
    .from('profiles').select('id, name, email, active, organization_id').in('id', recipientIds)

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

    for (const t of orgTasks) {
      const key = t.department_id || 'unassigned'
      if (!byDept.has(key)) byDept.set(key, { total: 0, overdue: 0, dueSoon: 0, done: 0, doneThisWeek: 0 })
      const row = byDept.get(key)!
      if (t.status === 'done') {
        row.done++
        if (t.completed_at && t.completed_at.slice(0, 10) >= weekAgo) row.doneThisWeek++
      } else {
        row.total++
        if (t.due_date && t.due_date < today) row.overdue++
        else if (t.due_date && t.due_date <= new Date(istNow.getTime() + 3 * 86400000).toISOString().slice(0, 10)) row.dueSoon++
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
          completionPct,
          doneThisWeek: s.doneThisWeek,
        }
      })
      .filter((r) => r.total > 0 || r.doneThisWeek > 0)
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total)

    if (rows.length === 0) {
      results.push({ user: r.email, ok: true, error: 'skipped_empty' })
      continue
    }

    const totalPending = rows.reduce((a, row) => a + row.total, 0)
    const totalOverdue = rows.reduce((a, row) => a + row.overdue, 0)

    const topPerformers = rows
      .filter((row) => row.overdue === 0 && row.completionPct >= 70)
      .slice(0, 3)
      .map((row) => row.name)
    const needsAttention = rows
      .filter((row) => row.overdue >= 2 || (row.total > 0 && row.completionPct < 50))
      .slice(0, 3)
      .map((row) => row.name)

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'x-internal-service-key': serviceRoleKey,
        },
        body: JSON.stringify({
          templateName: 'weekly-leadership-insight',
          recipientEmail: r.email,
          idempotencyKey: `weekly-insight-${r.id}-${weekKey}`,
          templateData: {
            title: `Weekly insight — ${totalPending} open across ${rows.length} departments`,
            recipientName: r.name,
            weekLabel: weekKey,
            totalPending,
            totalOverdue,
            departments: rows,
            topPerformers,
            needsAttention,
            ctaLabel: 'Open Reports',
            ctaUrl: `${appUrl}/reports`,
          },
        }),
      })
      results.push({ user: r.email, ok: res.ok, error: res.ok ? undefined : await res.text() })
    } catch (e) {
      results.push({ user: r.email, ok: false, error: (e as Error).message })
    }
  }

  return new Response(JSON.stringify({ ok: true, week: weekKey, recipients: results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
