// Deletes a team member's auth account + profile data.
// Authorization: caller must be admin/MD, OR a department manager of the target user's department.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { targetUserId } = await req.json();
    if (!targetUserId) return json({ error: "targetUserId required" }, 400);
    if (targetUserId === user.id) return json({ error: "Cannot delete yourself" }, 400);

    // Service-role client for admin actions
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorization check
    const { data: isAdminOrMd } = await admin.rpc("is_admin_or_md", { _user_id: user.id });
    let allowed = !!isAdminOrMd;
    if (!allowed) {
      // Dept manager check: target's dept must be one this user manages
      const { data: targetProfile } = await admin
        .from("profiles").select("department_id").eq("id", targetUserId).single();
      if (targetProfile?.department_id) {
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
