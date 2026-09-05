/**
 * Auth for cron / function-to-function calls.
 *
 * Production has two credential shapes in circulation:
 *   1. The current Edge-injected `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`,
 *      not a JWT). Exact string match is required.
 *   2. A legacy service_role JWT stored in Vault as `report_cron_service_role_key`
 *      / `gmail_cron_key`. pg_cron sends that value as `x-internal-service-key`
 *      and/or `Authorization: Bearer …`.
 *
 * A JWT is accepted only after PostgREST verifies its signature. Decoding
 * `role: service_role` from the payload is not enough — anyone can forge that.
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

export async function isInternalServiceRequest(
  req: Request,
  serviceRoleKey: string,
  opts?: { supabaseUrl?: string; apikey?: string },
): Promise<boolean> {
  const candidates = [
    req.headers.get("x-internal-service-key"),
    bearerToken(req),
  ].filter((c): c is string => Boolean(c));

  for (const c of candidates) {
    if (isServiceRoleCredential(c, serviceRoleKey)) return true;
  }

  const supabaseUrl = opts?.supabaseUrl || readEnv("SUPABASE_URL");
  if (!supabaseUrl) return false;
  const apikey = opts?.apikey || readEnv("SUPABASE_ANON_KEY") || readEnv("SUPABASE_PUBLISHABLE_KEY");

  for (const c of candidates) {
    if (looksLikeJwt(c) && (await verifyServiceRoleJwt(c, supabaseUrl, apikey))) return true;
  }
  return false;
}
