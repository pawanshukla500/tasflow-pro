import { createClient } from 'npm:@supabase/supabase-js@2'
import { createInAppNotification } from '../_shared/in-app-notifications.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-service-key',
}

type ChangeType = 'start' | 'advance' | 'overdue' | 'completed' | 'rejected'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const getToken = (req: Request) => {
  const auth = req.headers.get('Authorization')
  return auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : null
}

function computeDueDate(startedAt: string | null, tatHours: number): string | null {
  if (!startedAt || !tatHours) return null
  const due = new Date(new Date(startedAt).getTime() + tatHours * 3600 * 1000)
  return due.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

async function canTriggerNotification(supabase: any, req: Request, workflow: any, stage: any) {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (req.headers.get('x-internal-service-key') === serviceKey) return true

  const token = getToken(req)
  if (!token) return false
  const { data: authData, error } = await supabase.auth.getUser(token)
  const authUser = authData?.user
  if (error || !authUser) return false

  if (workflow.raised_by === authUser.id || stage.assignee_user_id === authUser.id) return true

  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', authUser.id)
    .in('role', ['managing_director', 'system_admin'])
    .maybeSingle()
  if (adminRole) return true

  if (stage.owner_department_id) {
    const { data: manager } = await supabase
      .from('department_managers')
      .select('id')
      .eq('user_id', authUser.id)
      .eq('department_id', stage.owner_department_id)
      .maybeSingle()
    if (manager) return true
  }

  return false
}

async function getProfileMap(supabase: any, ids: string[]) {
  if (ids.length === 0) return new Map<string, any>()
  const { data } = await supabase
    .from('profiles')
    .select('id, name, email, active, department_id')
    .in('id', ids)
  return new Map(((data || []) as any[]).map((p) => [p.id, p]))
}

async function addAdminRecipients(supabase: any, recipientIds: Set<string>) {
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('role', ['managing_director', 'system_admin'])
  ;(roles || []).forEach((r: any) => recipientIds.add(r.user_id))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500)

  const supabase = createClient(supabaseUrl, serviceKey)
  const appUrl = (Deno.env.get('APP_URL') || 'https://task.youthnic.shop').replace(/\/$/, '')

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const workflowId = String(body.workflowId || body.workflow_id || '')
  const stageId = String(body.stageId || body.stage_id || '')
  const changeType = String(body.changeType || body.change_type || '') as ChangeType
  if (!workflowId || !stageId || !['start', 'advance', 'overdue', 'completed', 'rejected'].includes(changeType)) {
    return json({ error: 'workflowId, stageId, and valid changeType are required' }, 400)
  }

  const [{ data: workflow, error: wfError }, { data: stage, error: stageError }] = await Promise.all([
    supabase.from('workflows').select('*').eq('id', workflowId).maybeSingle(),
    supabase.from('workflow_stages').select('*').eq('id', stageId).eq('workflow_id', workflowId).maybeSingle(),
  ])
  if (wfError || stageError) return json({ error: wfError?.message || stageError?.message }, 500)
  if (!workflow || !stage) return json({ error: 'Workflow stage not found' }, 404)

  const allowed = await canTriggerNotification(supabase, req, workflow, stage)
  if (!allowed) return json({ error: 'Unauthorized' }, 401)

  const recipientIds = new Set<string>()
  const skipped: Array<{ user_id: string, reason: string }> = []

  if (stage.assignee_user_id) recipientIds.add(stage.assignee_user_id)

  if (stage.owner_department_id) {
    const { data: managers } = await supabase
      .from('department_managers')
      .select('user_id')
      .eq('department_id', stage.owner_department_id)
    ;(managers || []).forEach((m: any) => recipientIds.add(m.user_id))
  }

  if (changeType === 'overdue' || changeType === 'rejected') {
    await addAdminRecipients(supabase, recipientIds)
  }

  if (changeType === 'start' && workflow.raised_by) {
    recipientIds.delete(workflow.raised_by)
  }

  const allIds = Array.from(recipientIds)
  const profileMap = await getProfileMap(supabase, allIds)
  const activeRecipients = allIds.flatMap((id) => {
    const p = profileMap.get(id)
    if (!p) { skipped.push({ user_id: id, reason: 'missing_profile' }); return [] }
    if (p.active === false) { skipped.push({ user_id: id, reason: 'inactive' }); return [] }
    if (!p.email) { skipped.push({ user_id: id, reason: 'missing_email' }); return [] }
    return [p]
  })

  const { count } = await supabase
    .from('workflow_stages')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', workflowId)
  const totalStages = count || 0

  const trackingNumber = workflow.tracking_number
    || (await supabase.from('workflow_field_values').select('value').eq('workflow_id', workflowId).eq('field_key', 'reference_id').maybeSingle()).data?.value
    || undefined

  const assigneeProfile = stage.assignee_user_id ? profileMap.get(stage.assignee_user_id) : null
  const { data: raiserProfile } = workflow.raised_by
    ? await supabase.from('profiles').select('id, name').eq('id', workflow.raised_by).maybeSingle()
    : { data: null }

  const dueDate = computeDueDate(stage.started_at, stage.tat_hours)
  const stageStatus = changeType === 'overdue' ? 'Overdue / SLA breach'
    : changeType === 'completed' ? 'Completed'
    : changeType === 'rejected' ? 'Rejected'
    : stage.status === 'in_progress' ? 'In progress' : 'Pending'

  const deepLinkParams = new URLSearchParams({ wf: workflowId, stage: stageId })
  const actionUrl = `/workflows?${deepLinkParams.toString()}`

  let inboxNotified = 0
  let emailsQueued = 0
  let inAppNotified = 0

  const notifTitle = changeType === 'overdue'
    ? `Workflow overdue: ${trackingNumber || workflow.title}`
    : changeType === 'start'
      ? `New workflow: ${trackingNumber || workflow.title}`
      : changeType === 'completed'
        ? `Workflow completed: ${trackingNumber || workflow.title}`
        : changeType === 'rejected'
          ? `Workflow rejected: ${trackingNumber || workflow.title}`
          : `Workflow assigned: ${stage.name}`

  const notifBody = `${workflow.title} · Stage ${stage.position}/${totalStages || '?'}: ${stage.name}${dueDate ? ` · Due ${dueDate}` : ''}`

  for (const p of activeRecipients) {
    const notifType = changeType === 'overdue' ? 'workflow_breach'
      : changeType === 'completed' ? 'workflow_approved'
      : changeType === 'rejected' ? 'workflow_rejected'
      : changeType === 'start' ? 'workflow_assigned'
      : 'workflow_update'

    await createInAppNotification(supabase, {
      userId: p.id,
      type: notifType,
      title: notifTitle,
      body: notifBody,
      actionUrl,
      metadata: {
        workflowId,
        stageId,
        trackingNumber,
        changeType,
        priority: workflow.priority,
      },
    })
    inAppNotified++

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'x-internal-service-key': serviceKey,
        },
        body: JSON.stringify({
          templateName: 'workflow-stage-assigned',
          recipientEmail: p.email,
          idempotencyKey: `wf-stage-${stage.id}-${p.id}-${changeType}`,
          templateData: {
            recipientName: p.name,
            workflowTitle: workflow.title,
            stageName: stage.name,
            stagePosition: stage.position,
            totalStages,
            tatHours: stage.tat_hours,
            raisedBy: raiserProfile?.name || 'A team member',
            isOverdue: changeType === 'overdue',
            changeType,
            workflowId,
            stageId,
            trackingNumber,
            referenceId: trackingNumber,
            priority: workflow.priority,
            dueDate,
            assigneeName: assigneeProfile?.name || undefined,
            status: stageStatus,
          },
        }),
      })
      if (!res.ok) skipped.push({ user_id: p.id, reason: `email_failed:${await res.text()}` })
      else emailsQueued++
    } catch (e) {
      skipped.push({ user_id: p.id, reason: `email_failed:${e instanceof Error ? e.message : 'unknown'}` })
    }

    await supabase.from('notification_log').insert({
      recipient_user_id: p.id,
      recipient_email: p.email,
      notification_type: `workflow_stage_${changeType}`,
      subject: notifTitle,
      status: 'sent',
      metadata: { workflow_id: workflowId, stage_id: stageId, tracking_number: trackingNumber },
    })
  }

  await supabase.from('workflow_stage_events').insert({
    stage_id: stageId,
    workflow_id: workflowId,
    actor_id: null,
    event_type: `notified_${changeType}`,
    note: `Notified stakeholders for ${changeType}`,
    metadata: {
      recipients: activeRecipients.map((p: any) => p.id),
      skipped,
      emails_queued: emailsQueued,
      in_app_notified: inAppNotified,
    },
  })

  return json({
    success: true,
    trackingNumber,
    recipients: activeRecipients.length,
    emailsQueued,
    inAppNotified,
    skipped,
  })
})
