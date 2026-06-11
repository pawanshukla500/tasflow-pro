// One-off repair: add Firebase download tokens to existing task attachments whose
// stored URL is a plain storage.googleapis.com link (AccessDenied for anonymous users),
// then rewrite the DB row to the tokenized firebasestorage.googleapis.com URL.
// Usage: node scripts/repair-attachment-urls.mjs
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const SUPABASE_URL = env.SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const sa = JSON.parse(readFileSync(env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH || "./secrets/firebase-service-account.json", "utf8"));

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

async function gcsToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.full_control",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const sig = signer.sign(sa.private_key).toString("base64url");
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  if (!resp.ok) throw new Error(`token exchange failed: ${await resp.text()}`);
  return (await resp.json()).access_token;
}

const rest = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

const rows = await (await rest("task_attachments?select=id,file_url,file_name")).json();
const broken = rows.filter((r) => r.file_url?.startsWith("https://storage.googleapis.com/"));
console.log(`Found ${rows.length} attachments, ${broken.length} need repair.`);
if (broken.length === 0) process.exit(0);

const access = await gcsToken();

for (const row of broken) {
  const u = new URL(row.file_url);
  const [, bucket, ...pathParts] = u.pathname.split("/");
  const objectPath = decodeURIComponent(pathParts.join("/"));
  const token = crypto.randomUUID();

  const patch = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { firebaseStorageDownloadTokens: token } }),
    },
  );
  if (!patch.ok) {
    console.error(`  SKIP ${row.file_name}: GCS patch failed ${patch.status} ${await patch.text()}`);
    continue;
  }

  const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  const upd = await rest(`task_attachments?id=eq.${row.id}`, {
    method: "PATCH",
    body: JSON.stringify({ file_url: newUrl }),
  });
  console.log(`  ${upd.ok ? "FIXED" : "DB-FAIL"} ${row.file_name}`);
  if (upd.ok) console.log(`    ${newUrl}`);
}
console.log("Done.");
