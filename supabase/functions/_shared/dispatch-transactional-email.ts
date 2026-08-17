/**
 * Call send-transactional-email and actually interpret its response.
 *
 * send-transactional-email returns HTTP 200 for real success AND for every
 * soft "didn't send" case (suppressed recipient, deduped by idempotency
 * key) — it never throws and never returns a non-2xx for those. Every
 * digest/report cron caller was previously doing `await fetch(...)` and
 * logging "sent" as long as the request didn't throw, which is exactly why
 * a suppressed recipient (bounce/complaint, or a one-click "Unsubscribe" —
 * trivial to trigger by accident, and likely during the period the old
 * duplicate-daily-email bug was live) would silently get zero emails
 * forever while every log/cron/CI signal kept reporting "sent". This
 * mirrors the real reason: password-reset mail (which bypasses the
 * suppression check entirely — see render-and-send-email.ts) kept arriving
 * while the digest, going through this exact path, silently did not.
 */
export interface EmailDispatchResult {
  status: 'sent' | 'deduped' | 'suppressed' | 'failed'
  reason?: string
  httpStatus?: number
}

export async function dispatchTransactionalEmail(opts: {
  supabaseUrl: string
  serviceRoleKey: string
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData: Record<string, unknown>
}): Promise<EmailDispatchResult> {
  try {
    const res = await fetch(`${opts.supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'x-internal-service-key': opts.serviceRoleKey,
      },
      body: JSON.stringify({
        templateName: opts.templateName,
        recipientEmail: opts.recipientEmail,
        idempotencyKey: opts.idempotencyKey,
        templateData: opts.templateData,
      }),
    })

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (!res.ok) {
      return {
        status: 'failed',
        reason: typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
        httpStatus: res.status,
      }
    }
    if (body.deduped === true) {
      return { status: 'deduped', reason: 'duplicate_idempotency_key', httpStatus: res.status }
    }
    if (body.success === false) {
      return {
        status: 'suppressed',
        reason: typeof body.reason === 'string' ? body.reason : 'unknown',
        httpStatus: res.status,
      }
    }
    return { status: 'sent', httpStatus: res.status }
  } catch (e) {
    return { status: 'failed', reason: e instanceof Error ? e.message : String(e) }
  }
}
