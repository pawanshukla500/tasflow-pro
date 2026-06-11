
-- Allow conversation creator to delete the conversation
CREATE POLICY "Creator can delete conversation"
ON public.conversations
FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- Cascade helper: deleting a conversation should clear messages + participants.
-- Frontend already deletes children first, but add a SECURITY DEFINER fn for atomic delete.
CREATE OR REPLACE FUNCTION public.delete_conversation_cascade(_conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = _conv_id AND created_by = auth.uid()
  ) AND NOT public.is_admin_or_md(auth.uid()) THEN
    RAISE EXCEPTION 'Only the creator or admin can delete this chat';
  END IF;
  DELETE FROM public.chat_messages WHERE conversation_id = _conv_id;
  DELETE FROM public.conversation_participants WHERE conversation_id = _conv_id;
  DELETE FROM public.conversations WHERE id = _conv_id;
END;
$$;

-- Admins can also delete any conversation
CREATE POLICY "Admins can delete any conversation"
ON public.conversations
FOR DELETE
TO authenticated
USING (public.is_admin_or_md(auth.uid()));
