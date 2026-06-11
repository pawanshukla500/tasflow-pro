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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return json({ error: "email is required" }, 400);
    }

    const normalized = email.replace(/[\u200B-\u200D\uFEFF\s]/g, "").trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(normalized)) {
      return json({ error: "Invalid email format" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
      const { data: userData } = await admin.auth.getUser(token);
      if (userData?.user) {
        const uid = userData.user.id;
        const [{ data: isAdmin }, { data: mgrRows }] = await Promise.all([
          admin.rpc("is_admin_or_md", { _user_id: uid }),
          admin.from("department_managers").select("id").eq("user_id", uid).limit(1),
        ]);
        const isManager = Array.isArray(mgrRows) && mgrRows.length > 0;
        const isSelf = userData.user.email?.toLowerCase() === normalized;
        if (!isAdmin && !isManager && !isSelf) {
          return json({ error: "Not authorized to reset password for this user" }, 403);
        }
      }
    }

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
      return json({ ok: true, message: "If that email is registered, a reset link was sent." });
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
      return json({ error: msg }, msg.includes("recently") ? 429 : 500);
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
      return json({ error: mail.error || "Failed to send reset email via Resend" }, 500);
    }

    await markTokenEmailSent(admin, tokenId);

    return json({
      ok: true,
      emailSent: true,
      message: "Password reset email sent.",
      branded: true,
      subject: mail.subject,
      messageId: mail.messageId,
      version: "v7-token-resend",
    });
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
