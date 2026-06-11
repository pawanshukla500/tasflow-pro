/** Edge function response detail (no service role DB dump) */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }),
);
const base = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function post(fn, body) {
  const res = await fetch(`${base}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 400); }
  return { status: res.status, body: parsed };
}

const tests = [
  ["firebase-auth (no token)", "firebase-auth", {}],
  ["firebase-auth (bad token)", "firebase-auth", { idToken: "invalid" }],
  ["register-organization (empty)", "register-organization", {}],
  ["create-team-member (empty)", "create-team-member", {}],
  ["delete-team-member (empty)", "delete-team-member", {}],
];

for (const [label, fn, body] of tests) {
  const r = await post(fn, body);
  console.log(`\n${label}:`);
  console.log(`  HTTP ${r.status}`);
  console.log(`  ${JSON.stringify(r.body)}`);
}
