import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";

export type GoogleConnection = Pick<
  Tables<"user_google_connections">,
  | "user_id"
  | "google_email"
  | "scope"
  | "calendar_sync_enabled"
  | "gmail_tasks_enabled"
  | "last_calendar_sync_at"
  | "created_at"
  | "updated_at"
>;

export type GoogleCalendarEvent = Tables<"google_calendar_events">;

export async function getGoogleConnection(): Promise<GoogleConnection | null> {
  const { data, error } = await supabase
    .from("user_google_connections")
    .select(
      "user_id, google_email, scope, calendar_sync_enabled, gmail_tasks_enabled, last_calendar_sync_at, created_at, updated_at",
    )
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function connectGoogle(redirectTo = `${window.location.origin}/settings?tab=integrations`) {
  const data = await invokeEdgeFunction<{ authUrl: string }>("google-oauth-start", {
    body: { redirectTo },
  });
  if (!data.authUrl) throw new Error("Google did not return a connection URL");
  window.location.href = data.authUrl;
}

export async function syncGoogleCalendar(range?: { timeMin: string; timeMax: string }) {
  return invokeEdgeFunction<{ synced: number; removed: number; timeMin: string; timeMax: string }>(
    "google-calendar-sync",
    { body: range ?? {} },
  );
}

export async function disconnectGoogle() {
  return invokeEdgeFunction<{ disconnected: boolean }>("google-disconnect", { body: {} });
}

export async function listGoogleCalendarEvents(): Promise<GoogleCalendarEvent[]> {
  const { data, error } = await supabase
    .from("google_calendar_events")
    .select(
      "id, user_id, organization_id, google_calendar_id, google_event_id, title, description, location, html_link, hangout_link, start_at, end_at, start_date, end_date, is_all_day, status, organizer_email, attendees, raw_event, synced_at, created_at, updated_at",
    )
    .order("start_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export function calendarRangeForMonth(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

