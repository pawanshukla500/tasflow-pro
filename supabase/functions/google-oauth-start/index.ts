import { calendarScopes, corsHeaders, json, requireUser, requiredEnv } from "../_shared/google-oauth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { admin, user } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const redirectTo = typeof body?.redirectTo === "string" ? body.redirectTo : null;

    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    const stateBytes = crypto.getRandomValues(new Uint8Array(24));
    const state = btoa(String.fromCharCode(...stateBytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const { error } = await admin.from("google_oauth_states").insert({
      state,
      user_id: user.id,
      organization_id: profile?.organization_id ?? null,
      redirect_to: redirectTo,
    });
    if (error) throw error;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", requiredEnv("GOOGLE_OAUTH_CLIENT_ID"));
    authUrl.searchParams.set("redirect_uri", requiredEnv("GOOGLE_OAUTH_REDIRECT_URI"));
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", calendarScopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    return json({ authUrl: authUrl.toString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start Google connection";
    const status = message.includes("auth") || message.includes("authenticated") ? 401 : 500;
    return json({ error: message }, status);
  }
});

