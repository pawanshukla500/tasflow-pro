-- Notification preferences + daily digest support

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  task_assigned BOOLEAN NOT NULL DEFAULT true,
  task_due_reminder BOOLEAN NOT NULL DEFAULT true,
  monthly_report BOOLEAN NOT NULL DEFAULT true,
  daily_digest BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own preferences"
    ON public.notification_preferences FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_log (
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

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see own notifications, admins see all"
    ON public.notification_log FOR SELECT
    USING (auth.uid() = recipient_user_id OR public.is_admin_or_md(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user_prefs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_prefs();

-- Backfill column if table existed without daily_digest
DO $$ BEGIN
  ALTER TABLE public.notification_preferences ADD COLUMN daily_digest BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
