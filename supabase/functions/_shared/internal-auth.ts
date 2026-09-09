/**
 * Auth for cron / function-to-function calls.
 *
 * Production has three credential shapes in circulation:
 *   1. The current Edge-injected `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`,
 *      not a JWT). Exact string match is required.
 *   2. Optional Edge secrets `INTERNAL_CRON_KEY` / `GMAIL_CRON_KEY` — the
 *      same shared secret pg_cron stores in Vault (not a JWT).
 *   3. A legacy service_role JWT, accepted only after PostgREST verifies it.
 *
 * Hosted Vault `report_cron_service_role_key` is a 48-char shared secret
 * copied from `gmail_cron_key` (gmail-sync), not a JWT and not `sb_secret_…`.
 * Exact-match against the Edge service role therefore 401s every 09:30 IST
 * digest. After the JWT/env checks, we ask Postgres
 * `internal_cron_key_matches(candidate)` (SECURITY DEFINER, service_role
 * only) whether the header equals that Vault secret.
 */

export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!auth) return null;
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth.trim();
}

export function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function readEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name)?.trim() || undefined;
}

function extraCronSecrets(): string[] {
  return [
    readEnv("INTERNAL_CRON_KEY"),
    readEnv("GMAIL_CRON_KEY"),
  ].filter((s): s is string => Boolean(s) && s.length >= 16);
}

/** Exact match only — never treats an unsigned JWT as a service key. */
export function isServiceRoleCredential(
  credential: string | null | undefined,
  serviceRoleKey: string,
): boolean {
  if (!credential || !serviceRoleKey) return false;
  return credential === serviceRoleKey;
}

/**
 * Ask PostgREST to verify the JWT signature. Invalid/forged tokens 401.
 * A 2xx means the signature is real; we still require role=service_role so a
 * normal user JWT cannot invoke cron functions.
 */
export async function verifyServiceRoleJwt(
  token: string,
  supabaseUrl: string,
  apikey?: string,
): Promise<boolean> {
  const claims = parseJwtClaims(token);
  if (claims?.role !== "service_role") return false;
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return false;

  const base = supabaseUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/rest/v1/email_send_state?select=id&limit=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apikey || token,
        Accept: "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Compare the cron header to Vault `report_cron_service_role_key` /
 * `gmail_cron_key` via a service_role-only RPC. Uses the Edge-injected
 * service role to call PostgREST — the request credential is only the
 * candidate, never a grant of DB access by itself.
 */
export async function matchesVaultCronKey(
  candidate: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<boolean> {
  if (!candidate || candidate.length < 16 || !serviceRoleKey) return false;
  const base = supabaseUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/rest/v1/rpc/internal_cron_key_matches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ candidate }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data === true;
  } catch {
    return false;
  }
}

export async function isInternalServiceRequest(
  req: Request,
  serviceRoleKey: string,
  opts?: { supabaseUrl?: string; apikey?: string },
): Promise<boolean> {
  const candidates = [
    req.headers.get("x-internal-service-key"),
    bearerToken(req),
  ].filter((c): c is string => Boolean(c));

  const extras = extraCronSecrets();

  for (const c of candidates) {
    if (isServiceRoleCredential(c, serviceRoleKey)) return true;
    for (const extra of extras) {
      if (isServiceRoleCredential(c, extra)) return true;
    }
  }

  const supabaseUrl = opts?.supabaseUrl || readEnv("SUPABASE_URL");
  if (!supabaseUrl) return false;
  const apikey = opts?.apikey || readEnv("SUPABASE_ANON_KEY") || readEnv("SUPABASE_PUBLISHABLE_KEY");

  for (const c of candidates) {
    if (looksLikeJwt(c) && (await verifyServiceRoleJwt(c, supabaseUrl, apikey))) return true;
  }

  for (const c of candidates) {
    if (await matchesVaultCronKey(c, supabaseUrl, serviceRoleKey)) return true;
  }
  return false;
}
