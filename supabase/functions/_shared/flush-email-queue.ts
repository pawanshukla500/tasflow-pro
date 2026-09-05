/**
 * Trigger process-email-queue without making the caller wait for it, but
 * without silently dropping it either. A bare un-awaited `fetch(...)` is not
 * safe here: Supabase Edge Functions run on a Deno isolate that can be torn
 * down right after the response is sent, so a background request can be cut
 * off mid-flight — this was a real reason emails were being enqueued
 * (visible in email_send_log as 'pending') but never reliably sent.
 *
 * `EdgeRuntime.waitUntil` is Supabase's documented API for exactly this: it
 * keeps the isolate alive until the passed promise settles. It's only
 * present in the deployed edge runtime (not local `deno run`), so this
 * degrades to fire-and-forget there — fine, since the `process-email-queue`
 * cron (every minute, see migration 20260816090000) is the durable backstop
 * either way; this just stops relying on it for every single send.
 */
export function flushEmailQueue(supabaseUrl: string, serviceRoleKey: string): Promise<unknown> {
  const task = fetch(`${supabaseUrl}/functions/v1/process-email-queue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'x-internal-service-key': serviceRoleKey,
    },
  }).catch((e) => console.warn('process-email-queue trigger failed', e))

  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  edgeRuntime?.waitUntil?.(task)
  return task
}
