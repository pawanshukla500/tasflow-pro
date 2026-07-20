import {
  corsHeaders,
  encryptToken,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  adminClient,
} from "../_shared/google-oauth.ts";
import { normalizeAppRedirect } from "../_shared/safe-redirect.ts";

function redirect(path: string) {
  return new Response(null, { status: 302, headers: { Location: path, ...corsHeaders } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const appUrl = Deno.env.get("APP_URL") || Deno.env.get("VITE_APP_URL") || "";
  const fallback = `${appUrl.replace(/\/$/, "")}/settings?tab=integrations`;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return redirect(`${fallback}&google=error&reason=${encodeURIComponent(oauthError)}`);
    if (!code || !state) return redirect(`${fallback}&google=error&reason=missing_code_or_state`);

    const admin = adminClient();
    const { data: stateRow, error: stateErr } = await admin
      .from("google_oauth_states")
      .select("state, user_id, organization_id, redirect_to, expires_at")
      .eq("state", state)
      .maybeSingle();

    if (stateErr || !stateRow) return redirect(`${fallback}&google=error&reason=invalid_state`);
    await admin.from("google_oauth_states").delete().eq("state", state);
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      return redirect(`${fallback}&google=error&reason=expired_state`);
    }

    const tokens = await exchangeCodeForTokens(code);
    const googleUser = await fetchGoogleUserInfo(tokens.access_token);
    if (!googleUser.email) throw new Error("Google account did not return an email address");

    const { data: existing } = await admin
      .from("user_google_connections")
      .select("refresh_token_ciphertext")
      .eq("user_id", stateRow.user_id)
      .maybeSingle();

    const refreshCiphertext = tokens.refresh_token
      ? await encryptToken(tokens.refresh_token)
      : existing?.refresh_token_ciphertext ?? null;

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error: upsertErr } = await admin.from("user_google_connections").upsert({
      user_id: stateRow.user_id,
      organization_id: stateRow.organization_id,
      google_email: googleUser.email.toLowerCase(),
      google_sub: googleUser.sub ?? null,
      scope: tokens.scope ?? "",
      access_token_ciphertext: await encryptToken(tokens.access_token),
      refresh_token_ciphertext: refreshCiphertext,
      expires_at: expiresAt,
      calendar_sync_enabled: true,
    }, { onConflict: "user_id" });
    if (upsertErr) throw upsertErr;

    const target = normalizeAppRedirect(stateRow.redirect_to, appUrl);
    const separator = target.includes("?") ? "&" : "?";
    return redirect(`${target}${separator}google=connected`);
  } catch (err) {
    const reason = encodeURIComponent(err instanceof Error ? err.message : "google_connection_failed");
    return redirect(`${fallback}&google=error&reason=${reason}`);
  }
});
