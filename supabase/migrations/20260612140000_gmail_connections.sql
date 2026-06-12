-- Per-user Gmail IMAP connections for email-to-task sync.

CREATE TABLE IF NOT EXISTS public.gmail_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  app_password_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  last_error TEXT,
  last_uid BIGINT NOT NULL DEFAULT 0,
  uidvalidity BIGINT,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own gmail connection" ON public.gmail_connections;
CREATE POLICY "Users read own gmail connection"
  ON public.gmail_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own gmail connection" ON public.gmail_connections;
CREATE POLICY "Users delete own gmail connection"
  ON public.gmail_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
