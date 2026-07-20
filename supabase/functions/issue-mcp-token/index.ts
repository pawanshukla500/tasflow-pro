// Issues a Personal Access Token for the MCP server.
// Authorization: caller must be a signed-in user (Supabase access token). The
// token is generated and hashed server-side; the raw value is returned ONCE.
import { createClient } from "npm:@supabase/supabase-js@2";
import { generatePat } from "../_shared/mcp-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_EXPIRY_DAYS = 1;
const MAX_EXPIRY_DAYS = 90;
const MAX_NAME_LEN = 80;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "AI client").trim().slice(0, MAX_NAME_LEN) || "AI client";
    const expiresInDays = Number(body?.expiresInDays);
    if (!Number.isInteger(expiresInDays) || expiresInDays < MIN_EXPIRY_DAYS || expiresInDays > MAX_EXPIRY_DAYS) {
      return json({
        error: `expiresInDays must be an integer between ${MIN_EXPIRY_DAYS} and ${MAX_EXPIRY_DAYS}`,
      }, 400);
    }
    const expiresAt = new Date(Date.now() + expiresInDays * 86400_000).toISOString();

    const { data: profile } = await admin
      .from("profiles").select("organization_id").eq("id", user.id).maybeSingle();

    const { raw, hash, prefix } = await generatePat();

    const { data: inserted, error: insErr } = await admin
      .from("mcp_access_tokens")
      .insert({
        user_id: user.id,
        organization_id: profile?.organization_id ?? null,
        name,
        token_hash: hash,
        token_prefix: prefix,
        expires_at: expiresAt,
      })
      .select("id, name, token_prefix, expires_at, created_at")
      .single();

    if (insErr || !inserted) return json({ error: insErr?.message || "Failed to create token" }, 500);

    // Raw token is returned exactly once — never stored or logged.
    return json({ token: raw, record: inserted });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
