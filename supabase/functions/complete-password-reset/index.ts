// Verify or complete password reset using app-issued tokens (no Firebase sendOobCode).
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureFirebaseAuthUser } from "../_shared/firebase-admin-auth.ts";
import {
  consumePasswordResetToken,
  markTokenUsed,
  verifyPasswordResetToken,
} from "../_shared/password-reset-tokens.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const rawToken = typeof body.token === "string" ? body.token.trim() : "";
    const action = body.action === "complete" ? "complete" : "verify";
    const password = typeof body.password === "string" ? body.password : "";

    if (!rawToken) {
      return json({ error: "token is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    if (action === "verify") {
      const result = await verifyPasswordResetToken(admin, rawToken);
      if (!result.valid || !result.email) {
        return json({ valid: false, error: "Invalid or expired reset link" }, 400);
      }
      return json({ valid: true, email: result.email });
    }

    if (password.length < 6) {
      return json({ error: "Password must be at least 6 characters" }, 400);
    }

    const record = await consumePasswordResetToken(admin, rawToken);
    if (!record) {
      return json({ error: "Invalid or expired reset link" }, 400);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("name")
      .eq("email", record.email)
      .maybeSingle();

    try {
      await ensureFirebaseAuthUser(record.email, password, profile?.name || undefined);
    } catch (e) {
      const msg = (e as Error).message || "Failed to update password";
      if (msg.includes("Service account") || msg.includes("client_email")) {
        return json({
          error: "Firebase service account not configured. Contact your administrator.",
        }, 500);
      }
      return json({ error: msg }, 500);
    }

    await markTokenUsed(admin, record.tokenId);

    return json({ ok: true, message: "Password updated successfully." });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
