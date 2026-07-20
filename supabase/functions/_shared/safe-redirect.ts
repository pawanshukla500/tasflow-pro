/**
 * Normalize an OAuth post-login redirect to a same-origin path/URL.
 * Rejects open redirects (external hosts, protocol-relative, javascript:, etc.).
 */
export function normalizeAppRedirect(
  value: unknown,
  appUrl: string,
  fallbackPath = "/settings?tab=integrations",
): string {
  const base = (appUrl || "").replace(/\/$/, "");
  const fallback = `${base}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;

  if (typeof value !== "string" || !value.trim()) return fallback;

  const raw = value.trim();

  // Relative app path only (not protocol-relative //evil.com)
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return `${base}${raw}`;
  }

  try {
    const app = new URL(base || "https://invalid.local");
    const target = new URL(raw);
    if (target.protocol !== "https:" && target.protocol !== "http:") return fallback;
    if (target.origin !== app.origin) return fallback;
    return target.toString();
  } catch {
    return fallback;
  }
}
