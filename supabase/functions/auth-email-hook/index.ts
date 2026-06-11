import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'
import { getFromEmail, getFromName } from '../_shared/send-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const SITE_NAME = getFromName()
const APP_URL = (Deno.env.get('APP_URL') || 'https://task.youthnic.shop').replace(/\/$/, '')

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email — TaskFlow Pro',
  invite: "You've been invited to TaskFlow Pro",
  magiclink: 'Your TaskFlow Pro login link',
  recovery: 'Reset your TaskFlow Pro password',
  email_change: 'Confirm your new email',
  email: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  email: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

function getHookSecret(): string {
  const secret = Deno.env.get('SUPABASE_AUTH_HOOK_SECRET') || Deno.env.get('AUTH_HOOK_SECRET') || ''
  return secret === 'REPLACE_ME' ? '' : secret
}

/** Simple Bearer check — used only by the manual /preview endpoint. */
function verifyHookSecret(req: Request): boolean {
  const secret = getHookSecret()
  if (!secret) {
    console.error('SUPABASE_AUTH_HOOK_SECRET not configured')
    return false
  }
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  return auth === `Bearer ${secret}` || auth === secret
}

/**
 * Supabase Auth HTTPS hooks sign requests per the Standard Webhooks spec:
 * HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}` keyed with the
 * base64-decoded part of the dashboard secret (`v1,whsec_<base64>`), compared
 * against the `webhook-signature` header (`v1,<base64sig>`, possibly several).
 */
async function verifyWebhookSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = getHookSecret()
  if (!secret) {
    console.error('SUPABASE_AUTH_HOOK_SECRET not configured')
    return false
  }

  // Manual testing escape hatch (same as /preview)
  const auth = req.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}` || auth === secret) return true

  const id = req.headers.get('webhook-id')
  const timestamp = req.headers.get('webhook-timestamp')
  const sigHeader = req.headers.get('webhook-signature')
  if (!id || !timestamp || !sigHeader) return false

  // Reject replays older/newer than 5 minutes
  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
  if (!Number.isFinite(skew) || skew > 300) return false

  let keyBytes: Uint8Array
  try {
    const b64 = secret.replace(/^v1,/, '').replace(/^whsec_/, '')
    keyBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  } catch {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  )
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  return sigHeader.split(' ').some((part) => {
    const sig = part.includes(',') ? part.split(',').pop() : part
    return sig === expected
  })
}

function buildConfirmationUrl(emailData: Record<string, unknown>): string {
  const siteUrl = String(emailData.site_url || APP_URL).replace(/\/$/, '')
  const tokenHash = emailData.token_hash
  const actionType = emailData.email_action_type
  const redirectTo = emailData.redirect_to || `${APP_URL}/`
  if (tokenHash && actionType) {
    const params = new URLSearchParams({
      token: String(tokenHash),
      type: String(actionType),
      redirect_to: String(redirectTo),
    })
    return `${siteUrl}/auth/v1/verify?${params.toString()}`
  }
  return String(emailData.redirect_to || APP_URL)
}

async function handlePreview(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (!verifyHookSecret(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type = 'signup'
  try {
    const body = await req.json()
    type = body.type || 'signup'
  } catch {
    /* default signup */
  }

  const EmailTemplate = EMAIL_TEMPLATES[type] || SignupEmail
  const html = await renderAsync(
    React.createElement(EmailTemplate, {
      siteName: SITE_NAME,
      siteUrl: APP_URL,
      recipient: 'user@example.com',
      confirmationUrl: `${APP_URL}/login`,
      token: '123456',
    }),
  )

  return new Response(html, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function handleSendEmailHook(req: Request): Promise<Response> {
  // Read raw body first — the webhook signature covers the exact bytes
  const rawBody = await req.text()

  if (!(await verifyWebhookSignature(req, rawBody))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const fromName = SITE_NAME
  const fromEmail = getFromEmail()

  let body: {
    user?: { email?: string; id?: string }
    email_data?: Record<string, unknown>
  }

  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const emailData = body.email_data || {}
  const recipient = body.user?.email || emailData.email
  const emailType = String(emailData.email_action_type || 'signup')

  if (!recipient) {
    return new Response(JSON.stringify({ error: 'Missing recipient email' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    console.error('Unknown email type', { emailType })
    return new Response(JSON.stringify({ error: `Unknown email type: ${emailType}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const confirmationUrl = buildConfirmationUrl(emailData)
  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: APP_URL,
    recipient,
    confirmationUrl,
    token: emailData.token,
    email: recipient,
    newEmail: emailData.token_new || emailData.new_email,
  }

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
    plainText: true,
  })

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const messageId = crypto.randomUUID()

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: emailType,
    recipient_email: recipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${fromName} <${fromEmail}>`,
      subject: EMAIL_SUBJECTS[emailType] || 'TaskFlow Pro notification',
      html,
      text,
      purpose: 'auth',
      label: emailType,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue auth email', { error: enqueueError, emailType })
    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  fetch(`${supabaseUrl}/functions/v1/process-email-queue`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${supabaseServiceKey}` },
  }).catch((e) => console.warn('process-email-queue trigger failed', e))

  console.log('Auth email enqueued', { emailType, recipient })

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  try {
    return await handleSendEmailHook(req)
  } catch (error) {
    console.error('Auth email hook error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
