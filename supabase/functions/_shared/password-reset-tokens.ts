import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const MIN_RESEND_GAP_MS = 60 * 1000;

function normalizeEmail(email: string): string {
  return email.replace(/[\u200B-\u200D\uFEFF\s]/g, "").trim().toLowerCase();
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createPasswordResetToken(
  admin: SupabaseClient,
  email: string,
  appUrl: string,
): Promise<{ resetUrl: string; tokenId: string }> {
  const normalized = normalizeEmail(email);

  const { data: existing } = await admin
    .from("password_reset_tokens")
    .select("last_email_sent_at")
    .eq("email", normalized)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.last_email_sent_at) {
    const elapsed = Date.now() - new Date(existing.last_email_sent_at).getTime();
    if (elapsed < MIN_RESEND_GAP_MS) {
      throw new Error(
        "A reset email was sent recently. Please check your inbox (and spam). You can request again in about a minute.",
      );
    }
  }

  await admin
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("email", normalized)
    .is("used_at", null);

  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const baseUrl = appUrl.replace(/\/$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

  const { data, error } = await admin
    .from("password_reset_tokens")
    .insert({
      email: normalized,
      token_hash: tokenHash,
      expires_at: expiresAt,
      last_email_sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create reset token: ${error.message}`);
  return { resetUrl, tokenId: data.id as string };
}

export async function markTokenEmailSent(admin: SupabaseClient, tokenId: string): Promise<void> {
  await admin
    .from("password_reset_tokens")
    .update({ last_email_sent_at: new Date().toISOString() })
    .eq("id", tokenId);
}

export async function verifyPasswordResetToken(
  admin: SupabaseClient,
  rawToken: string,
): Promise<{ valid: boolean; email?: string }> {
  const tokenHash = await hashToken(rawToken);
  const { data } = await admin
    .from("password_reset_tokens")
    .select("email")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data?.email) return { valid: false };
  return { valid: true, email: data.email };
}

export async function consumePasswordResetToken(
  admin: SupabaseClient,
  rawToken: string,
): Promise<{ email: string; tokenId: string } | null> {
  const tokenHash = await hashToken(rawToken);
  const { data } = await admin
    .from("password_reset_tokens")
    .select("id, email")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return null;
  return { email: data.email, tokenId: data.id };
}

export async function markTokenUsed(admin: SupabaseClient, tokenId: string): Promise<void> {
  await admin
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenId);
}
