// Workflow TAT escalation: scans in-progress stages, marks overdue ones,
// and notifies the owner-department team. Re-escalates every 24h after first breach.
// Skips blocked stages (TAT timer paused). Runs via pg_cron hourly.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RE_ESCALATE_HOURS = 24

interface StageRow {
  id: string
  workflow_id: string
  position: number
  name: string
  owner_department_id: string | null
  assignee_user_id: string | null
  tat_hours: number
  escalate_on_breach: boolean
  status: string
  started_at: string | null
  escalated_at: string | null
  last_escalated_at: string | null
}

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
    serviceKey,
  )

  // Pull in_progress stages with escalation enabled. Blocked stages excluded — TAT paused.
  const { data: stages, error } = await supabase
    .from('workflow_stages')
    .select('*')
    .eq('status', 'in_progress')
    .eq('escalate_on_breach', true)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const now = Date.now()
  const overdue = ((stages || []) as StageRow[]).filter((s) => {
    if (!s.started_at) return false
    const elapsed = now - new Date(s.started_at).getTime()
    if (elapsed <= s.tat_hours * 3600 * 1000) return false
    // re-escalation gate
    const lastEsc = s.last_escalated_at || s.escalated_at
    if (lastEsc) {
      const sinceLast = now - new Date(lastEsc).getTime()
      if (sinceLast < RE_ESCALATE_HOURS * 3600 * 1000) return false
    }
    return true
  })

  let notified = 0

  for (const s of overdue) {
    const escNow = new Date().toISOString()
    try {
      const { data: notifyResult, error: notifyError } = await supabase.functions.invoke('notify-workflow-stage', {
        headers: { 'x-internal-service-key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
        body: { workflowId: s.workflow_id, stageId: s.id, changeType: 'overdue' },
      })
      if (notifyError) console.warn('workflow overdue notify failed', notifyError)
      else notified += Number((notifyResult as any)?.recipients || 0)
    } catch (e) {
      console.warn('workflow overdue notify failed', e)
    }

    await supabase.from('workflow_stages')
      .update({ escalated_at: s.escalated_at || escNow, last_escalated_at: escNow })
      .eq('id', s.id)

    // Audit log
    await supabase.from('workflow_stage_events').insert({
      stage_id: s.id,
      workflow_id: s.workflow_id,
      actor_id: null,
      event_type: 'escalated',
      note: `Auto-escalation (TAT ${s.tat_hours}h)`,
      metadata: { notified },
    })
  }

  return new Response(JSON.stringify({ checked: stages?.length || 0, overdue: overdue.length, notified }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
