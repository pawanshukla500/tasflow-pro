/**
 * Smoke-test Supabase REST tables + edge function endpoints.
 * Run: node scripts/test-api.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

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
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];

async function test(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message || String(e) });
  }
}

async function restGet(table, key = ANON) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  return { status: res.status, count: Array.isArray(body) ? body.length : "?" };
}

async function edgePost(name, body = {}, key = ANON) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }
  return { status: res.status, body: parsed };
}

console.log("TaskFlow Pro — API smoke test");
console.log("Supabase:", SUPABASE_URL);
console.log("---");

// Health: Supabase project reachable
await test("Supabase project reachable", async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON } });
  if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

// Core tables (service role — bypasses RLS for existence check)
const tables = [
  "profiles",
  "departments",
  "user_roles",
  "department_managers",
  "tasks",
  "task_assignees",
  "task_subtasks",
  "organizations",
  "organization_members",
  "workflows",
  "workflow_templates",
  "goals",
  "notification_preferences",
  "conversations",
];

for (const t of tables) {
  await test(`Table: ${t}`, async () => {
    if (!SERVICE || SERVICE.startsWith("REPLACE")) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
    return await restGet(t, SERVICE);
  });
}

// Anon access (RLS) — should return 200 with empty array when no session
await test("Anon: profiles (RLS)", async () => restGet("profiles", ANON));
await test("Anon: departments (RLS)", async () => restGet("departments", ANON));

// Edge functions
const edgeFns = [
  "firebase-auth",
  "register-organization",
  "create-team-member",
  "delete-team-member",
  "firebase-upload",
  "send-transactional-email",
  "process-email-queue",
  "daily-motivation",
  "send-daily-digest",
  "notify-task-assigned",
];

for (const fn of edgeFns) {
  await test(`Edge fn reachable: ${fn}`, async () => {
    const { status, body } = await edgePost(fn, fn === "firebase-auth" ? {} : {});
    // 400/401/500 with JSON body = function deployed; 404 = not deployed
    if (status === 404) throw new Error("Not deployed (404)");
    if (typeof body === "string" && body.includes("NOT_FOUND")) throw new Error("Not deployed");
    return `HTTP ${status} — ${typeof body === "object" && body.error ? body.error : "responds"}`;
  });
}

// Firebase Identity Toolkit (verify API key)
await test("Firebase API key valid", async () => {
  const apiKey = env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("VITE_FIREBASE_API_KEY missing");
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true, email: `test-${Date.now()}@example.com`, password: "TestPass123!" }),
    },
  );
  const body = await res.json();
  if (!res.ok && body?.error?.message?.includes("API key")) throw new Error(body.error.message);
  return res.ok ? "signUp OK (test user created — delete in Firebase Console if needed)" : `expected flow: ${body?.error?.message || res.status}`;
});

console.log("\nResults:\n");
let pass = 0;
let fail = 0;
for (const r of results) {
  const icon = r.ok ? "PASS" : "FAIL";
  if (r.ok) pass++; else fail++;
  console.log(`  [${icon}] ${r.name}`);
  if (!r.ok || process.env.VERBOSE) console.log(`         ${typeof r.detail === "object" ? JSON.stringify(r.detail) : r.detail}`);
}
console.log(`\n${pass} passed, ${fail} failed, ${results.length} total\n`);
process.exit(fail > 0 ? 1 : 0);
