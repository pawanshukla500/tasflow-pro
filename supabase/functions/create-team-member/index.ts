// Creates a new team member without signing in the admin's browser.
// Authorization: caller must be admin/MD or department_manager.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createFirebaseAuthUser } from "../_shared/firebase-admin-auth.ts";
import { renderAndSendEmail } from "../_shared/render-and-send-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_PASSWORD_LEN = 8;
const MAX_NAME_LEN = 120;
const MAX_FIELD_LEN = 200;

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
    if (!callerOrgId) {
      return json({ error: "Caller is not associated with an organization" }, 403);
    }

    const body = await req.json();
    let {
      name, email, password, mobile_no, position,
      department_id, role, managed_departments,
    } = body || {};

    if (!name || !email || !password) {
      return json({ error: "name, email, password required" }, 400);
    }

    name = String(name).trim().slice(0, MAX_NAME_LEN);
    if (!name) return json({ error: "name is required" }, 400);

    email = String(email).replace(/[\u200B-\u200D\uFEFF\s]/g, "").toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email) || email.length > MAX_FIELD_LEN) {
      return json({ error: `Invalid email format: "${email}"` }, 400);
    }

    password = String(password);
    if (password.length < MIN_PASSWORD_LEN || password.length > 128) {
      return json({ error: `Password must be ${MIN_PASSWORD_LEN}–128 characters` }, 400);
    }

    if (mobile_no != null) mobile_no = String(mobile_no).trim().slice(0, 40) || null;
    if (position != null) position = String(position).trim().slice(0, MAX_FIELD_LEN) || null;

    if (department_id) {
      if (typeof department_id !== "string" || !UUID_RE.test(department_id)) {
        return json({ error: "Invalid department_id" }, 400);
      }
      const { data: dept } = await admin
        .from("departments")
        .select("id")
        .eq("id", department_id)
        .eq("organization_id", callerOrgId)
        .maybeSingle();
      if (!dept) return json({ error: "Invalid department for your organization" }, 400);
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

    if (Array.isArray(managed_departments)) {
      for (const dId of managed_departments) {
        if (typeof dId !== "string" || !UUID_RE.test(dId)) {
          return json({ error: "Invalid managed_departments entry" }, 400);
        }
        const { data: dept } = await admin
          .from("departments")
          .select("id")
          .eq("id", dId)
          .eq("organization_id", callerOrgId)
          .maybeSingle();
        if (!dept) return json({ error: "Invalid managed department for your organization" }, 400);
      }
    }

    // Firebase Auth user — create only; never overwrite an existing account's password
    let firebaseCreated = false;
    try {
      const fb = await createFirebaseAuthUser(email, password, name);
      firebaseCreated = fb.created;
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("EMAIL_EXISTS")) {
        return json({ error: "A user with this email already exists" }, 409);
      }
      if (msg.includes("Service account") || msg.includes("client_email")) {
        return json({
          error: "Firebase service account not configured. Run: node scripts/upload-firebase-secret.mjs",
        }, 500);
      }
      return json({ error: `Firebase account setup failed: ${msg}` }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr) {
      // Never recover by resetting an existing user's password (account takeover).
      if (
        createErr.message?.toLowerCase().includes("already") ||
        createErr.message?.toLowerCase().includes("registered") ||
        createErr.message?.toLowerCase().includes("exists")
      ) {
        return json({ error: "A user with this email already exists" }, 409);
      }
      return json({ error: createErr.message }, 400);
    }

    const newUserId = created.user?.id;
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
