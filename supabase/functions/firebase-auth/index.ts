// Bridges Firebase Authentication → Supabase session for Postgres RLS (auth.uid()).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { idToken } = await req.json();
    if (!idToken || typeof idToken !== "string") {
      return json({ error: "idToken required" }, 400);
    }

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    if (!firebaseUser.email) return json({ error: "Firebase account must have an email" }, 400);
    if (!firebaseUser.emailVerified) {
      return json({ error: "Verified Firebase email required" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const email = firebaseUser.email.toLowerCase();
    let supabaseUserId: string | undefined;

    // Prefer binding by firebase_uid so email collisions cannot hijack accounts.
    const { data: byFirebaseUid } = await admin
      .from("profiles")
      .select("id, email, firebase_uid")
      .eq("firebase_uid", firebaseUser.uid)
      .maybeSingle();

    if (byFirebaseUid?.id) {
      supabaseUserId = byFirebaseUid.id;
    } else {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find((u) => (u.email || "").toLowerCase() === email);

      if (existing) {
        const { data: profile } = await admin
          .from("profiles")
          .select("firebase_uid")
          .eq("id", existing.id)
          .maybeSingle();

        if (profile?.firebase_uid && profile.firebase_uid !== firebaseUser.uid) {
          return json({
            error: "This email is already linked to a different Firebase account",
          }, 403);
        }

        supabaseUserId = existing.id;
        await admin.auth.admin.updateUserById(supabaseUserId, {
          user_metadata: {
            name: firebaseUser.name || existing.user_metadata?.name,
            firebase_uid: firebaseUser.uid,
          },
        });
      } else {
        const tempPassword = crypto.randomUUID() + crypto.randomUUID();
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            name: firebaseUser.name || email.split("@")[0],
            firebase_uid: firebaseUser.uid,
          },
        });
        if (createErr || !created.user) {
          return json({ error: createErr?.message || "Failed to create Supabase user" }, 400);
        }
        supabaseUserId = created.user.id;
      }
    }

    await admin.from("profiles").upsert({
      id: supabaseUserId,
      email,
      name: firebaseUser.name || email.split("@")[0],
      firebase_uid: firebaseUser.uid,
    }, { onConflict: "id" });

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: linkErr?.message || "Failed to generate session" }, 500);
    }

    const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: sessionData, error: sessionErr } = await anon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (sessionErr || !sessionData.session) {
      return json({ error: sessionErr?.message || "Failed to establish session" }, 500);
    }

    return json({
      session: sessionData.session,
      userId: supabaseUserId,
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
