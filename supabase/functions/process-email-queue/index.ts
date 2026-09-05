import { sendTransactionalEmail, buildUnsubscribeUrl, isEmailRateLimitError } from '../_shared/send-email.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isInternalServiceRequest } from '../_shared/internal-auth.ts'

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

function isRateLimited(error: unknown): boolean {
  return isEmailRateLimitError(error)
}

async function recordSendOutcome(
  supabase: ReturnType<typeof createClient>,
  queue: string,
  payload: Record<string, unknown>,
  status: 'sent' | 'failed',
  errorMessage?: string,
): Promise<void> {
  const messageId = typeof payload.message_id === 'string' ? payload.message_id : undefined
  if (messageId) {
    const { data: updated } = await supabase
      .from('email_send_log')
      .update({ status, error_message: errorMessage ?? null })
      .eq('message_id', messageId)
      .eq('status', 'pending')
      .select('id')
    if (updated?.length) return
  }
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to as string,
    status,
    error_message: errorMessage,
  })
}

async function moveToDlq(
  supabase: ReturnType<typeof createClient>,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string,
): Promise<void> {
  const payload = msg.message as Record<string, unknown>
  await supabase.from('email_send_log').insert({
    message_id: payload.message_id as string,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to as string,
    status: 'dlq',
    error_message: reason,
  })
  await supabase.rpc('move_to_dlq', {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  })
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!await isInternalServiceRequest(req, supabaseServiceKey)) {
    const status = authHeader?.startsWith('Bearer ') ? 403 : 401
    return new Response(JSON.stringify({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(JSON.stringify({ skipped: true, reason: 'rate_limited' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError || !messages?.length) continue

    const messageIds = Array.from(
      new Set(
        (messages as Array<{ message: { message_id?: string } }>)
          .map((msg) => msg?.message?.message_id)
          .filter((id): id is string => typeof id === 'string' && Boolean(id)),
      ),
    )

    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      for (const row of failedRows ?? []) {
        if (typeof row.message_id === 'string') {
          failedAttemptsByMessageId.set(
            row.message_id,
            (failedAttemptsByMessageId.get(row.message_id) ?? 0) + 1,
          )
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i] as {
        msg_id: number
        message: Record<string, unknown>
        read_ct?: number
        enqueued_at?: string
      }
      const payload = msg.message
      const failedAttempts =
        typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : (msg.read_ct ?? 0)

      const queuedAt = (payload.queued_at as string) ?? msg.enqueued_at
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime()
        if (ageMs > ttlMinutes[queue] * 60 * 1000) {
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
          continue
        }
      }

      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded`)
        continue
      }

      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          await supabase.rpc('delete_email', { queue_name: queue, message_id: msg.msg_id })
          continue
        }
      }

      try {
        const unsubscribeToken =
          typeof payload.unsubscribe_token === 'string' ? payload.unsubscribe_token : undefined

        await sendTransactionalEmail({
          to: String(payload.to),
          subject: String(payload.subject),
          html: String(payload.html),
          text: typeof payload.text === 'string' ? payload.text : undefined,
          listUnsubscribeUrl: unsubscribeToken ? buildUnsubscribeUrl(unsubscribeToken) : undefined,
          idempotencyKey: typeof payload.idempotency_key === 'string' ? payload.idempotency_key : undefined,
        })

        await recordSendOutcome(supabase, queue, payload, 'sent')

        await supabase.rpc('delete_email', { queue_name: queue, message_id: msg.msg_id })
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('Email send failed', { queue, msg_id: msg.msg_id, error: errorMsg })

        if (isRateLimited(error)) {
          await supabase.from('email_send_state').update({
            retry_after_until: new Date(Date.now() + 60_000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', 1)

          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        await recordSendOutcome(supabase, queue, payload, 'failed', errorMsg.slice(0, 1000))

        if (typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }
      }

      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  return new Response(JSON.stringify({ processed: totalProcessed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
