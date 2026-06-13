import {
  corsHeaders,
  decryptToken,
  encryptToken,
  json,
  refreshAccessToken,
  requireUser,
} from "../_shared/google-oauth.ts";

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  organizer?: { email?: string };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
};

function defaultRange() {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setDate(to.getDate() + 45);
  to.setHours(23, 59, 59, 999);
  return { timeMin: from.toISOString(), timeMax: to.toISOString() };
}

function eventRow(event: GoogleEvent, userId: string, organizationId: string | null) {
  const isAllDay = Boolean(event.start?.date);
  return {
    user_id: userId,
    organization_id: organizationId,
    google_calendar_id: "primary",
    google_event_id: event.id,
    title: event.summary || "Untitled event",
    description: event.description ?? null,
    location: event.location ?? null,
    html_link: event.htmlLink ?? null,
    hangout_link: event.hangoutLink ?? null,
    start_at: isAllDay ? null : event.start?.dateTime ?? null,
    end_at: isAllDay ? null : event.end?.dateTime ?? null,
    start_date: isAllDay ? event.start?.date ?? null : null,
    end_date: isAllDay ? event.end?.date ?? null : null,
    is_all_day: isAllDay,
    status: event.status || "confirmed",
    organizer_email: event.organizer?.email ?? null,
    attendees: event.attendees || [],
    raw_event: event,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { admin, user } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const fallback = defaultRange();
    const timeMin = typeof body?.timeMin === "string" ? body.timeMin : fallback.timeMin;
    const timeMax = typeof body?.timeMax === "string" ? body.timeMax : fallback.timeMax;

    const { data: connection, error: connectionErr } = await admin
      .from("user_google_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connectionErr) throw connectionErr;
    if (!connection) return json({ error: "Google Calendar is not connected" }, 400);

    let accessToken = await decryptToken(connection.access_token_ciphertext);
    const refreshToken = await decryptToken(connection.refresh_token_ciphertext);
    const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;

    if (!accessToken || expiresAt < Date.now() + 60_000) {
      if (!refreshToken) return json({ error: "Google connection expired. Please reconnect Google." }, 401);
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      await admin.from("user_google_connections").update({
        access_token_ciphertext: await encryptToken(refreshed.access_token),
        expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : null,
        scope: refreshed.scope ?? connection.scope,
      }).eq("user_id", user.id);
    }

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "true",
      maxResults: "250",
    });

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const googleBody = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(googleBody?.error?.message || "Failed to sync Google Calendar");

    const events = (googleBody.items || []) as GoogleEvent[];
    const cancelledIds = events.filter((event) => event.status === "cancelled").map((event) => event.id);
    if (cancelledIds.length) {
      await admin
        .from("google_calendar_events")
        .delete()
        .eq("user_id", user.id)
        .eq("google_calendar_id", "primary")
        .in("google_event_id", cancelledIds);
    }

    const activeRows = events
      .filter((event) => event.status !== "cancelled")
      .map((event) => eventRow(event, user.id, connection.organization_id ?? null));

    if (activeRows.length) {
      const { error: upsertErr } = await admin
        .from("google_calendar_events")
        .upsert(activeRows, { onConflict: "user_id,google_calendar_id,google_event_id" });
      if (upsertErr) throw upsertErr;
    }

    await admin
      .from("user_google_connections")
      .update({ last_calendar_sync_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return json({
      synced: activeRows.length,
      removed: cancelledIds.length,
      timeMin,
      timeMax,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync Google Calendar";
    const status = message.includes("auth") || message.includes("authenticated") ? 401 : 500;
    return json({ error: message }, status);
  }
});

