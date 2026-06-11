// Register a new organization + org admin (Firebase Auth required).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { idToken, orgName, domain, domainType, allowPublicEmail } = body || {};

    if (!idToken || !orgName) {
      return json({ error: "idToken and orgName are required" }, 400);
    }

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    if (!firebaseUser.email) return json({ error: "Email required" }, 400);

    const email = firebaseUser.email.toLowerCase();
    const emailDomain = email.split("@")[1];

    if (domainType === "custom" && domain) {
      const normalizedDomain = String(domain).toLowerCase().replace(/^@/, "");
      if (emailDomain !== normalizedDomain) {
        return json({
          error: `Admin email must use @${normalizedDomain} for custom domain organizations`,
        }, 400);
      }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
    let userId = existing?.id;

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: crypto.randomUUID() + "Aa1!",
        email_confirm: true,
        user_metadata: { name: firebaseUser.name, firebase_uid: firebaseUser.uid },
      });
      if (createErr || !created.user) return json({ error: createErr?.message || "User creation failed" }, 400);
      userId = created.user.id;
    }

    const { data: existingProfile } = await admin
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    if (existingProfile?.organization_id) {
      return json({ error: "You already belong to an organization" }, 400);
    }

    const slug = String(orgName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) + "-" + crypto.randomUUID().slice(0, 6);

    const { data: org, error: orgErr } = await admin.from("organizations").insert({
      name: orgName,
      slug,
      domain: domain ? String(domain).toLowerCase().replace(/^@/, "") : emailDomain,
      domain_type: domainType === "public" ? "public" : "custom",
      allow_public_email: !!allowPublicEmail,
      created_by: userId,
      settings: {
        branding: { name: orgName },
        email: { daily_digest_enabled: true, digest_hour_ist: 8 },
      },
    }).select("id, name, slug, domain").single();

    if (orgErr || !org) return json({ error: orgErr?.message || "Organization creation failed" }, 400);

    await admin.from("profiles").upsert({
      id: userId,
      email,
      name: firebaseUser.name || email.split("@")[0],
      firebase_uid: firebaseUser.uid,
      organization_id: org.id,
    }, { onConflict: "id" });

    await admin.from("organization_members").insert({
      organization_id: org.id,
      user_id: userId,
      is_org_admin: true,
    });

    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("user_roles").insert({ user_id: userId, role: "system_admin" });

    await admin.from("audit_logs").insert({
      organization_id: org.id,
      actor_id: userId,
      action: "organization.created",
      entity_type: "organization",
      entity_id: org.id,
      metadata: { name: orgName, domain: org.domain },
    });

    return json({ success: true, organization: org, userId });
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
