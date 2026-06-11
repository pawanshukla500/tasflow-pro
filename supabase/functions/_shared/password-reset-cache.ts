import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const LINK_TTL_MS = 55 * 60 * 1000; // Firebase OOB codes ~1 hour; reuse before expiry
const MIN_RESEND_GAP_MS = 60 * 1000; // Resend same cached link at most once per minute

function normalizeEmail(email: string): string {
  return email.replace(/[\u200B-\u200D\uFEFF\s]/g, "").trim().toLowerCase();
}

export async function getCachedPasswordResetLink(
  admin: SupabaseClient,
  email: string,
): Promise<{ resetUrl: string; id: string } | null> {
  const normalized = normalizeEmail(email);
  const { data } = await admin
    .from("password_reset_cache")
    .select("id, reset_url")
    .eq("email", normalized)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.reset_url) return null;
  return { resetUrl: data.reset_url, id: data.id };
}

export async function storePasswordResetLink(
  admin: SupabaseClient,
  email: string,
  resetUrl: string,
): Promise<string> {
  const normalized = normalizeEmail(email);
  const parsed = new URL(resetUrl);
  const oobCode = parsed.searchParams.get("oobCode") || "";
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();

  const { data, error } = await admin
    .from("password_reset_cache")
    .insert({
      email: normalized,
      reset_url: resetUrl,
      oob_code: oobCode,
      expires_at: expiresAt,
      last_email_sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to cache reset link: ${error.message}`);
  return data.id as string;
}

export async function markResetEmailSent(admin: SupabaseClient, cacheId: string): Promise<void> {
  await admin
    .from("password_reset_cache")
    .update({ last_email_sent_at: new Date().toISOString() })
    .eq("id", cacheId);
}

export async function canResendCachedEmail(
  admin: SupabaseClient,
  cacheId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("password_reset_cache")
    .select("last_email_sent_at")
    .eq("id", cacheId)
    .maybeSingle();

  if (!data?.last_email_sent_at) return true;
  const elapsed = Date.now() - new Date(data.last_email_sent_at).getTime();
  return elapsed >= MIN_RESEND_GAP_MS;
}

/** Resolve reset URL: reuse cache → else Firebase → on rate limit fall back to cache. */
export async function resolvePasswordResetLink(
  admin: SupabaseClient,
  email: string,
  generateLink: () => Promise<string>,
): Promise<{ resetUrl: string; cacheId: string | null; fromCache: boolean }> {
  const cached = await getCachedPasswordResetLink(admin, email);
  if (cached) {
    const canResend = await canResendCachedEmail(admin, cached.id);
    if (!canResend) {
      throw new Error(
        "A reset email was sent recently. Please check your inbox (and spam). You can request again in about a minute.",
      );
    }
    return { resetUrl: cached.resetUrl, cacheId: cached.id, fromCache: true };
  }

  try {
    const resetUrl = await generateLink();
    const cacheId = await storePasswordResetLink(admin, email, resetUrl);
    return { resetUrl, cacheId, fromCache: false };
  } catch (e) {
    const msg = (e as Error).message || "";
    const rateLimited =
      msg.includes("RESET_PASSWORD_EXCEED_LIMIT") ||
      msg.includes("TOO_MANY_ATTEMPTS") ||
      msg.includes("too-many-requests");

    if (rateLimited) {
      const fallback = await getCachedPasswordResetLink(admin, email);
      if (fallback) {
        return { resetUrl: fallback.resetUrl, cacheId: fallback.id, fromCache: true };
      }
      throw new Error(
        "Password reset is temporarily limited. Please wait about an hour, or contact your admin to set a new password from Team.",
      );
    }
    throw e;
  }
}
