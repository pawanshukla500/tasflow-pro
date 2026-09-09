/**
 * KwikEngage WhatsApp Business API (send-message/v2).
 *
 * Session (free-form) texts only work inside Meta's 24-hour window.
 * Task assignment is business-initiated, so we send an approved template:
 *   { type: "template", content: { type: "template", Template: { template_id, language } } }
 * Auth header is the raw API key (not "Bearer …").
 */

export const KWIKENGAGE_SEND_URL = "https://api.kwikengage.ai/send-message/v2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toWhatsAppDigits(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  let digits = mobile.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

export function completeButtonId(taskId: string): string {
  return `tf:complete:${taskId}`;
}

export function taskIdFromToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const prefixed = trimmed.match(/^tf:complete:([0-9a-f-]{36})$/i);
  if (prefixed && UUID_RE.test(prefixed[1])) return prefixed[1];
  if (UUID_RE.test(trimmed)) return trimmed;
  return null;
}

export function isCompleteIntent(text: string, buttonId = ""): boolean {
  const blob = `${buttonId} ${text}`.toLowerCase();
  if (blob.includes("tf:complete:")) return true;
  const token = text.trim().toLowerCase();
  return token === "complete" || token === "completed" || token === "done" || token === "mark complete";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

export function parseInboundWhatsApp(body: unknown): {
  phone: string | null;
  text: string;
  buttonId: string;
  taskId: string | null;
} {
  const root = asRecord(body) || {};
  const nested = asRecord(root.data) || asRecord(root.payload) || {};
  const message = asRecord(root.message)
    || asRecord(nested.message)
    || (Array.isArray(root.messages) ? asRecord(root.messages[0]) : null)
    || {};
  const interactive = asRecord(message.interactive) || asRecord(root.interactive) || {};
  const buttonReply = asRecord(interactive.button_reply)
    || asRecord(interactive.buttonReply)
    || asRecord(message.button)
    || {};

  const phone = toWhatsAppDigits(firstString(
    root.from,
    root.waId,
    root.wa_id,
    root.mobile,
    root.phone,
    nested.from,
    nested.waId,
    message.from,
  ));

  const text = firstString(
    message.text,
    asRecord(message.text)?.body,
    root.text,
    asRecord(root.content)?.text,
    buttonReply.title,
    buttonReply.text,
  );

  const buttonId = firstString(
    buttonReply.id,
    buttonReply.payload,
    buttonReply.payload_id,
    message.button_id,
    root.buttonId,
    root.payload,
  );

  return {
    phone,
    text,
    buttonId,
    taskId: taskIdFromToken(buttonId) || taskIdFromToken(text),
  };
}

export function buildTemplatePayload(opts: {
  to: string;
  templateId: string;
  language: string;
  bodyValues?: string[];
}): Record<string, unknown> {
  const template: Record<string, unknown> = {
    template_id: opts.templateId,
    language: opts.language,
  };
  if (opts.bodyValues && opts.bodyValues.length > 0) {
    template.body_values = opts.bodyValues;
  }
  return {
    to: opts.to,
    channel: "whatsapp",
    type: "template",
    content: {
      type: "template",
      Template: template,
    },
  };
}

export async function sendKwikEngageTemplate(opts: {
  apiKey: string;
  to: string;
  templateId: string;
  language: string;
  bodyValues?: string[];
}): Promise<{ ok: boolean; messageId?: string; error?: string; httpStatus: number }> {
  const res = await fetch(KWIKENGAGE_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: opts.apiKey,
    },
    body: JSON.stringify(buildTemplatePayload(opts)),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const error = typeof json.message === "string"
      ? json.message
      : typeof json.error === "string"
        ? json.error
        : `HTTP ${res.status}`;
    return { ok: false, error, httpStatus: res.status };
  }
  const messageId = firstString(json.message_id_attr, json.messageId, json.message_id);
  return { ok: true, messageId: messageId || undefined, httpStatus: res.status };
}

function readEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name)?.trim() || undefined;
}

export type KwikEngageConfig = {
  apiKey: string;
  merchantId: string;
  templateTaskAssigned: string;
  templateLanguage: string;
  webhookSecret: string;
};

export async function loadKwikEngageConfig(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<KwikEngageConfig | null> {
  const envKey = readEnv("KWIKENGAGE_API_KEY");
  const envTemplate = readEnv("KWIKENGAGE_TEMPLATE_TASK_ASSIGNED");
  const envLang = readEnv("KWIKENGAGE_TEMPLATE_LANGUAGE");
  const envMerchant = readEnv("KWIKENGAGE_MERCHANT_ID");
  const envWebhook = readEnv("KWIKENGAGE_WEBHOOK_SECRET");

  const base = supabaseUrl.replace(/\/$/, "");
  let vault: Record<string, unknown> = {};
  try {
    const res = await fetch(`${base}/rest/v1/rpc/kwikengage_config`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (res.ok) vault = await res.json() as Record<string, unknown>;
  } catch {
    vault = {};
  }

  const apiKey = envKey || (typeof vault.api_key === "string" ? vault.api_key.trim() : "");
  if (!apiKey) return null;
  return {
    apiKey,
    merchantId: envMerchant || (typeof vault.merchant_id === "string" ? vault.merchant_id : ""),
    templateTaskAssigned: envTemplate
      || (typeof vault.template_task_assigned === "string" && vault.template_task_assigned
        ? vault.template_task_assigned
        : "test_template"),
    templateLanguage: envLang
      || (typeof vault.template_language === "string" && vault.template_language
        ? vault.template_language
        : "en"),
    webhookSecret: envWebhook
      || (typeof vault.webhook_secret === "string" ? vault.webhook_secret : ""),
  };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function isKwikEngageAuthorized(
  req: Request,
  apiKey: string,
  webhookSecret?: string,
): boolean {
  const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth.trim();
  const headerSecret = req.headers.get("x-kwikengage-secret") || "";
  const querySecret = new URL(req.url).searchParams.get("token") || "";
  const candidates = [token, headerSecret, querySecret].filter(Boolean);
  for (const c of candidates) {
    if (timingSafeEqual(c, apiKey)) return true;
    if (webhookSecret && timingSafeEqual(c, webhookSecret)) return true;
  }
  return false;
}
