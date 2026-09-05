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
    expect(modal).toContain("project_id: projectId || null");
  });

  it("keeps bulk CSV import in-app only so a large import cannot flood inboxes", () => {
    expect(SEND_EMAIL_ON_TASK_IMPORT).toBe(false);
    const modal = readFileSync(resolve(srcDir, "components/ImportTasksModal.tsx"), "utf8");
    expect(modal).toContain("sendEmail: SEND_EMAIL_ON_TASK_IMPORT");
    expect(modal).not.toMatch(/sendEmail:\s*false/);
  });
});

describe("email cron SQL", () => {
  it("schedules send-daily-digest with Authorization so Vault JWTs are accepted", () => {
    const sql = readFileSync(resolve(srcDir, "../scripts/fix-email-crons.sql"), "utf8");
    expect(sql).toMatch(/cron\.schedule\(\s*'send-daily-digest'[\s\S]*?Authorization/);
    expect(sql).toContain("x-internal-service-key");
    expect(sql).toContain("timeout_milliseconds");
  });
});
