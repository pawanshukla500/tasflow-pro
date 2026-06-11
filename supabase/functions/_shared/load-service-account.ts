/**
 * Load Firebase / Gmail service account JSON from env.
 * Option A: FIREBASE_SERVICE_ACCOUNT_JSON = inline JSON (Supabase Dashboard secrets)
 * Option B: FIREBASE_SERVICE_ACCOUNT_JSON_PATH = path to .json file (local .env)
 */
export async function loadServiceAccountJsonRaw(): Promise<string> {
  const inline =
    Deno.env.get("GMAIL_SERVICE_ACCOUNT_JSON") ||
    Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (inline?.trim()) return inline.trim();

  const filePath =
    Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON_PATH") ||
    Deno.env.get("GMAIL_SERVICE_ACCOUNT_JSON_PATH");
  if (filePath?.trim()) {
    try {
      return await Deno.readTextFile(filePath.trim());
    } catch (e) {
      throw new Error(
        `Could not read service account file at ${filePath}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  throw new Error(
    "Missing Firebase service account: set FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON) " +
      "or FIREBASE_SERVICE_ACCOUNT_JSON_PATH=./secrets/firebase-service-account.json in .env",
  );
}

export async function loadServiceAccount(): Promise<{
  client_email: string;
  private_key: string;
  token_uri?: string;
}> {
  const raw = await loadServiceAccountJsonRaw();
  let sa: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("Service account JSON is not valid JSON");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("Service account JSON missing client_email or private_key");
  }
  return sa as { client_email: string; private_key: string; token_uri?: string };
}
