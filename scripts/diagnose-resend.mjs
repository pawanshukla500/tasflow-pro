/**
 * Compare local .env Resend config with Supabase secrets and test Resend API directly.
 * Run: node scripts/diagnose-resend.mjs [email]
 */
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const testEmail = process.argv[2] || "returnorders@vbexports.co.in";

const REMOTE_HASHES = {
  RESEND_API_KEY: "a6ad360124c7dd956c81b81e6671a1995d8559eb1c8c8c076f7702867a798640",
  EMAIL_FROM: "68ada1b6a8ea319e7dfcc3387626c31b0ba8b0503b48999bffc3fa3ed2ab141f",
};

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const apiKey = env.RESEND_API_KEY;
const fromEmail = env.EMAIL_FROM || env.GMAIL_SENDER_EMAIL || "noreply@youthnic.shop";
const fromName = env.EMAIL_FROM_NAME || env.GMAIL_FROM_NAME || "TaskFlow Pro by VB Exports";

console.log("=== Resend diagnostics ===\n");

if (!apiKey?.startsWith("re_")) {
  console.error("Local RESEND_API_KEY missing or invalid in .env");
  process.exit(1);
}

console.log("Local key prefix:", apiKey.slice(0, 8) + "...");
console.log("Local RESEND_API_KEY matches Supabase secret:", sha(apiKey) === REMOTE_HASHES.RESEND_API_KEY);
console.log("Local EMAIL_FROM:", fromEmail);
console.log("Local EMAIL_FROM matches Supabase secret:", sha(fromEmail) === REMOTE_HASHES.EMAIL_FROM);

console.log("\n1) Direct Resend API test (local .env key)...");
const direct = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: `${fromName} <${fromEmail}>`,
    to: [testEmail],
    subject: "TaskFlow Pro — Resend direct API diagnostic",
    html: "<p>Direct API test from diagnose-resend.mjs using local .env credentials.</p>",
  }),
});
const directBody = await direct.json().catch(() => ({}));
console.log("HTTP", direct.status, JSON.stringify(directBody, null, 2));

console.log("\n2) Edge function send-password-reset...");
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const edge = await fetch(`${url}/functions/v1/send-password-reset`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  },
  body: JSON.stringify({ email: testEmail }),
});
const edgeBody = await edge.json().catch(() => ({}));
console.log("HTTP", edge.status, JSON.stringify(edgeBody, null, 2));

if (sha(apiKey) !== REMOTE_HASHES.RESEND_API_KEY) {
  console.log("\n>>> MISMATCH: Supabase has a different RESEND_API_KEY than .env");
  console.log(">>> Fix: node scripts/upload-email-secrets.mjs");
}
