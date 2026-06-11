// Sends task-assignment emails via the branded transactional email pipeline.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createInAppNotification } from '../_shared/in-app-notifications.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Authenticate the caller via JWT (allow internal service-key bypass for server-to-server calls)
  const isInternal = req.headers.get('x-internal-service-key') === serviceKey
  let callerId: string | null = null
  if (!isInternal) {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    callerId = authData.user.id
  }

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders })
  }

  const { taskId, assigneeUserIds, assignedByName } = body
  if (!taskId || !Array.isArray(assigneeUserIds) || assigneeUserIds.length === 0) {
    return new Response(JSON.stringify({ error: 'taskId and assigneeUserIds required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single()
  if (!task) {
    return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: corsHeaders })
  }

  // Authorization: caller must be admin/MD, dept manager, or task creator
  if (!isInternal && callerId) {
    const [{ data: isAdmin }, { data: deptMgr }] = await Promise.all([
      supabase.rpc('is_admin_or_md', { _user_id: callerId }),
      task.department_id
        ? supabase.rpc('manages_department', { _user_id: callerId, _dept_id: task.department_id })
        : Promise.resolve({ data: false }),
    ])
    const isCreator = task.created_by === callerId
    if (!isAdmin && !deptMgr && !isCreator) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }


  const { data: profiles } = await supabase
    .from('profiles').select('id, name, email').in('id', assigneeUserIds)

  const results = []
  for (const p of profiles || []) {
    // Honor user notification preference
    const { data: prefs } = await supabase
      .from('notification_preferences').select('task_assigned').eq('user_id', p.id).maybeSingle()
    if (prefs && prefs.task_assigned === false) {
      results.push({ user_id: p.id, skipped: true, reason: 'user_preference' })
      continue
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({
        templateName: 'task-assigned',
        recipientEmail: p.email,
        idempotencyKey: `task-assigned-${taskId}-${p.id}`,
        templateData: {
          recipientName: p.name,
          taskTitle: task.title,
          taskDescription: task.description,
          priority: task.priority,
          dueDate: task.due_date,
          assignedBy: assignedByName,
          taskId,
        },
      }),
    })
    const ok = resp.ok
    const errText = ok ? undefined : await resp.text().catch(() => 'unknown')
    results.push({ user_id: p.id, ok, error: errText })

    const appUrl = (Deno.env.get('APP_URL') || 'https://task.youthnic.shop').replace(/\/$/, '')
    await createInAppNotification(supabase, {
      userId: p.id,
      type: 'task_assigned',
      title: 'New task assigned',
      body: `${assignedByName || 'Someone'} assigned you: ${task.title}`,
      actionUrl: `${appUrl}/my-tasks?task=${taskId}`,
      metadata: { taskId, priority: task.priority },
    })
  }

  return new Response(JSON.stringify({ results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
