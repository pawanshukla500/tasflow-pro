/** How long a private quick note has left before it is removed. */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function noteTimeLeft(expiresAt: string, now = new Date()): { expired: boolean; label: string } {
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { expired: true, label: "Expired" };
  }
  const days = Math.ceil(remaining / DAY_MS);
  if (days > 1) return { expired: false, label: `${days} days left` };
  const hours = Math.ceil(remaining / HOUR_MS);
  if (hours > 1) return { expired: false, label: `${hours} hours left` };
  return { expired: false, label: "Less than an hour left" };
}
