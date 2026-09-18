// Admin/MD manual send of today's personal digest (email + Kapso WhatsApp).
// Same handler as the Mon–Sat 10:00 IST cron. Same-day idempotency keys
// prevent a double send if cron already ran.
import { createClient } from "npm:@supabase/supabase-js@2";
import { istToday } from "../_shared/ist.ts";

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

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

  const { data: isAdminOrMd } = await admin.rpc("is_admin_or_md", { _user_id: userData.user.id });
  if (!isAdminOrMd) return json({ error: "Forbidden — System Admin or Managing Director only" }, 403);

  const today = istToday();
  const digestUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-daily-digest`;
  let digestJson: Record<string, unknown> = {};
  let httpStatus = 0;
  try {
    const res = await fetch(digestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-service-key": serviceRoleKey,
      },
      body: "{}",
    });
    httpStatus = res.status;
    digestJson = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const err = typeof digestJson.error === "string" ? digestJson.error : `HTTP ${res.status}`;
      return json({ error: `Digest send failed: ${err}`, httpStatus }, 502);
    }
  } catch (e) {
    return json({
      error: `Digest send failed: ${e instanceof Error ? e.message : String(e)}`,
    }, 502);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profile?.organization_id) {
    await admin.from("audit_logs").insert({
      organization_id: profile.organization_id,
      actor_id: userData.user.id,
      action: "daily_digest.manual_send",
      entity_type: "digest",
      metadata: { date: today, httpStatus },
    });
  }

  return json({
    ok: true,
    date: today,
    triggeredBy: userData.user.id,
    ...digestJson,
  });
});
