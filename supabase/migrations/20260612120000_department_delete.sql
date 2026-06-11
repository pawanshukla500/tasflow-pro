-- Allow admins to delete departments: unassign members/tasks first, then remove dept.

CREATE OR REPLACE FUNCTION public.delete_department(_dept_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dept_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO dept_org FROM public.departments WHERE id = _dept_id;
  IF dept_org IS NULL AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = _dept_id) THEN
    RAISE EXCEPTION 'Department not found';
  END IF;

  IF NOT (
    public.is_admin_or_md(auth.uid())
    OR (
      dept_org IS NOT NULL
      AND dept_org = public.user_organization_id(auth.uid())
      AND public.is_org_admin(auth.uid(), dept_org)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete this department';
  END IF;

  UPDATE public.profiles SET department_id = NULL WHERE department_id = _dept_id;
  UPDATE public.tasks SET department_id = NULL WHERE department_id = _dept_id;
  DELETE FROM public.department_managers WHERE department_id = _dept_id;
  DELETE FROM public.departments WHERE id = _dept_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_department(UUID) TO authenticated;

-- Future direct deletes also succeed when members/tasks reference the dept.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_department_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_department_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
