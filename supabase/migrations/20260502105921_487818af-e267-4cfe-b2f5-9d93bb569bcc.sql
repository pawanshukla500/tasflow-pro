-- Allow group creator to add new participants
DROP POLICY IF EXISTS "Creator can add participants to own group" ON public.conversation_participants;
CREATE POLICY "Creator can add participants to own group"
ON public.conversation_participants FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND c.created_by = auth.uid()
      AND c.is_group = true
  )
);

-- Allow group creator to remove participants from own group
DROP POLICY IF EXISTS "Creator can remove participants from own group" ON public.conversation_participants;
CREATE POLICY "Creator can remove participants from own group"
ON public.conversation_participants FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND c.created_by = auth.uid()
      AND c.is_group = true
  )
);

-- Replace UPDATE policy on conversations: only creator can edit (e.g. rename group)
DROP POLICY IF EXISTS "Update own conversations" ON public.conversations;
CREATE POLICY "Creator can update own conversation"
ON public.conversations FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());