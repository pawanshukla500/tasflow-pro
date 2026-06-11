/** Quick DB row counts via service role REST */
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
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function q(table, select = "id") {
  const r = await fetch(`${url}/rest/v1/${table}?select=${select}`, { headers });
  const d = await r.json();
  if (!r.ok) return { error: d };
  return { count: d.length, sample: d.slice(0, 3) };
}

const tables = ["profiles", "organizations", "departments", "user_roles", "tasks"];
for (const t of tables) {
  const r = await q(t, t === "profiles" ? "id,name,email,organization_id,active" : "*");
  console.log(t, JSON.stringify(r, null, 2));
}
