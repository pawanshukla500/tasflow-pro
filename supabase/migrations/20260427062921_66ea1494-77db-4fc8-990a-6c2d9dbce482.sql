DROP POLICY IF EXISTS "Admins and managers can create tasks" ON public.tasks;

CREATE POLICY "Authenticated users can create tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  OR is_admin_or_md(auth.uid())
  OR (department_id IS NOT NULL AND manages_department(auth.uid(), department_id))
);