import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildTemplatePayload,
  completeButtonId,
  isCompleteIntent,
  isKwikEngageAuthorized,
  parseInboundWhatsApp,
  taskIdFromToken,
  toWhatsAppDigits,
} from "../../supabase/functions/_shared/kwikengage";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TASK_ID = "11111111-1111-4111-8111-111111111111";

describe("KwikEngage WhatsApp helpers", () => {
  it("normalizes Indian mobiles to WhatsApp digits", () => {
    expect(toWhatsAppDigits("+91 94262 79142")).toBe("919426279142");
    expect(toWhatsAppDigits("9426279142")).toBe("919426279142");
    expect(toWhatsAppDigits("0091-9426279142")).toBe("919426279142");
    expect(toWhatsAppDigits("91")).toBeNull();
    expect(toWhatsAppDigits("")).toBeNull();
  });

  it("detects Complete replies and button tokens", () => {
    expect(isCompleteIntent("Complete")).toBe(true);
    expect(isCompleteIntent("done")).toBe(true);
    expect(isCompleteIntent("Thanks")).toBe(false);
    expect(isCompleteIntent("", completeButtonId(TASK_ID))).toBe(true);
    expect(taskIdFromToken(completeButtonId(TASK_ID))).toBe(TASK_ID);
    expect(taskIdFromToken("not-a-task")).toBeNull();
  });

  it("parses inbound Complete from nested KwikEngage payloads", () => {
    const inbound = parseInboundWhatsApp({
      from: 919426279142,
      message: {
        interactive: { button_reply: { id: completeButtonId(TASK_ID), title: "Complete" } },
      },
    });
    expect(inbound.phone).toBe("919426279142");
    expect(inbound.taskId).toBe(TASK_ID);
    expect(isCompleteIntent(inbound.text, inbound.buttonId)).toBe(true);
  });

  it("builds a template payload with template_id (not Bearer auth)", () => {
    const payload = buildTemplatePayload({
      to: "919426279142",
      templateId: "test_template",
      language: "en",
    });
    expect(payload).toEqual({
      to: "919426279142",
      channel: "whatsapp",
      type: "template",
      content: {
        type: "template",
        Template: { template_id: "test_template", language: "en" },
      },
    });
    const headers = readFileSync(resolve(repoRoot, "supabase/functions/_shared/kwikengage.ts"), "utf8");
    expect(headers).toContain("Authorization: opts.apiKey");
    expect(headers).not.toContain("Bearer ${opts.apiKey}");
  });

  it("authorizes the webhook with the query token or raw API key", () => {
    const apiKey = "test-api-key-32-chars-xxxxxxxxxxx";
    const secret = "webhook-secret-32-chars-xxxxxxxxx";
    const ok = new Request(`https://example.test/kwikengage-webhook?token=${secret}`, { method: "POST" });
    const raw = new Request("https://example.test/kwikengage-webhook", {
      method: "POST",
      headers: { Authorization: apiKey },
    });
    const no = new Request("https://example.test/kwikengage-webhook", { method: "POST" });
    expect(isKwikEngageAuthorized(ok, apiKey, secret)).toBe(true);
    expect(isKwikEngageAuthorized(raw, apiKey, secret)).toBe(true);
    expect(isKwikEngageAuthorized(no, apiKey, secret)).toBe(false);
  });
});

describe("WhatsApp wiring", () => {
  it("deploys the inbound webhook without gateway JWT", () => {
    const deploy = readFileSync(resolve(repoRoot, "scripts/deploy-supabase.sh"), "utf8");
    const config = readFileSync(resolve(repoRoot, "supabase/config.toml"), "utf8");
    expect(deploy).toContain("kwikengage-webhook");
    expect(config).toMatch(/\[functions\.kwikengage-webhook\][\s\S]*verify_jwt = false/);
  });

  it("sends WhatsApp from notify-task-assigned and honors the Settings toggle", () => {
    const notify = readFileSync(
      resolve(repoRoot, "supabase/functions/notify-task-assigned/index.ts"),
      "utf8",
    );
    const settings = readFileSync(resolve(repoRoot, "src/pages/SettingsPage.tsx"), "utf8");
    expect(notify).toContain("sendKwikEngageTemplate");
    expect(notify).toContain("whatsapp_outbound");
    expect(notify).toContain("whatsapp_alerts");
    expect(settings).toContain("whatsappAlerts");
    expect(settings).toContain("whatsapp_alerts: whatsappAlerts");
  });

  it("does not commit the KwikEngage API key", () => {
    const migration = readFileSync(
      resolve(repoRoot, "supabase/migrations/20260909180000_kwikengage_whatsapp.sql"),
      "utf8",
    );
    const helper = readFileSync(resolve(repoRoot, "supabase/functions/_shared/kwikengage.ts"), "utf8");
    expect(migration).toContain("kwikengage_api_key");
    expect(migration).not.toMatch(/03c3feea/i);
    expect(helper).not.toMatch(/03c3feea/i);
  });
});
