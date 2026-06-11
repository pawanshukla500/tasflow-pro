-- 1. Add default assignee to template stages
ALTER TABLE public.workflow_template_stages
  ADD COLUMN IF NOT EXISTS default_assignee_user_id uuid;

-- 2. Allow dept managers to delete profiles in their managed depts (admins already covered by existing policy)
DROP POLICY IF EXISTS "Dept managers delete team members" ON public.profiles;
CREATE POLICY "Dept managers delete team members"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR (department_id IS NOT NULL AND public.manages_department(auth.uid(), department_id))
  );

-- 3. Allow dept managers to delete user_roles for users they manage
DROP POLICY IF EXISTS "Dept managers delete team roles" ON public.user_roles;
CREATE POLICY "Dept managers delete team roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.department_id IS NOT NULL
        AND public.manages_department(auth.uid(), p.department_id)
    )
  );

-- 4. Allow dept managers to delete department_managers rows for their dept
DROP POLICY IF EXISTS "Dept managers delete dept manager rows" ON public.department_managers;
CREATE POLICY "Dept managers delete dept manager rows"
  ON public.department_managers FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR public.manages_department(auth.uid(), department_id)
  );

-- 5. Allow dept managers to delete task_assignees for users in their dept (cleanup)
DROP POLICY IF EXISTS "Dept managers cleanup task assignees" ON public.task_assignees;
CREATE POLICY "Dept managers cleanup task assignees"
  ON public.task_assignees FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = task_assignees.user_id
        AND p.department_id IS NOT NULL
        AND public.manages_department(auth.uid(), p.department_id)
    )
  );