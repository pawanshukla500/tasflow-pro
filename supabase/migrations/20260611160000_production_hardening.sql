-- Production hardening: org-scoped RLS, task organization_id, realtime, report cron.

-- ── 1. Stamp organization_id on new tasks from creator profile ─────────────
CREATE OR REPLACE FUNCTION public.set_task_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.profiles
    WHERE id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_task_organization_id ON public.tasks;
CREATE TRIGGER trg_set_task_organization_id
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_task_organization_id();

UPDATE public.tasks t
SET organization_id = p.organization_id
FROM public.profiles p
WHERE t.created_by = p.id
  AND t.organization_id IS NULL
  AND p.organization_id IS NOT NULL;

-- ── 2. Profiles: org-scoped read ────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "View profiles in organization"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_md(auth.uid())
    OR public.is_hr(auth.uid())
    OR organization_id IS NULL
    OR organization_id = public.user_organization_id(auth.uid())
  );

-- ── 3. User roles: org-scoped read ──────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles;
CREATE POLICY "View roles in organization"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_md(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND (
          p.organization_id IS NULL
          OR p.organization_id = public.user_organization_id(auth.uid())
        )
    )
  );

-- ── 4. Task assignees: scoped read ────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view task assignees" ON public.task_assignees;
CREATE POLICY "View task assignees for accessible tasks"
  ON public.task_assignees FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_md(auth.uid())
    OR public.is_hr(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id
        AND (
          t.created_by = auth.uid()
          OR public.manages_department(auth.uid(), t.department_id)
        )
    )
  );

-- ── 5. Task INSERT: managers/admins/HR only, same org ───────────────────────
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;
CREATE POLICY "Authorized users create tasks in org"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id = public.user_organization_id(auth.uid())
    )
    AND (
      public.is_admin_or_md(auth.uid())
      OR public.is_hr(auth.uid())
      OR (
        department_id IS NOT NULL
        AND public.manages_department(auth.uid(), department_id)
      )
    )
  );

-- ── 6. Realtime for live task updates ───────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignees;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
