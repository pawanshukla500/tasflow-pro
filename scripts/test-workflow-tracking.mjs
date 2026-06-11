/**
 * Verify workflow tracking number generation (requires migration applied + service role).
 * Run: node scripts/test-workflow-tracking.mjs
 */
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

const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

console.log("Testing workflow tracking number generation...\n");

const numbers = new Set();
for (let i = 0; i < 3; i++) {
  const res = await fetch(`${url}/rest/v1/rpc/generate_workflow_tracking_number`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const text = await res.text();
  let num = text.replace(/^"|"$/g, "");
  try { num = JSON.parse(text); } catch { /* raw string */ }
  console.log(`  ${i + 1}. ${num}`);
  if (numbers.has(num)) {
    console.error("\nFAIL — duplicate tracking number generated:", num);
    process.exit(1);
  }
  if (!/^WF-\d{8}-\d{6}$/.test(String(num))) {
    console.error("\nFAIL — invalid format:", num);
    process.exit(1);
  }
  numbers.add(String(num));
}

console.log("\nOK — all numbers unique and match WF-YYYYMMDD-000001 format");
