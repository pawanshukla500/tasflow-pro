
-- Notification log for tracking sent emails
CREATE TABLE public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID,
  notification_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB,
  gmail_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_log_recipient ON public.notification_log(recipient_user_id, created_at DESC);
CREATE INDEX idx_notification_log_type ON public.notification_log(notification_type, created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications, admins see all"
  ON public.notification_log FOR SELECT
  USING (auth.uid() = recipient_user_id OR public.is_admin_or_md(auth.uid()));

-- Notification preferences per user
CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  task_assigned BOOLEAN NOT NULL DEFAULT true,
  task_due_reminder BOOLEAN NOT NULL DEFAULT true,
  monthly_report BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_notification_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create preferences on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_prefs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_prefs();

-- Backfill existing users
INSERT INTO public.notification_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
