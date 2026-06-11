/**
 * Upload Resend + email sender secrets to Supabase.
 * Run: node scripts/upload-email-secrets.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const projectRef = "nekdjoquirhecmejuoba";

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch {
    /* ignore */
  }
  return env;
}

const env = loadEnv();
const apiKey = env.RESEND_API_KEY;
if (!apiKey || apiKey.startsWith("REPLACE")) {
  console.error("Missing RESEND_API_KEY in .env");
  console.error("1. Sign up at https://resend.com (free)");
  console.error("2. Create API key → paste as RESEND_API_KEY=re_... in .env");
  process.exit(1);
}

const lines = [
  `RESEND_API_KEY=${apiKey}`,
  `EMAIL_FROM=${env.EMAIL_FROM || env.GMAIL_SENDER_EMAIL || "noreply@youthnic.shop"}`,
  `EMAIL_FROM_NAME=${env.EMAIL_FROM_NAME || env.GMAIL_FROM_NAME || "TaskFlow Pro by VB Exports"}`,
];

if (env.APP_URL) lines.push(`APP_URL=${env.APP_URL}`);
lines.push(`EMAIL_LOGO_URL=${env.EMAIL_LOGO_URL || `${(env.APP_URL || "https://task.youthnic.shop").replace(/\/$/, "")}/youthnic-logo.svg`}`);

const tempEnv = resolve(tmpdir(), `taskflow-email-${Date.now()}.env`);
writeFileSync(tempEnv, lines.join("\n") + "\n", "utf8");

console.log("Uploading email secrets to Supabase...");
const result = spawnSync(
  "npx",
  ["supabase", "secrets", "set", "--env-file", tempEnv, "--project-ref", projectRef],
  { cwd: root, stdio: "inherit", shell: true },
);

try {
  unlinkSync(tempEnv);
} catch {
  /* ignore */
}

if (result.status === 0) {
  console.log("Done. Deploy functions: .\\scripts\\setup-email.ps1");
}
process.exit(result.status ?? 1);
