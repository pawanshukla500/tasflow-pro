-- Restrict who can assign tasks to whom (HOD cannot assign to other leaders, etc.)

CREATE OR REPLACE FUNCTION public.user_has_leadership_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('managing_director', 'system_admin', 'department_manager', 'hr')
  );
$$;

CREATE OR REPLACE FUNCTION public.task_department(_task_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT department_id FROM public.tasks WHERE id = _task_id
$$;

CREATE OR REPLACE FUNCTION public.can_assign_task_to_user(_assigner_id UUID, _assignee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  assignee_dept UUID;
  assigner_org UUID;
  assignee_org UUID;
BEGIN
  IF _assigner_id IS NULL OR _assignee_id IS NULL THEN
    RETURN false;
  END IF;

  IF _assigner_id = _assignee_id THEN
    RETURN true;
  END IF;

  SELECT organization_id INTO assigner_org FROM public.profiles WHERE id = _assigner_id;
  SELECT department_id, organization_id INTO assignee_dept, assignee_org FROM public.profiles WHERE id = _assignee_id;

  IF assigner_org IS NOT NULL AND assignee_org IS NOT NULL AND assigner_org IS DISTINCT FROM assignee_org THEN
    RETURN false;
  END IF;

  IF public.is_admin_or_md(_assigner_id) OR public.is_hr(_assigner_id) THEN
    RETURN true;
  END IF;

  IF public.user_has_leadership_role(_assigner_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _assigner_id AND role = 'department_manager'
     )
  THEN
    IF public.user_has_leadership_role(_assignee_id) THEN
      RETURN false;
    END IF;
    IF assignee_dept IS NULL OR NOT public.manages_department(_assigner_id, assignee_dept) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Admins and managers can manage task assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "Users can manage task assignees" ON public.task_assignees;

CREATE POLICY "Authorized users manage task assignees"
  ON public.task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    public.can_assign_task_to_user(auth.uid(), user_id)
    AND (
      public.is_admin_or_md(auth.uid())
      OR public.is_hr(auth.uid())
      OR public.manages_department(auth.uid(), public.task_department(task_id))
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_assignees.task_id AND t.created_by = auth.uid()
      )
    )
  );

CREATE POLICY "Dept managers cleanup task assignees"
  ON public.task_assignees FOR DELETE TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = task_assignees.user_id
        AND p.department_id IS NOT NULL
        AND public.manages_department(auth.uid(), p.department_id)
    )
  );
