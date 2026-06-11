/**
 * Upload FIREBASE_SERVICE_ACCOUNT_JSON to Supabase without shell quoting issues.
 * Run: node scripts/upload-firebase-secret.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const projectRef = "nekdjoquirhecmejuoba";
const saPath = resolve(root, "secrets/firebase-service-account.json");

let sa;
try {
  sa = JSON.parse(readFileSync(saPath, "utf8"));
} catch (e) {
  console.error("Missing or invalid secrets/firebase-service-account.json");
  console.error("Download from Firebase Console -> Service accounts -> Generate new private key");
  process.exit(1);
}

if (!sa.client_email || !sa.private_key) {
  console.error("Service account JSON missing client_email or private_key");
  process.exit(1);
}

console.log("Service account OK:", sa.project_id, sa.client_email);

const tempEnv = resolve(tmpdir(), `taskflow-sa-${Date.now()}.env`);
writeFileSync(tempEnv, `FIREBASE_SERVICE_ACCOUNT_JSON=${JSON.stringify(sa)}\n`, "utf8");

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

process.exit(result.status ?? 1);
