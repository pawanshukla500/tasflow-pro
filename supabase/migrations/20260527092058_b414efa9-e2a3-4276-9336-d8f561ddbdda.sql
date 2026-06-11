DROP POLICY IF EXISTS "Authenticated can read realtime broadcasts" ON realtime.messages;
CREATE POLICY "Authenticated can read realtime broadcasts" ON realtime.messages
FOR SELECT TO authenticated
USING (
  CASE
    WHEN topic LIKE 'conversation:%' THEN public.is_conversation_participant(auth.uid(), NULLIF(split_part(topic, ':', 2), '')::uuid)
    ELSE false
  END
);