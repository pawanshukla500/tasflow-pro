// Cron-driven: sends a daily pending-task reminder Mon–Sat (skips Sunday).
//
// Each active user with task_due_reminder enabled receives one email listing
// all open (non-done) tasks assigned to them, plus active workflow stages they
// own. Users with nothing pending are skipped.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Internal cron function: invoked by pg_cron with service role credentials only.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const internalKey = req.headers.get('x-internal-service-key') || ''
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (internalKey !== serviceKey && bearer !== serviceKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Skip Sunday (0 = Sunday in UTC; org is IST but day boundary close enough for a daily summary)
  const now = new Date()
  // Use IST day-of-week
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  if (istNow.getUTCDay() === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'sunday' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const functionInvokeKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || serviceRoleKey
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const today = istNow.toISOString().slice(0, 10)
  const dayKey = today

  // All open tasks (pending = anything not done). We fetch every open task once
  // and filter per-user below.
  const { data: openTasks } = await supabase
    .from('tasks').select('id, title, due_date, priority, status')
    .neq('status', 'done')

  const tasksById = new Map<string, any>()
  for (const t of openTasks || []) tasksById.set(t.id, t)

  const { data: activeWorkflowStages } = await supabase
    .from('workflow_stages')
    .select('id, name, tat_hours, started_at, owner_department_id, assignee_user_id, status, workflows!inner(id, title, status)')
    .in('status', ['in_progress', 'blocked'])

  const workflowStages = (activeWorkflowStages || []).filter((s: any) => s.workflows?.status === 'active')
  const workflowDueDate = (s: any) => {
    if (!s.started_at || !s.tat_hours) return null
    return new Date(new Date(s.started_at).getTime() + Number(s.tat_hours) * 3600000).toISOString().slice(0, 10)
  }

  const taskIds = Array.from(tasksById.keys())
  const { data: assignees } = taskIds.length
    ? await supabase.from('task_assignees').select('task_id, user_id').in('task_id', taskIds)
    : { data: [] as any[] }

  const userTasks = new Map<string, any[]>()
  for (const a of assignees || []) {
    const t = tasksById.get(a.task_id)
    if (!t) continue
    if (!userTasks.has(a.user_id)) userTasks.set(a.user_id, [])
    userTasks.get(a.user_id)!.push(t)
  }

  // Org-wide overview for MDs / System Admins — only when there is real urgency.
  const { data: leaders } = await supabase
    .from('user_roles').select('user_id, role')
    .in('role', ['managing_director', 'system_admin'])
  const leaderIds = Array.from(new Set((leaders || []).map((r) => r.user_id)))

  const overdueAll = (openTasks || []).filter((t) => t.due_date && t.due_date < today).length
  const dueTodayAll = (openTasks || []).filter((t) => t.due_date === today).length
  const overdueWorkflowAll = workflowStages.filter((s: any) => {
    const due = workflowDueDate(s)
    return due && due < today
  }).length
  const dueTodayWorkflowAll = workflowStages.filter((s: any) => {
    const due = workflowDueDate(s)
    return due && due === today
  }).length
  // Leaders see the org overview only when there is at least one organisation-wide
  // overdue or due-today item. Anything else would be noise.
  const orgHasUrgentWork =
    overdueAll > 0 || dueTodayAll > 0 || overdueWorkflowAll > 0 || dueTodayWorkflowAll > 0

  // Send to ALL active users (every employee gets a daily summary, Mon–Sat).
  // Users with nothing imminent are skipped without sending email.
  const { data: profiles } = await supabase
    .from('profiles').select('id, name, email, department_id').eq('active', true)

  const results: any[] = []
  for (const p of profiles || []) {
    if (!p.email) {
      results.push({ user: p.id, skipped: 'no_email' })
      continue
    }
    const { data: prefs } = await supabase
      .from('notification_preferences').select('task_due_reminder')
      .eq('user_id', p.id).maybeSingle()
    if (prefs && prefs.task_due_reminder === false) {
      results.push({ user: p.email, skipped: 'pref_off' })
      continue
    }

    // Include every open task assigned to the user.
    const myTasks = (userTasks.get(p.id) || [])
      .map((t: any) => ({
        title: t.title, dueDate: t.due_date, priority: t.priority,
      }))
    const myWorkflows = workflowStages
      .filter((s: any) => s.assignee_user_id === p.id || (s.owner_department_id && s.owner_department_id === p.department_id))
      .map((s: any) => ({
        title: `Workflow: ${s.workflows?.title || 'Workflow'} — ${s.name}`,
        dueDate: workflowDueDate(s),
        priority: s.status === 'blocked' ? 'blocked' : 'workflow',
      }))
    const isLeader = leaderIds.includes(p.id)

    // Leaders get an org overview only when there is real organisation overdue/due-today
    // work. This prevents misleading emails like "0 open · 0 overdue · 0 due today".
    const orgSummary = isLeader && orgHasUrgentWork
      ? [{
          title: `Org overview — ${overdueAll + overdueWorkflowAll} overdue · ${dueTodayAll + dueTodayWorkflowAll} due today`,
          dueDate: null,
          priority: 'summary',
        }]
      : []

    const allItems = [...orgSummary, ...myTasks, ...myWorkflows]

    // Skip users who have nothing pending.
    if (allItems.length === 0) {
      results.push({ user: p.email, skipped: 'no_pending_tasks' })
      continue
    }

    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: functionInvokeKey,
        Authorization: `Bearer ${functionInvokeKey}`,
        'x-internal-service-key': serviceRoleKey,
      },
      body: JSON.stringify({
        templateName: 'task-due-reminder',
        recipientEmail: p.email,
        idempotencyKey: `daily-summary-${p.id}-${dayKey}`,
        templateData: { recipientName: p.name, tasks: allItems },
      }),
    })
    const emailBody = await emailResponse.text()
    results.push({
      user: p.email,
      count: allItems.length,
      leader: isLeader,
      ok: emailResponse.ok,
      status: emailResponse.status,
      error: emailResponse.ok ? null : emailBody.slice(0, 500),
    })
  }

  const sent = results.filter((r) => r.ok === true).length
  const skipped = results.filter((r) => r.skipped).length
  return new Response(JSON.stringify({ ok: true, date: today, sent, skipped, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
