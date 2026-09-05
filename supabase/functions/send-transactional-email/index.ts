import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { flushEmailQueue } from '../_shared/flush-email-queue.ts'
import { sendTransactionalEmail, isEmailRateLimitError, buildUnsubscribeUrl } from '../_shared/send-email.ts'
import { isInternalServiceRequest } from '../_shared/internal-auth.ts'

// Configuration — sender uses Resend API (see _shared/send-email.ts)
const FROM_NAME = Deno.env.get('EMAIL_FROM_NAME')?.trim() || Deno.env.get('GMAIL_FROM_NAME')?.trim() || 'TaskFlow Pro'
const FROM_EMAIL = Deno.env.get('EMAIL_FROM')?.trim() || Deno.env.get('GMAIL_SENDER_EMAIL')?.trim() || 'task@youthnic.shop'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-internal-service-key',
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Auth: gateway JWT is off (config.toml). This function accepts the injected
// service key, a Vault-stored service_role JWT (pg_cron), or an admin/MD
// user JWT for dashboard-triggered sends.

const STALE_PENDING_MS = 5 * 60 * 1000

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  if (!await isInternalServiceRequest(req, supabaseServiceKey)) {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Restrict user-initiated sends to admins / MDs / department managers
    // to prevent any authenticated user from abusing branded email sending.
    const callerId = authData.user.id
    const [{ data: isAdmin }, { data: mgrRows }] = await Promise.all([
      supabase.rpc('is_admin_or_md', { _user_id: callerId }),
      supabase.from('department_managers').select('id').eq('user_id', callerId).limit(1),
    ])
    const isManager = Array.isArray(mgrRows) && mgrRows.length > 0
    if (!isAdmin && !isManager) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }


  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 2. Idempotency guard — cron-driven digests/reports pass a stable key
  // (e.g. `daily-digest-2026-08-13-<user>`) so a double cron fire, a caller
  // retry, or a manual re-trigger never re-sends the same logical email.
  // idempotencyKey defaults to messageId (always unique) when the caller
  // doesn't pass one, so this only ever matches on genuine repeats.
  //
  // A stuck `pending` row used to count as a successful send. If the queue
  // worker never ran, the same task-assigned key was then blocked forever.
  // Only `sent` is terminal; in-flight pending (< 5 min) is treated as a
  // race; stale pending is retried in place.
  const { data: existingSend } = await supabase
    .from('email_send_log')
    .select('id, status, created_at, message_id')
    .eq('idempotency_key', idempotencyKey)
    .in('status', ['pending', 'sent'])
    .maybeSingle()

  let reusePending = false
  if (existingSend?.status === 'sent') {
    console.log('Duplicate send suppressed by idempotency key', {
      templateName,
      idempotencyKey,
      existingStatus: existingSend.status,
    })
    return new Response(
      JSON.stringify({ success: true, deduped: true, reason: 'duplicate_idempotency_key' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
  if (existingSend?.status === 'pending') {
    const ageMs = Date.now() - new Date(existingSend.created_at as string).getTime()
    if (ageMs < STALE_PENDING_MS) {
      console.log('In-flight send skipped by idempotency key', {
        templateName,
        idempotencyKey,
      })
      return new Response(
        JSON.stringify({ success: true, deduped: true, reason: 'duplicate_idempotency_key' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString()
    const { data: claimed } = await supabase
      .from('email_send_log')
      .update({ created_at: new Date().toISOString() })
      .eq('id', existingSend.id)
      .eq('status', 'pending')
      .lt('created_at', staleBefore)
      .select('id, message_id')
      .maybeSingle()
    if (!claimed) {
      return new Response(
        JSON.stringify({ success: true, deduped: true, reason: 'duplicate_idempotency_key' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    reusePending = true
    if (typeof claimed.message_id === 'string' && claimed.message_id) {
      messageId = claimed.message_id
    }
  }

  // 3. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (suppressed) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      idempotency_key: idempotencyKey,
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 4. Get or create unsubscribe token (one token per email address)
  const normalizedEmail = effectiveRecipient.toLowerCase()
  let unsubscribeToken: string

  // Check for existing token for this email
  const { data: existingToken, error: tokenLookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (tokenLookupError) {
    console.error('Token lookup failed', {
      error: tokenLookupError,
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to look up unsubscribe token',
      idempotency_key: idempotencyKey,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (existingToken && !existingToken.used_at) {
    // Reuse existing unused token
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    // Create new token — upsert handles concurrent inserts gracefully
    unsubscribeToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', {
        error: tokenError,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
        idempotency_key: idempotencyKey,
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // If another request raced us, our upsert was silently ignored.
    // Re-read to get the actual stored token.
    const { data: storedToken, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', {
        error: reReadError,
        email: normalizedEmail,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
        idempotency_key: idempotencyKey,
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    unsubscribeToken = storedToken.token
  } else {
    // Token exists but is already used — email should have been caught by suppression check above.
    // This is a safety fallback; log and skip sending.
    console.warn('Unsubscribe token already used but email not suppressed', {
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message:
        'Unsubscribe token used but email missing from suppressed list',
      idempotency_key: idempotencyKey,
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 5. Render React Email template to HTML and plain text
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // 6. Send via Resend in this isolate (same path as password-reset).
  // Queue + process-email-queue remain the rate-limit / crash backstop only.
  // Fire-and-forget flush was the reason Resend "worked" (reset mail) while
  // assignment/digest mail sat in email_send_log as pending forever.

  if (!reusePending) {
    const { error: pendingLogError } = await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'pending',
      idempotency_key: idempotencyKey,
    })

    if (pendingLogError) {
      if (pendingLogError.code === '23505') {
        console.log('Duplicate send suppressed by idempotency key (race)', {
          templateName,
          idempotencyKey,
        })
        return new Response(
          JSON.stringify({ success: true, deduped: true, reason: 'duplicate_idempotency_key' }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
      console.error('Failed to write pending email_send_log row', { error: pendingLogError })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  }

  const queuePayload = {
    message_id: messageId,
    to: effectiveRecipient,
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    subject: resolvedSubject,
    html,
    text: plainText,
    purpose: 'transactional',
    label: templateName,
    idempotency_key: idempotencyKey,
    unsubscribe_token: unsubscribeToken,
    queued_at: new Date().toISOString(),
  }

  const markLog = async (status: 'sent' | 'failed', errorMessage?: string) => {
    await supabase
      .from('email_send_log')
      .update({
        status,
        error_message: errorMessage ?? null,
      })
      .eq('message_id', messageId)
      .eq('status', 'pending')
  }

  try {
    const { messageId: resendId } = await sendTransactionalEmail({
      to: effectiveRecipient,
      subject: resolvedSubject,
      html,
      text: plainText,
      listUnsubscribeUrl: buildUnsubscribeUrl(unsubscribeToken),
      idempotencyKey,
    })
    await markLog('sent')
    console.log('Transactional email sent', { templateName, effectiveRecipient, resendId })
    return new Response(
      JSON.stringify({ success: true, sent: true, messageId: resendId }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('Immediate Resend send failed', { templateName, effectiveRecipient, error: errorMsg })

    if (isEmailRateLimitError(error)) {
      const { error: enqueueError } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: queuePayload,
      })
      if (enqueueError) {
        await markLog('failed', `Rate limited and enqueue failed: ${enqueueError.message}`)
        return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      await flushEmailQueue(supabaseUrl, supabaseServiceKey)
      return new Response(
        JSON.stringify({ success: true, queued: true, reason: 'rate_limited' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    await markLog('failed', errorMsg.slice(0, 1000))
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
