import { remapRetiredInboxPath } from "@/lib/projects";

/**
 * Converts notification action_url values (absolute or relative) into a path
 * suitable for React Router navigate().
 */
export function notificationActionToPath(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "/";

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return remapRetiredInboxPath(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const path = `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
      return remapRetiredInboxPath(path);
    }
  } catch {
    // Fall through for non-URL strings.
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return remapRetiredInboxPath(normalized);
}
