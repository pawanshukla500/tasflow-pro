// Deletes a team member's auth account + profile data.
// Authorization: caller must be admin/MD, OR a department manager of the target user's department.
// Target must belong to the same organization (IDOR prevention).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    // Verify caller
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
    if (!targetUserId || !UUID_RE.test(targetUserId)) {
      return json({ error: "targetUserId must be a valid UUID" }, 400);
    }
    if (targetUserId === user.id) return json({ error: "Cannot delete yourself" }, 400);

    // Service-role client for admin actions
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const [{ data: callerProfile }, { data: targetProfile }] = await Promise.all([
      admin.from("profiles").select("organization_id").eq("id", user.id).maybeSingle(),
      admin.from("profiles").select("organization_id, department_id").eq("id", targetUserId).maybeSingle(),
    ]);

    if (!targetProfile) return json({ error: "User not found" }, 404);
    if (
      !callerProfile?.organization_id ||
      !targetProfile.organization_id ||
      callerProfile.organization_id !== targetProfile.organization_id
    ) {
      return json({ error: "Not authorized to delete this member" }, 403);
    }

    // Authorization check
    const { data: isAdminOrMd } = await admin.rpc("is_admin_or_md", { _user_id: user.id });
    let allowed = !!isAdminOrMd;
    if (!allowed) {
      if (targetProfile.department_id) {
        const { data: managesIt } = await admin.rpc("manages_department", {
          _user_id: user.id, _dept_id: targetProfile.department_id,
        });
        allowed = !!managesIt;
      }
    }
    if (!allowed) return json({ error: "Not authorized to delete this member" }, 403);

    const { data: targetRoles } = await admin
      .from("user_roles").select("role").eq("user_id", targetUserId);
    const privilegedRoles = ["system_admin", "managing_director", "hr"];
    if (!isAdminOrMd && (targetRoles || []).some((r) => privilegedRoles.includes(r.role))) {
      return json({ error: "Not authorized to delete this member" }, 403);
    }

    // Cleanup related rows (profile cascades aren't set up everywhere)
    await admin.from("department_managers").delete().eq("user_id", targetUserId);
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    await admin.from("task_assignees").delete().eq("user_id", targetUserId);
    await admin.from("notification_preferences").delete().eq("user_id", targetUserId);
    await admin.from("profiles").delete().eq("id", targetUserId);

    // Delete auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ success: true });
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
