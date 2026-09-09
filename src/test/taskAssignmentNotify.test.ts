import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SEND_EMAIL_ON_TASK_CREATE,
  SEND_EMAIL_ON_TASK_IMPORT,
} from "@/lib/taskAssignmentNotify";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("task assignment email policy", () => {
  it("emails assignees when a task is created in the UI", () => {
    expect(SEND_EMAIL_ON_TASK_CREATE).toBe(true);
    const modal = readFileSync(resolve(srcDir, "components/CreateTaskModal.tsx"), "utf8");
    expect(modal).toContain("sendEmail: SEND_EMAIL_ON_TASK_CREATE");
    expect(modal).not.toMatch(/sendEmail:\s*false/);
    expect(modal).toContain("initialProjectId");
    expect(modal).toContain("if (initialProjectId) insertRow.project_id = initialProjectId");
    expect(modal).toContain("projectsLoaded: projects.length > 0 || !assignedProjectId");
    expect(modal).toContain("omitTaskHourColumns(insertRow)");
    expect(modal).toContain("!projectLocked &&");
  });

  it("keeps bulk CSV import in-app only so a large import cannot flood inboxes", () => {
    expect(SEND_EMAIL_ON_TASK_IMPORT).toBe(false);
    const modal = readFileSync(resolve(srcDir, "components/ImportTasksModal.tsx"), "utf8");
    expect(modal).toContain("sendEmail: SEND_EMAIL_ON_TASK_IMPORT");
    expect(modal).not.toMatch(/sendEmail:\s*false/);
  });
});

describe("email cron SQL", () => {
  it("schedules send-daily-digest at 09:30 IST with Authorization and the Vault-key RPC", () => {
    const sql = readFileSync(resolve(srcDir, "../scripts/fix-email-crons.sql"), "utf8");
    expect(sql).toMatch(/cron\.schedule\(\s*'send-daily-digest'[\s\S]*?Authorization/);
    expect(sql).toContain("x-internal-service-key");
    expect(sql).toContain("timeout_milliseconds");
    expect(sql).toContain("0 4 * * 1-6");
    expect(sql).toContain("internal_cron_key_matches");
  });

  it("queues today's digest after functions deploy so merge recovers a missed 09:30 IST run", () => {
    const deploy = readFileSync(resolve(srcDir, "../scripts/deploy-supabase.sh"), "utf8");
    const nowSql = readFileSync(resolve(srcDir, "../scripts/send-daily-digest-now.sql"), "utf8");
    const migration = readFileSync(
      resolve(srcDir, "../supabase/migrations/20260909093000_vault_cron_key_auth.sql"),
      "utf8",
    );
    expect(deploy).toContain("send-daily-digest-now.sql");
    expect(deploy.indexOf("functions deploy")).toBeLessThan(deploy.indexOf("send-daily-digest-now.sql"));
    expect(nowSql).toContain("functions/v1/send-daily-digest");
    expect(nowSql).toContain("report_cron_service_role_key");
    expect(migration).toContain("internal_cron_key_matches");
    expect(migration).toContain("GRANT EXECUTE");
  });
});
