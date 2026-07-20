// Branded password reset: app token + Firebase Admin password update + Resend HTML email.
import { createClient } from "npm:@supabase/supabase-js@2";
import { lookupFirebaseUserByEmail } from "../_shared/firebase-admin-auth.ts";
import { renderAndSendEmail } from "../_shared/render-and-send-email.ts";
import {
  createPasswordResetToken,
  markTokenEmailSent,
} from "../_shared/password-reset-tokens.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Uniform public response — avoids account enumeration via response shape. */
function publicOk() {
  return json({
    ok: true,
    message: "If that email is registered, a reset link was sent.",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const email = body?.email;
    if (!email || typeof email !== "string") {
      return json({ error: "email is required" }, 400);
    }

    const normalized = email.replace(/[\u200B-\u200D\uFEFF\s]/g, "").trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(normalized) || normalized.length > 254) {
      return json({ error: "Invalid email format" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    let firebaseUser: { uid: string; email: string } | null;
    try {
      firebaseUser = await lookupFirebaseUserByEmail(normalized);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("Service account") || msg.includes("client_email")) {
        return json({
          error: "Firebase service account not configured. Run: node scripts/upload-firebase-secret.mjs",
        }, 500);
      }
      throw e;
    }

    if (!firebaseUser) {
      return publicOk();
    }

    const appUrl = Deno.env.get("APP_URL") || "https://task.youthnic.shop";
    let resetUrl: string;
    let tokenId: string;

    try {
      const created = await createPasswordResetToken(admin, normalized, appUrl);
      resetUrl = created.resetUrl;
      tokenId = created.tokenId;
    } catch (e) {
      const msg = (e as Error).message || "";
      // Throttle: still return uniform success to avoid enumeration via 429.
      if (msg.includes("recently")) return publicOk();
      console.error("password-reset token error:", msg);
      return publicOk();
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("name")
      .eq("email", normalized)
      .maybeSingle();

    const mail = await renderAndSendEmail({
      templateName: "password-reset",
      recipientEmail: normalized,
      templateData: {
        recipientName: profile?.name || undefined,
        recipientEmail: normalized,
        resetUrl,
      },
    });

    if (!mail.sent) {
      console.error("password-reset email failed:", mail.error);
      return publicOk();
    }

    await markTokenEmailSent(admin, tokenId);

    return publicOk();
  } catch (e) {
    console.error("send-password-reset error:", (e as Error).message);
    return publicOk();
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
