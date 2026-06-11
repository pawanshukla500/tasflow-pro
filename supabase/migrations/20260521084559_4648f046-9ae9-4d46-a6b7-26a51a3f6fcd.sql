
-- 1. Restrict user_roles DELETE so dept managers can only delete 'employee' role rows (no admin/MD stripping)
DROP POLICY IF EXISTS "Dept managers delete team roles" ON public.user_roles;
CREATE POLICY "Dept managers delete team roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  is_admin_or_md(auth.uid())
  OR (
    role = 'employee'::app_role
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.department_id IS NOT NULL
        AND manages_department(auth.uid(), p.department_id)
    )
  )
);

-- 2. Restrict profile self-update: users cannot change department_id, active, or performance_score
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND department_id IS NOT DISTINCT FROM (SELECT department_id FROM public.profiles WHERE id = auth.uid())
  AND active IS NOT DISTINCT FROM (SELECT active FROM public.profiles WHERE id = auth.uid())
  AND performance_score IS NOT DISTINCT FROM (SELECT performance_score FROM public.profiles WHERE id = auth.uid())
);

-- 3. Realtime: change ELSE true to ELSE false so only conversation topics are subscribable
DROP POLICY IF EXISTS "Conversation participants can subscribe" ON realtime.messages;
CREATE POLICY "Conversation participants can subscribe"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'conversation:%' THEN
      public.is_conversation_participant(
        auth.uid(),
        substring(realtime.topic() FROM 14)::uuid
      )
    ELSE false
  END
);

-- 4. Set search_path on remaining functions
ALTER FUNCTION public.generate_workflow_indent_id() SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
