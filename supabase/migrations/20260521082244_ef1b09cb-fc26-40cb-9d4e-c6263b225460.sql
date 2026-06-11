
-- 1. Scope notification_log and notification_preferences to authenticated role only
DROP POLICY IF EXISTS "Users see own notifications, admins see all" ON public.notification_log;
CREATE POLICY "Users see own notifications, admins see all"
  ON public.notification_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_user_id OR public.is_admin_or_md(auth.uid()));

DROP POLICY IF EXISTS "Users manage own preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own preferences"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Realtime channel authorization: restrict broadcasts to conversation participants
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read realtime broadcasts" ON realtime.messages;
CREATE POLICY "Authenticated can read realtime broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    -- Allow postgres_changes for tables (topic begins with "realtime:")
    -- and block direct broadcast/presence subscriptions for arbitrary topics.
    -- For conversation-scoped topics (e.g., "conversation:<uuid>"), require participation.
    CASE
      WHEN topic LIKE 'conversation:%' THEN
        public.is_conversation_participant(
          auth.uid(),
          NULLIF(split_part(topic, ':', 2), '')::uuid
        )
      ELSE TRUE
    END
  );
