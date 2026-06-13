import { corsHeaders, decryptToken, json, requireUser } from "../_shared/google-oauth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { admin, user } = await requireUser(req);
    const { data: connection } = await admin
      .from("user_google_connections")
      .select("access_token_ciphertext, refresh_token_ciphertext")
      .eq("user_id", user.id)
      .maybeSingle();

    const accessToken = await decryptToken(connection?.access_token_ciphertext);
    const refreshToken = await decryptToken(connection?.refresh_token_ciphertext);
    const tokenToRevoke = refreshToken || accessToken;
    if (tokenToRevoke) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokenToRevoke }),
      }).catch(() => undefined);
    }

    await admin.from("google_calendar_events").delete().eq("user_id", user.id);
    await admin.from("user_google_connections").delete().eq("user_id", user.id);

    return json({ disconnected: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to disconnect Google";
    const status = message.includes("auth") || message.includes("authenticated") ? 401 : 500;
    return json({ error: message }, status);
  }
});

