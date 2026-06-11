-- Atomic conversation creation that bypasses the RLS-filtered SELECT-after-INSERT problem
CREATE OR REPLACE FUNCTION public.create_conversation_with_participants(
  _is_group boolean,
  _title text,
  _participant_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  uid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- For DMs, return existing 1:1 conversation if it already exists
  IF NOT _is_group AND array_length(_participant_ids, 1) = 1 THEN
    SELECT c.id INTO new_id
    FROM public.conversations c
    WHERE c.is_group = false
      AND EXISTS (SELECT 1 FROM public.conversation_participants p1 WHERE p1.conversation_id = c.id AND p1.user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.conversation_participants p2 WHERE p2.conversation_id = c.id AND p2.user_id = _participant_ids[1])
      AND (SELECT COUNT(*) FROM public.conversation_participants p WHERE p.conversation_id = c.id) = 2
    LIMIT 1;

    IF new_id IS NOT NULL THEN
      RETURN new_id;
    END IF;
  END IF;

  INSERT INTO public.conversations (is_group, title, created_by)
  VALUES (_is_group, _title, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (new_id, auth.uid());

  FOREACH uid IN ARRAY _participant_ids LOOP
    IF uid <> auth.uid() THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id)
      VALUES (new_id, uid)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN new_id;
END;
$$;