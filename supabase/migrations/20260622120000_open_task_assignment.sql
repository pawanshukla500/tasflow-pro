-- Any org member may create tasks and assign them to any active colleague.

DROP POLICY IF EXISTS "Authorized users create tasks in org" ON public.tasks;
CREATE POLICY "Org members create tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id = public.user_organization_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins and managers can manage assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "HR can manage task assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "Dept managers cleanup task assignees" ON public.task_assignees;

CREATE POLICY "Org members manage task assignees"
  ON public.task_assignees FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id
        AND (
          t.organization_id IS NULL
          OR t.organization_id = public.user_organization_id(auth.uid())
        )
        AND (
          public.is_admin_or_md(auth.uid())
          OR public.is_hr(auth.uid())
          OR t.created_by = auth.uid()
          OR public.manages_department(auth.uid(), t.department_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id
        AND (
          t.organization_id IS NULL
          OR t.organization_id = public.user_organization_id(auth.uid())
        )
        AND (
          public.is_admin_or_md(auth.uid())
          OR public.is_hr(auth.uid())
          OR t.created_by = auth.uid()
          OR public.manages_department(auth.uid(), t.department_id)
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = task_assignees.user_id
        AND p.active = true
        AND (
          p.organization_id IS NULL
          OR p.organization_id = public.user_organization_id(auth.uid())
        )
    )
  );
