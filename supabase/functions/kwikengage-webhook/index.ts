// Inbound KwikEngage WhatsApp webhook.
// Configure in KwikEngage Chats → Setup:
//   POST https://nekdjoquirhecmejuoba.supabase.co/functions/v1/kwikengage-webhook?token=<vault kwikengage_webhook_secret>
// A "Complete" / "Done" reply (or tf:complete:<taskId> button) marks the matching TaskFlow task done.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createInAppNotification } from "../_shared/in-app-notifications.ts";
import {
  isCompleteIntent,
  isKwikEngageAuthorized,
  loadKwikEngageConfig,
  parseInboundWhatsApp,
} from "../_shared/kwikengage.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, service: "kwikengage-webhook" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cfg = await loadKwikEngageConfig(supabaseUrl, serviceKey);
  if (!cfg) {
    return new Response(JSON.stringify({ error: "WhatsApp is not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!isKwikEngageAuthorized(req, cfg.apiKey, cfg.webhookSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: unknown = {};
  try { body = await req.json(); } catch { body = {}; }

  const inbound = parseInboundWhatsApp(body);
  if (!inbound.phone || !isCompleteIntent(inbound.text, inbound.buttonId)) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  let taskId = inbound.taskId;
  if (!taskId) {
    const { data: last } = await supabase
      .from("whatsapp_outbound")
      .select("task_id")
      .eq("phone", inbound.phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    taskId = last?.task_id || null;
  }
  if (!taskId) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no_task" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: outbound } = await supabase
    .from("whatsapp_outbound")
    .select("task_id, user_id")
    .eq("task_id", taskId)
    .eq("phone", inbound.phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!outbound) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no_outbound" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: "missing_task" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (task.status === "done") {
    return new Response(JSON.stringify({ ok: true, alreadyDone: true, taskId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) {
    console.warn("whatsapp complete failed", error.message);
    return new Response(JSON.stringify({ error: "update_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await createInAppNotification(supabase, {
    userId: outbound.user_id,
    type: "task_updated",
    title: "Task completed via WhatsApp",
    body: task.title,
    actionUrl: `/my-tasks?task=${taskId}`,
    metadata: { taskId, source: "whatsapp" },
  });

  return new Response(JSON.stringify({ ok: true, completed: true, taskId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
