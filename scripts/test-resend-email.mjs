/**
 * Smoke-test Resend email path via send-password-reset edge function.
 * Run: node scripts/test-resend-email.mjs [email]
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const testEmail = process.argv[2] || "returnorders@vbexports.co.in";

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

console.log("Testing send-password-reset → Resend for:", testEmail);
console.log("Supabase:", url);

const res = await fetch(`${url}/functions/v1/send-password-reset`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ email: testEmail }),
});

const body = await res.json().catch(() => ({}));
console.log("HTTP", res.status);
console.log(JSON.stringify(body, null, 2));

if (res.ok && body.ok && body.emailSent) {
  console.log("\nOK — check inbox for:", body.subject);
  if (body.version) console.log("Function version:", body.version);
  process.exit(0);
}

if (res.ok && body.ok && !body.messageId) {
  console.warn("\nWARN — old function version may still be deployed. Run .\\scripts\\setup-email.ps1");
  process.exit(1);
}

console.error("\nFAIL —", body.error || "unknown error");
process.exit(1);
