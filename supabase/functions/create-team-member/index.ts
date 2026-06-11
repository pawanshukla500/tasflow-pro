// Creates a new team member without signing in the admin's browser.
// Authorization: caller must be admin/MD or department_manager.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { ensureFirebaseAuthUser } from "../_shared/firebase-admin-auth.ts";
import { renderAndSendEmail } from "../_shared/render-and-send-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !userData?.user) {
      console.error("Auth validation failed:", authErr?.message);
      return json({ error: "Not authenticated" }, 401);
    }
    const user = userData.user;

    const { data: isAdminOrMd } = await admin.rpc("is_admin_or_md", { _user_id: user.id });
    let allowed = !!isAdminOrMd;
    let managedDeptIds: string[] = [];
    if (!allowed) {
      const { data: deptMgr } = await admin
        .from("department_managers").select("department_id").eq("user_id", user.id);
      managedDeptIds = (deptMgr || []).map((d: { department_id: string }) => d.department_id);
      allowed = managedDeptIds.length > 0;
    }
    if (!allowed) return json({ error: "Not authorized to create members" }, 403);

    const { data: callerProfile } = await admin
      .from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const callerOrgId = callerProfile?.organization_id ?? null;

    const body = await req.json();
    let {
      name, email, password, mobile_no, position,
      department_id, role, managed_departments,
    } = body || {};

    if (!name || !email || !password) {
      return json({ error: "name, email, password required" }, 400);
    }

    email = String(email).replace(/[\u200B-\u200D\uFEFF\s]/g, "").toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return json({ error: `Invalid email format: "${email}"` }, 400);
    }

    const MANAGER_ROLES = ["employee", "department_manager"];
    const ADMIN_ROLES = ["employee", "department_manager", "hr", "managing_director", "system_admin"];
    let desiredRole = String(role || "employee");
    if (!ADMIN_ROLES.includes(desiredRole)) desiredRole = "employee";

    if (!isAdminOrMd) {
      if (!MANAGER_ROLES.includes(desiredRole)) {
        return json({ error: "Not authorized to assign this role" }, 403);
      }
      if (department_id && !managedDeptIds.includes(department_id)) {
        return json({ error: "Not authorized for this department" }, 403);
      }
      if (desiredRole === "department_manager" && Array.isArray(managed_departments)) {
        if (!managed_departments.every((dId: string) => managedDeptIds.includes(dId))) {
          return json({ error: "Can only assign departments you manage" }, 403);
        }
      }
    }

    // Firebase Auth user (required — login is Firebase-first)
    let firebaseCreated = false;
    try {
      const fb = await ensureFirebaseAuthUser(email, password, name);
      firebaseCreated = fb.created;
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("Service account") || msg.includes("client_email")) {
        return json({
          error: "Firebase service account not configured. Run: node scripts/upload-firebase-secret.mjs",
        }, 500);
      }
      return json({ error: `Firebase account setup failed: ${msg}` }, 400);
    }

    let newUserId: string | undefined;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr) {
      console.log("createUser failed, attempting recovery:", createErr.message);
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) return json({ error: `createUser failed: ${createErr.message}` }, 400);
      const existing = list?.users?.find(
        (u: { email?: string }) => (u.email || "").toLowerCase() === email,
      );
      if (!existing) return json({ error: createErr.message }, 400);
      newUserId = existing.id;
      const { error: updErr } = await admin.auth.admin.updateUserById(newUserId, {
        password, email_confirm: true, user_metadata: { name },
      });
      if (updErr) console.log("updateUserById warning:", updErr.message);
    } else {
      newUserId = created.user?.id;
    }

    if (!newUserId) return json({ error: "User creation failed" }, 500);

    await admin.from("profiles").upsert({
      id: newUserId,
      name,
      email,
      mobile_no: mobile_no || null,
      position: position || null,
      department_id: department_id || null,
      organization_id: callerOrgId,
    }, { onConflict: "id" });

    const { data: existingRoles } = await admin
      .from("user_roles").select("id").eq("user_id", newUserId).limit(1);
    if (existingRoles && existingRoles.length > 0) {
      await admin.from("user_roles").update({ role: desiredRole }).eq("user_id", newUserId);
    } else {
      await admin.from("user_roles").insert({ user_id: newUserId, role: desiredRole });
    }

    await admin.from("department_managers").delete().eq("user_id", newUserId);
    if (desiredRole === "department_manager" && Array.isArray(managed_departments) && managed_departments.length > 0) {
      await admin.from("department_managers").insert(
        managed_departments.map((dId: string) => ({ user_id: newUserId, department_id: dId })),
      );
    }

    const roleLabels: Record<string, string> = {
      managing_director: "Managing Director (MD)",
      system_admin: "System Admin",
      department_manager: "Team Leader (HOD)",
      employee: "Team Member",
      hr: "HR",
    };

    const mail = await renderAndSendEmail({
      templateName: "welcome-user",
      recipientEmail: email,
      templateData: {
        name,
        email,
        password,
        role: roleLabels[desiredRole] || desiredRole,
        loginUrl: (Deno.env.get("APP_URL") || "https://task.youthnic.shop").replace(/\/$/, ""),
      },
    });

    return json({
      success: true,
      userId: newUserId,
      firebaseCreated,
      emailSent: mail.sent,
      emailSubject: mail.subject,
      emailError: mail.error,
    });
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
