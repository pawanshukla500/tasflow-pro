// Cron-driven monthly report for Managing Directors and System Admins via branded transactional pipeline.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { istToday } from '../_shared/ist.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('x-internal-service-key') !== serviceKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey
  )

  // Previous calendar month in IST
  const today = istToday()
  const [y, m] = today.split('-').map(Number)
  const prevMonth = m === 1 ? 12 : m - 1
  const prevYear = m === 1 ? y - 1 : y
  const startIso = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01T00:00:00+05:30`
  const endIso = `${y}-${String(m).padStart(2, '0')}-01T00:00:00+05:30`
  const monthLabel = new Date(startIso).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric',
  })
  const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`

  const { data: tasks } = await supabase
    .from('tasks').select('id, status, department_id, completed_at, created_at, due_date')
    .gte('created_at', new Date(startIso).toISOString()).lt('created_at', new Date(endIso).toISOString())

  const totalTasks = tasks?.length || 0
  const completedTasks = tasks?.filter((t) => t.status === 'done').length || 0
  const overdueTasks = tasks?.filter((t) =>
    t.status !== 'done' && t.due_date && t.due_date < today
  ).length || 0

  const { data: roles } = await supabase
    .from('user_roles').select('user_id, role')
    .in('role', ['managing_director', 'system_admin'])
  const recipientIds = Array.from(new Set((roles || []).map((r) => r.user_id)))
  const { data: recipients } = await supabase
    .from('profiles').select('id, name, email').in('id', recipientIds)

  const results = []
  for (const r of recipients || []) {
    const { data: prefs } = await supabase
      .from('notification_preferences').select('monthly_report').eq('user_id', r.id).maybeSingle()
    if (prefs && prefs.monthly_report === false) continue

    const { error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'monthly-report',
        recipientEmail: r.email,
        idempotencyKey: `monthly-report-${r.id}-${monthKey}`,
        templateData: {
          recipientName: r.name,
          monthLabel,
          totalTasks,
          completedTasks,
          overdueTasks,
        },
      },
    })
    results.push({ user: r.email, ok: !error, error: error?.message })
  }

  return new Response(JSON.stringify({ ok: true, month: monthLabel, recipients: results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
