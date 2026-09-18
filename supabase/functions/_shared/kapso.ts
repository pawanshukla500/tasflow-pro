/**
 * Kapso WhatsApp Cloud API (Youthnic Operations, +91 99982 49498).
 *
 * Daily pending-task alerts are business-initiated, so we send an approved
 * Utility template. Auth is `X-API-Key` (project key in Vault), never git.
 */
import { toWhatsAppDigits } from "./kwikengage.ts";

export const KAPSO_MESSAGES_URL =
  "https://api.kapso.ai/meta/whatsapp/v24.0";
export const KAPSO_PHONE_NUMBER_ID_DEFAULT = "1306133332581906";
export const KAPSO_TEMPLATE_DAILY_DIGEST_DEFAULT = "taskflow_daily_digest";
export const KAPSO_TEMPLATE_LANGUAGE_DEFAULT = "en";

function readEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name)?.trim() || undefined;
}

export type KapsoConfig = {
  apiKey: string;
  phoneNumberId: string;
  templateDailyDigest: string;
  templateLanguage: string;
};

export type DigestHighlightItem = { title: string };

/** WhatsApp template params cannot contain newlines or long runs of spaces. */
export function sanitizeTemplateText(value: string, max = 220): string {
  const cleaned = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Task";
  return cleaned.length > max ? `${cleaned.slice(0, Math.max(1, max - 3))}...` : cleaned;
}

export function buildDigestHighlights(opts: {
  delayed: DigestHighlightItem[];
  dueSoon: DigestHighlightItem[];
  pending: DigestHighlightItem[];
  workflows: DigestHighlightItem[];
}): string {
  const parts: string[] = [];
  const take = (label: string, items: DigestHighlightItem[], n = 2) => {
    if (!items.length) return;
    const titles = items.slice(0, n).map((t) => sanitizeTemplateText(t.title, 48)).join("; ");
    const extra = items.length > n ? ` +${items.length - n}` : "";
    parts.push(`${label}: ${titles}${extra}`);
  };
  take("Overdue", opts.delayed);
  take("Due soon", opts.dueSoon);
  if (!opts.delayed.length && !opts.dueSoon.length) take("Pending", opts.pending);
  if (opts.workflows.length) take("Workflows", opts.workflows, 1);
  return sanitizeTemplateText(parts.join(". ") || "Open My Tasks for the full list.", 220);
}

export function buildKapsoDailyDigestPayload(opts: {
  to: string;
  templateName: string;
  language: string;
  name: string;
  dateLabel: string;
  overdue: number;
  dueSoon: number;
  pending: number;
  workflows: number;
  highlights: string;
}): Record<string, unknown> {
  const named = [
    ["name", sanitizeTemplateText(opts.name, 40)],
    ["date", sanitizeTemplateText(opts.dateLabel, 24)],
    ["overdue", String(opts.overdue)],
    ["duesoon", String(opts.dueSoon)],
    ["pending", String(opts.pending)],
    ["workflows", String(opts.workflows)],
    ["highlights", sanitizeTemplateText(opts.highlights, 220)],
  ] as const;
  return {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.language },
      components: [
        {
          type: "body",
          parameters: named.map(([parameter_name, text]) => ({
            type: "text",
            parameter_name,
            text,
          })),
        },
      ],
    },
  };
}

export async function loadKapsoConfig(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<KapsoConfig | null> {
  const envKey = readEnv("KAPSO_API_KEY");
  const envPhone = readEnv("KAPSO_PHONE_NUMBER_ID");
  const envTemplate = readEnv("KAPSO_TEMPLATE_DAILY_DIGEST");
  const envLang = readEnv("KAPSO_TEMPLATE_LANGUAGE");

  const base = supabaseUrl.replace(/\/$/, "");
  let vault: Record<string, unknown> = {};
  try {
    const res = await fetch(`${base}/rest/v1/rpc/kapso_config`, {
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
    phoneNumberId: envPhone
      || (typeof vault.phone_number_id === "string" && vault.phone_number_id
        ? vault.phone_number_id
        : KAPSO_PHONE_NUMBER_ID_DEFAULT),
    templateDailyDigest: envTemplate
      || (typeof vault.template_daily_digest === "string" && vault.template_daily_digest
        ? vault.template_daily_digest
        : KAPSO_TEMPLATE_DAILY_DIGEST_DEFAULT),
    templateLanguage: envLang
      || (typeof vault.template_language === "string" && vault.template_language
        ? vault.template_language
        : KAPSO_TEMPLATE_LANGUAGE_DEFAULT),
  };
}

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

export async function sendKapsoTemplate(opts: {
  apiKey: string;
  phoneNumberId: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; messageId?: string; error?: string; httpStatus: number }> {
  try {
    const res = await fetch(
      `${KAPSO_MESSAGES_URL}/${encodeURIComponent(opts.phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": opts.apiKey,
        },
        body: JSON.stringify(opts.payload),
      },
    );
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const errObj = json.error && typeof json.error === "object"
        ? json.error as Record<string, unknown>
        : {};
      const error = firstString(errObj.message, json.message, json.error, `HTTP ${res.status}`);
      return { ok: false, error, httpStatus: res.status };
    }
    const messages = Array.isArray(json.messages) ? json.messages[0] as Record<string, unknown> : null;
    const messageId = firstString(
      messages?.id,
      json.message_id,
      json.wamid,
      json.id,
    );
    return { ok: true, messageId: messageId || undefined, httpStatus: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message || "network_error", httpStatus: 0 };
  }
}

export { toWhatsAppDigits };
