/**
 * Send HTML transactional email via Resend (https://resend.com).
 * No Google Workspace required — verify youthnic.shop with DNS at your domain registrar.
 *
 * Env:
 *   RESEND_API_KEY          — required (from Resend dashboard)
 *   EMAIL_FROM              — e.g. noreply@youthnic.shop (falls back to GMAIL_SENDER_EMAIL)
 *   EMAIL_FROM_NAME         — display name (falls back to GMAIL_FROM_NAME)
 */
export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  listUnsubscribeUrl?: string;
}

export function getFromEmail(): string {
  return (
    Deno.env.get("EMAIL_FROM")?.trim() ||
    Deno.env.get("GMAIL_SENDER_EMAIL")?.trim() ||
    "noreply@youthnic.shop"
  );
}

export function getFromName(): string {
  return (
    Deno.env.get("EMAIL_FROM_NAME")?.trim() ||
    Deno.env.get("GMAIL_FROM_NAME")?.trim() ||
    "TaskFlow Pro by VB Exports"
  );
}

export function buildUnsubscribeUrl(token: string): string | undefined {
  const base =
    Deno.env.get("APP_URL")?.replace(/\/$/, "") ||
    Deno.env.get("VITE_APP_URL")?.replace(/\/$/, "");
  if (!base || !token) return undefined;
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function sendTransactionalEmail(
  opts: SendEmailOptions,
): Promise<{ messageId: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured. Create a free account at resend.com, add your domain, and set the API key in Supabase secrets.",
    );
  }

  const fromEmail = opts.fromEmail || getFromEmail();
  const fromName = opts.fromName || getFromName();
  const to = opts.to.trim();

  const headers: Record<string, string> = {};
  if (opts.listUnsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${opts.listUnsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const body: Record<string, unknown> = {
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text || opts.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };
  if (opts.replyTo) body.reply_to = opts.replyTo;
  if (Object.keys(headers).length > 0) body.headers = headers;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (result as { message?: string }).message || JSON.stringify(result);
    if (msg.toLowerCase().includes("domain") || msg.toLowerCase().includes("verify")) {
      throw new Error(
        `Resend domain not verified for ${fromEmail}. In resend.com → Domains → add youthnic.shop and paste the DNS records at your domain registrar (no Google Workspace needed). Details: ${msg}`,
      );
    }
    throw new Error(`Resend send failed [${resp.status}]: ${msg}`);
  }

  return { messageId: String((result as { id?: string }).id || "sent") };
}

/** @deprecated Use sendTransactionalEmail — kept for existing imports */
export const sendGmailEmail = sendTransactionalEmail;
