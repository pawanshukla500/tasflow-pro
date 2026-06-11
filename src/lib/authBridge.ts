import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";

export interface BridgeResult {
  userId: string;
  method: "edge_function";
}

/**
 * Links Firebase ID token → Supabase session via the firebase-auth edge function.
 *
 * Note: supabase.auth.signInWithIdToken does NOT support provider "firebase"
 * (only Google/Apple/Azure/Facebook/Kakao). Supabase's "Firebase third-party
 * auth" feature is a JWT passthrough for the Data API — it puts the Firebase
 * UID (not a UUID) in auth.uid(), which breaks this schema's RLS policies.
 * The edge function is therefore the single supported bridge: it verifies the
 * Firebase token server-side and mints a real Supabase session.
 *
 * Deploy once: npx supabase login, then run deploy.bat (or:
 * npx supabase functions deploy firebase-auth --project-ref nekdjoquirhecmejuoba)
 */
export async function bridgeFirebaseToSupabase(
  idToken: string,
  profile?: { email?: string | null; name?: string | null; firebaseUid?: string },
): Promise<BridgeResult> {
  // Reuse a still-valid Supabase session instead of re-bridging on every load
  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing?.user) {
    return { userId: existing.user.id, method: "edge_function" };
  }

  let res: Response;
  try {
    res = await fetch(`${env.supabaseUrl}/functions/v1/firebase-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
      },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    throw new Error(
      "Cannot reach Supabase backend (Failed to fetch). Deploy the auth bridge: npx supabase login, then npx supabase functions deploy firebase-auth --project-ref nekdjoquirhecmejuoba (and set FIREBASE_WEB_API_KEY secret).",
    );
  }

  let body: { error?: string; session?: { access_token: string; refresh_token: string }; userId?: string };
  try {
    body = await res.json();
  } catch {
    throw new Error(
      res.status === 404
        ? "The firebase-auth edge function is not deployed yet. Run: npx supabase login, then npx supabase functions deploy firebase-auth --project-ref nekdjoquirhecmejuoba"
        : `Auth bridge failed (HTTP ${res.status})`,
    );
  }

  if (!res.ok) {
    throw new Error(body.error || `Authentication bridge failed (HTTP ${res.status})`);
  }
  if (!body.session) throw new Error("No session returned from auth bridge");

  const { error: sessionErr } = await supabase.auth.setSession({
    access_token: body.session.access_token,
    refresh_token: body.session.refresh_token,
  });
  if (sessionErr) throw sessionErr;

  return { userId: body.userId as string, method: "edge_function" };
}

/**
 * Register an organization via the register-organization edge function.
 * Runs with the service role so it can atomically create the org, mark the
 * creator as org admin, and grant the system_admin role — RLS (correctly)
 * blocks a client from self-assigning roles, so this must be server-side.
 */
export async function registerOrganizationViaEdge(
  idToken: string,
  params: {
    orgName: string;
    domain?: string;
    domainType: "custom" | "public";
    allowPublicEmail?: boolean;
  },
): Promise<{ id: string; name: string; slug: string; domain: string | null }> {
  let res: Response;
  try {
    res = await fetch(`${env.supabaseUrl}/functions/v1/register-organization`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
      },
      body: JSON.stringify({
        idToken,
        orgName: params.orgName,
        domain: params.domain,
        domainType: params.domainType,
        allowPublicEmail: params.allowPublicEmail,
      }),
    });
  } catch {
    throw new Error(
      "Cannot reach Supabase backend. Deploy the register-organization edge function: npx supabase functions deploy register-organization --project-ref nekdjoquirhecmejuoba",
    );
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    throw new Error(body?.error || `Organization registration failed (HTTP ${res.status})`);
  }
  if (!body?.organization) throw new Error("No organization returned from registration");
  return body.organization;
}

