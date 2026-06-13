-- User-level Google Workspace integration.
-- Calendar access is per-user: each TaskFlow user connects their own Google
-- account, and synced events remain visible only to that same Supabase user.

CREATE TABLE IF NOT EXISTS public.user_google_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  google_sub TEXT,
  scope TEXT NOT NULL DEFAULT '',
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  expires_at TIMESTAMPTZ,
  calendar_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  gmail_tasks_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_calendar_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_google_connections_org
  ON public.user_google_connections (organization_id);

CREATE TABLE IF NOT EXISTS public.google_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  redirect_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_states_user
  ON public.google_oauth_states (user_id);

CREATE TABLE IF NOT EXISTS public.google_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_calendar_id TEXT NOT NULL DEFAULT 'primary',
  google_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  html_link TEXT,
  hangout_link TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  start_date DATE,
  end_date DATE,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'confirmed',
  organizer_email TEXT,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_event JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_calendar_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_events_user_start_at
  ON public.google_calendar_events (user_id, start_at);

CREATE INDEX IF NOT EXISTS idx_google_calendar_events_user_start_date
  ON public.google_calendar_events (user_id, start_date);

ALTER TABLE public.user_google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own google connection" ON public.user_google_connections;
CREATE POLICY "Users read own google connection"
  ON public.user_google_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own google connection" ON public.user_google_connections;
CREATE POLICY "Users delete own google connection"
  ON public.user_google_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Writes are performed by Edge Functions with the service role so token fields
-- are never accepted from browser clients.

DROP POLICY IF EXISTS "Users read own google calendar events" ON public.google_calendar_events;
CREATE POLICY "Users read own google calendar events"
  ON public.google_calendar_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own google calendar events" ON public.google_calendar_events;
CREATE POLICY "Users delete own google calendar events"
  ON public.google_calendar_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- OAuth states are intentionally service-role only: the browser receives only
-- the opaque state string inside the Google consent URL.

CREATE OR REPLACE FUNCTION public.touch_google_connection_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_google_connections_updated_at ON public.user_google_connections;
CREATE TRIGGER trg_google_connections_updated_at
  BEFORE UPDATE ON public.user_google_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_google_connection_updated_at();

