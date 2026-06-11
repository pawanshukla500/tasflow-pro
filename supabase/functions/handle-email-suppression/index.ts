import { createClient } from 'npm:@supabase/supabase-js@2'

interface SuppressionPayload {
  email: string
  reason: 'bounce' | 'complaint' | 'unsubscribe'
  message_id?: string
  metadata?: Record<string, unknown>
}

function parseSuppressionPayload(body: string): SuppressionPayload {
  const parsed = JSON.parse(body)
  const data = (parsed.data || parsed) as SuppressionPayload
  if (!data.email || !data.reason) {
    throw new Error('Missing required fields: email, reason')
  }
  return data
}

function verifyCaller(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const auth = req.headers.get('Authorization') || ''
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  const webhookSecret = Deno.env.get('EMAIL_WEBHOOK_SECRET')
  if (webhookSecret && auth === `Bearer ${webhookSecret}`) return true
  return false
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  if (!verifyCaller(req)) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let payload: SuppressionPayload
  try {
    payload = parseSuppressionPayload(await req.text())
  } catch (error) {
    console.error('Invalid suppression payload', { error })
    return jsonResponse({ error: 'Invalid payload' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const normalizedEmail = payload.email.toLowerCase()

  // 1. Upsert to suppressed_emails (idempotent — safe for retries)
  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert(
      {
        email: normalizedEmail,
        reason: payload.reason,
        metadata: payload.metadata ?? null,
      },
      { onConflict: 'email' },
    )

  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      error: suppressError,
      email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    })
    return jsonResponse({ error: 'Failed to write suppression' }, 500)
  }

  // 2. Append a new log entry for the suppression event (never update existing rows)
  const sendLogStatus = mapReasonToStatus(payload.reason)
  const sendLogMessage = mapReasonToMessage(payload.reason)

  const { error: insertError } = await supabase
    .from('email_send_log')
    .insert({
      message_id: payload.message_id ?? null,
      template_name: 'system',
      recipient_email: normalizedEmail,
      status: sendLogStatus,
      error_message: sendLogMessage,
      metadata: payload.metadata ?? null,
    })

  if (insertError) {
    // Non-fatal — log and continue. The suppression was already recorded.
    console.warn('Failed to insert email_send_log', {
      error: insertError,
    })
  }

  console.log('Suppression processed', {
    email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    reason: payload.reason,
    has_message_id: !!payload.message_id,
  })

  return jsonResponse({ success: true })
})

function mapReasonToStatus(
  reason: string,
): 'bounced' | 'complained' | 'suppressed' {
  switch (reason) {
    case 'bounce':
      return 'bounced'
    case 'complaint':
      return 'complained'
    default:
      return 'suppressed'
  }
}

function mapReasonToMessage(reason: string): string {
  switch (reason) {
    case 'bounce':
      return 'Permanent bounce — email address is invalid or rejected'
    case 'complaint':
      return 'Spam complaint — recipient marked email as spam'
    case 'unsubscribe':
      return 'Recipient unsubscribed'
    default:
      return 'Email suppressed'
  }
}
