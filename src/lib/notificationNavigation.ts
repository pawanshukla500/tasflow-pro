/**
 * Converts notification action_url values (absolute or relative) into a path
 * suitable for React Router navigate().
 */
export function notificationActionToPath(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "/";

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    }
  } catch {
    // Fall through for non-URL strings.
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
