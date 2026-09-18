import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  KAPSO_PHONE_NUMBER_ID_DEFAULT,
  KAPSO_TEMPLATE_DAILY_DIGEST_DEFAULT,
  buildDigestHighlights,
  buildKapsoDailyDigestPayload,
  sanitizeTemplateText,
} from "../../supabase/functions/_shared/kapso";
import { toWhatsAppDigits, isIndiaTeamMobile } from "../../supabase/functions/_shared/kwikengage";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const TEAM_MOBILES = [
  "+91 7621062842",
  "+91 9265217024",
  "+91 8000521359",
  "+91 9173365517",
  "+91 9631009371",
  "+91 9460110252",
  "+91 8866077404",
  "+91 7490961501",
  "+91 8460133169",
  "+91 9998435644",
  "+91 9512196297",
  "+91 7984749725",
  "+91 9825149497",
  "+91 6376573077",
  "+91 9426279142",
  "+91 8460803493",
  "+91 9913039677",
  "+91 9334281277",
  "+91 9984229302",
  "+91 8153049141",
  "+91 6352709263",
  "+91 7227076777",
  "+91 6306361624",
  "+91 8849786419",
];

describe("Kapso daily digest WhatsApp", () => {
  it("parses every active teammate mobile with country code to 12-digit WhatsApp ids", () => {
    expect(toWhatsAppDigits("+91  6376573077")).toBe("916376573077");
    expect(TEAM_MOBILES).toHaveLength(24);
    for (const mobile of TEAM_MOBILES) {
      const digits = toWhatsAppDigits(mobile);
      expect(digits, mobile).toMatch(/^91\d{10}$/);
      expect(isIndiaTeamMobile(mobile), mobile).toBe(true);
    }
  });

  it("builds a named-parameter Utility payload and a one-line highlights string", () => {
    const highlights = buildDigestHighlights({
      delayed: [{ title: "Follow up\nlistings" }],
      dueSoon: [{ title: "Invoice check" }, { title: "Packing" }, { title: "Extra" }],
      pending: [{ title: "Later" }],
      workflows: [{ title: "PO approval" }],
    });
    expect(highlights).toContain("Overdue: Follow up listings");
    expect(highlights).toContain("Due soon: Invoice check; Packing +1");
    expect(highlights).not.toMatch(/\n/);
    expect(sanitizeTemplateText("  hi\nthere  ")).toBe("hi there");

    const payload = buildKapsoDailyDigestPayload({
      to: "919426279142",
      templateName: KAPSO_TEMPLATE_DAILY_DIGEST_DEFAULT,
      language: "en",
      name: "Pawan Shukla",
      dateLabel: "18 Sep 2026",
      overdue: 1,
      dueSoon: 3,
      pending: 5,
      workflows: 1,
      highlights,
    });
    expect(payload).toMatchObject({
      messaging_product: "whatsapp",
      to: "919426279142",
      type: "template",
    });
    const template = payload.template as {
      name: string;
      language: { code: string };
      components: { parameters: { parameter_name: string; text: string }[] }[];
    };
    expect(template.name).toBe("taskflow_daily_digest");
    expect(template.language.code).toBe("en");
    const names = template.components[0].parameters.map((p) => p.parameter_name);
    expect(names).toEqual([
      "name",
      "date",
      "overdue",
      "duesoon",
      "pending",
      "workflows",
      "highlights",
    ]);
  });

  it("wires Kapso into send-daily-digest and keeps the key out of git", () => {
    const digest = readFileSync(
      resolve(repoRoot, "supabase/functions/send-daily-digest/index.ts"),
      "utf8",
    );
    const migration = readFileSync(
      resolve(repoRoot, "supabase/migrations/20260918103000_kapso_daily_digest.sql"),
      "utf8",
    );
    const helper = readFileSync(resolve(repoRoot, "supabase/functions/_shared/kapso.ts"), "utf8");
    expect(digest).toContain("sendKapsoTemplate");
    expect(digest).toContain("buildKapsoDailyDigestPayload");
    expect(digest).toContain("whatsapp_alerts");
    expect(digest).toContain("purpose: \"daily_digest\"");
    expect(digest).toContain("idempotency_key: waKey");
    expect(digest).toMatch(/duplicate\|unique\|23505/);
    expect(helper).toContain("network_error");
    expect(helper).toContain("try {");
    const webhook = readFileSync(
      resolve(repoRoot, "supabase/functions/kwikengage-webhook/index.ts"),
      "utf8",
    );
    expect(webhook).toContain('.eq("purpose", "assignment")');
    expect(webhook).toContain('.not("task_id", "is", null)');
    expect(migration).toContain("kapso_config");
    expect(migration).toContain("kapso_api_key");
    expect(migration).toContain("whatsapp_outbound_assignment_has_task");
    expect(migration).toContain(KAPSO_PHONE_NUMBER_ID_DEFAULT);
    expect(helper).toContain("X-API-Key");
    expect(helper).not.toMatch(/sk_live|kapso_[A-Za-z0-9]{20,}/);
  });

  it("sends a merge-time WhatsApp to the system_admin phone even with no pending work", () => {
    const digest = readFileSync(
      resolve(repoRoot, "supabase/functions/send-daily-digest/index.ts"),
      "utf8",
    );
    const nowSql = readFileSync(resolve(repoRoot, "scripts/send-daily-digest-now.sql"), "utf8");
    const cronSql = readFileSync(resolve(repoRoot, "scripts/fix-email-crons.sql"), "utf8");
    expect(digest).toContain("smoke_admins");
    expect(digest).toContain('.eq("role", "system_admin")');
    expect(digest).not.toContain("managing_director");
    expect(digest).toContain("admin_smoke");
    expect(digest).toContain("Post-merge admin WhatsApp digest test.");
    expect(nowSql).toContain('{"smoke_admins": true}');
    expect(cronSql).toContain("body := '{}'::jsonb");
    expect(cronSql).not.toContain("smoke_admins");
    expect(cronSql).toMatch(/cron\.schedule\(\s*'send-daily-digest',\s*'30 4 \* \* 1-6'/);
    expect(toWhatsAppDigits("+91 9426279142")).toBe("919426279142");
  });

  it("lets Admin Settings check names/numbers and send today's digest by hand", () => {
    const panel = readFileSync(resolve(repoRoot, "src/components/AdminSettingsPanel.tsx"), "utf8");
    const smoke = readFileSync(
      resolve(repoRoot, "supabase/functions/email-system-smoke-test/index.ts"),
      "utf8",
    );
    const trigger = readFileSync(
      resolve(repoRoot, "supabase/functions/trigger-daily-digest/index.ts"),
      "utf8",
    );
    const deploy = readFileSync(resolve(repoRoot, "scripts/deploy-supabase.sh"), "utf8");
    const config = readFileSync(resolve(repoRoot, "supabase/config.toml"), "utf8");
    const migration = readFileSync(
      resolve(repoRoot, "supabase/migrations/20260918160000_daily_digest_10am_mon_sat.sql"),
      "utf8",
    );
    expect(panel).toContain("Check who would get it");
    expect(panel).toContain("Send today's digest");
    expect(panel).toContain("trigger-daily-digest");
    expect(panel).toContain("10:00 AM IST");
    expect(smoke).toContain("whatsappDigits");
    expect(smoke).toContain("phoneFormatOk");
    expect(smoke).toContain("isIndiaTeamMobile");
    expect(trigger).toContain("is_admin_or_md");
    expect(trigger).toContain("send-daily-digest");
    expect(trigger).toContain("daily_digest.manual_send");
    expect(deploy).toContain("trigger-daily-digest");
    expect(config).toContain("[functions.trigger-daily-digest]");
    expect(migration).toContain("30 4 * * 1-6");
  });
});
