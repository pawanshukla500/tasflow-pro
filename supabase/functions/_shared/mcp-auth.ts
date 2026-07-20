// Personal Access Token (PAT) auth for the MCP server.
//
// A PAT maps to exactly one TaskFlow user. To enforce that user's role/RLS we do
// NOT query with the service role for tool data — instead we mint a real,
// user-scoped Supabase session (same magic-link technique as firebase-auth) and
// run every tool query through it, so Postgres RLS does the enforcement.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/** Plaintext PATs start with this prefix so they are recognizable / greppable. */
export const PAT_PREFIX = "tfp_pat_";

export interface ValidatedPat {
  userId: string;
  email: string;
  organizationId: string | null;
  tokenId: string;
}

/** SHA-256 hex of the raw token (we only ever store / compare the hash). */
export async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a new random PAT and its hash. The raw value is shown to the user once. */
export async function generatePat(): Promise<{ raw: string; hash: string; prefix: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const raw = `${PAT_PREFIX}${secret}`;
  return { raw, hash: await hashToken(raw), prefix: raw.slice(0, 12) };
}

/** A service-role client — used ONLY for PAT lookup and session minting, never tool data. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Validate a raw PAT. Returns the owning user or throws (caller maps to 401).
 * Rejects revoked / expired tokens. Bumps last_used_at best-effort.
 */
export async function validatePat(admin: SupabaseClient, rawToken: string): Promise<ValidatedPat> {
  if (!rawToken || !rawToken.startsWith(PAT_PREFIX)) {
    throw new Error("Invalid access token");
  }
  const tokenHash = await hashToken(rawToken);

  const { data: row, error } = await admin
    .from("mcp_access_tokens")
    .select("id, user_id, organization_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !row) throw new Error("Invalid or revoked access token");
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("Access token expired");
  }

  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(row.user_id);
  if (userErr || !userRes?.user?.email) throw new Error("Token owner no longer exists");

  // Best-effort usage timestamp; never fail the request on this.
  admin.from("mcp_access_tokens").update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id).then(() => {}, () => {});

  return {
    userId: row.user_id,
    email: userRes.user.email,
    organizationId: row.organization_id,
    tokenId: row.id,
  };
}

interface CachedSession {
  client: SupabaseClient;
  expiresAt: number;
}

// Per-instance cache so we don't mint a session on every MCP call. Keyed by user id.
const sessionCache = new Map<string, CachedSession>();
const SESSION_TTL_MS = 10 * 60 * 1000; // refresh well before the JWT's own expiry

/**
 * Return a Supabase client whose auth.uid() == the PAT owner, so all queries run
 * under that user's RLS. Mints a session via the magic-link trick used in
 * firebase-auth/index.ts and caches it briefly.
 */
export async function getUserScopedClient(pat: ValidatedPat): Promise<SupabaseClient> {
  const cached = sessionCache.get(pat.userId);
  if (cached && cached.expiresAt > Date.now()) return cached.client;

  const admin = adminClient();
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: pat.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(linkErr?.message || "Failed to establish user session");
  }

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessionData, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (otpErr || !sessionData.session) {
    throw new Error(otpErr?.message || "Failed to verify user session");
  }

  sessionCache.set(pat.userId, { client: anon, expiresAt: Date.now() + SESSION_TTL_MS });
  return anon;
}
