/**
 * Render a transactional template and send immediately via Resend.
 * Used for password reset + welcome emails so failures surface to the caller.
 */
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { TEMPLATES } from "./transactional-email-templates/registry.ts";
import { sendTransactionalEmail, buildUnsubscribeUrl } from "./send-email.ts";

export interface SendEmailResult {
  sent: boolean;
  subject?: string;
  messageId?: string;
  error?: string;
}

function friendlyEmailError(raw: string): string {
  if (raw.includes("RESEND_API_KEY")) {
    return "Email API key missing. Add RESEND_API_KEY to .env and run: node scripts/upload-email-secrets.mjs";
  }
  if (raw.includes("domain not verified") || raw.includes("Resend domain")) {
    return raw;
  }
  if (raw.includes("Service account") || raw.includes("client_email")) {
    return "Firebase service account is missing. Run: node scripts/upload-firebase-secret.mjs";
  }
  return raw;
}

export async function renderAndSendEmail(opts: {
  templateName: string;
  recipientEmail: string;
  templateData?: Record<string, unknown>;
  unsubscribeToken?: string;
}): Promise<SendEmailResult> {
  const template = TEMPLATES[opts.templateName];
  if (!template) {
    return { sent: false, error: `Unknown email template: ${opts.templateName}` };
  }

  const recipient = (template.to || opts.recipientEmail || "").trim().toLowerCase();
  if (!recipient) {
    return { sent: false, error: "recipientEmail is required" };
  }

  const data = opts.templateData || {};
  const html = await renderAsync(React.createElement(template.component, data));
  const plainText = await renderAsync(React.createElement(template.component, data), { plainText: true });
  const subject =
    typeof template.subject === "function" ? template.subject(data) : template.subject;

  try {
    const { messageId } = await sendTransactionalEmail({
      to: recipient,
      subject,
      html,
      text: plainText,
      listUnsubscribeUrl: opts.unsubscribeToken
        ? buildUnsubscribeUrl(opts.unsubscribeToken)
        : undefined,
    });
    return { sent: true, subject, messageId };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { sent: false, subject, error: friendlyEmailError(raw) };
  }
}
