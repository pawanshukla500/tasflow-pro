-- Password reset link cache: reuse valid links instead of hitting Firebase rate limits on every resend.
-- In-app notifications: real-time activity feed per user.

CREATE TABLE IF NOT EXISTS public.password_reset_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reset_url TEXT NOT NULL,
  oob_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  last_email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_cache_email_active
  ON public.password_reset_cache (lower(email), expires_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE public.password_reset_cache ENABLE ROW LEVEL SECURITY;
-- No client policies — edge functions use service role only.

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user
  ON public.in_app_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_unread
  ON public.in_app_notifications (user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own in app notifications" ON public.in_app_notifications;
CREATE POLICY "Users read own in app notifications"
  ON public.in_app_notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own in app notifications" ON public.in_app_notifications;
CREATE POLICY "Users update own in app notifications"
  ON public.in_app_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Realtime for in-app notification bell
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
