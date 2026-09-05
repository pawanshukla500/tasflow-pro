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
 * Digest crons were 401ing because they compared (2) to (1) with `!==` and
 * ignored the JWT `role` claim. Password-reset mail (which calls Resend in
 * process) kept working, which is why "Resend is fine but daily/task mail
 * never arrives" was a real production failure mode.
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

export function isServiceRoleCredential(
  credential: string | null | undefined,
  serviceRoleKey: string,
): boolean {
  if (!credential || !serviceRoleKey) return false;
  if (credential === serviceRoleKey) return true;
  const claims = parseJwtClaims(credential);
  return claims?.role === "service_role";
}

export function isInternalServiceRequest(req: Request, serviceRoleKey: string): boolean {
  return (
    isServiceRoleCredential(req.headers.get("x-internal-service-key"), serviceRoleKey) ||
    isServiceRoleCredential(bearerToken(req), serviceRoleKey)
  );
}
