// Admin/MD-only: look up whether an address is on the suppression list
// (bounce / complaint / unsubscribe) and, if so, remove it.
//
// Built because there was previously no way to fix a suppressed recipient
// short of a raw SQL DELETE in the Supabase dashboard — see
// docs/EMAIL-SYSTEM.md "Delivery pipeline actually sending" for the bug
// this uncovers (a suppressed recipient gets zero digest/report emails
// forever, silently, since send-transactional-email skips them before
// ever calling Resend).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Admin/MD only — this can restore email delivery to an address that
  // explicitly bounced, complained, or unsubscribed, so it's deliberately
  // more restrictive than the department-manager-inclusive gate other
  // admin functions use.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: "Not authenticated" }, 401);
  const caller = userData.user;

  const { data: isAdminOrMd } = await admin.rpc("is_admin_or_md", { _user_id: caller.id });
  if (!isAdminOrMd) return json({ error: "Forbidden — System Admin or Managing Director only" }, 403);

  let body: { email?: string; action?: "lookup" | "unsuppress" };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return json({ error: "A valid email is required" }, 400);
  const action = body.action === "unsuppress" ? "unsuppress" : "lookup";

  if (action === "unsuppress") {
    const { data: existing } = await admin
      .from("suppressed_emails")
      .select("id, reason")
      .eq("email", email)
      .maybeSingle();

    if (!existing) return json({ email, wasSuppressed: false, removed: false });

    const { error: deleteError } = await admin
      .from("suppressed_emails")
      .delete()
      .eq("email", email);
    if (deleteError) {
      console.error("Failed to remove suppression", { error: deleteError, email });
      return json({ error: "Failed to remove suppression" }, 500);
    }

    // Also clear the unsubscribe token's used_at so a future send can
    // issue/reuse a fresh one instead of hitting the "token already used"
    // safety fallback in send-transactional-email.
    await admin
      .from("email_unsubscribe_tokens")
      .delete()
      .eq("email", email);

    await admin.from("audit_logs").insert({
      actor_id: caller.id,
      action: "email_suppression.removed",
      entity_type: "suppressed_email",
      metadata: { email, previous_reason: existing.reason },
    });

    console.log("Suppression removed", { email, by: caller.id });
    return json({ email, wasSuppressed: true, removed: true, previousReason: existing.reason });
  }

  // action === "lookup"
  const { data: suppression } = await admin
    .from("suppressed_emails")
    .select("reason, metadata, created_at")
    .eq("email", email)
    .maybeSingle();

  const { data: recentSends } = await admin
    .from("email_send_log")
    .select("template_name, status, error_message, created_at")
    .eq("recipient_email", email)
    .order("created_at", { ascending: false })
    .limit(10);

  return json({
    email,
    suppressed: !!suppression,
    suppression: suppression || null,
    recentSends: recentSends || [],
  });
});
