-- Comprehensive bug fixes: task status, assignee policies, co-assignee visibility, HR org scope.

-- 1. Unify review status: allow pending_review and migrate legacy in_review
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'in_review', 'pending_review', 'done', 'blocked'));

UPDATE public.tasks SET status = 'pending_review' WHERE status = 'in_review';

-- 2. Drop stale / conflicting task_assignees policies
DROP POLICY IF EXISTS "Authorized users manage task assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "Dept managers cleanup task assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "HR can manage task assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "Org members manage task assignees" ON public.task_assignees;

-- 3. Co-assignees can see all assignees on shared tasks
DROP POLICY IF EXISTS "View task assignees for accessible tasks" ON public.task_assignees;
CREATE POLICY "View task assignees for accessible tasks"
  ON public.task_assignees FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_md(auth.uid())
    OR public.is_hr(auth.uid())
    OR public.is_task_assignee(auth.uid(), task_id)
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id
        AND (
          t.created_by = auth.uid()
          OR public.manages_department(auth.uid(), t.department_id)
        )
    )
  );

-- 4. Task assignee management: org members who created the task or leadership
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
    AND public.can_assign_task_to_user(auth.uid(), task_assignees.user_id)
  );

-- 5. Scope HR read policies to the caller's organization
DROP POLICY IF EXISTS "HR can view all tasks" ON public.tasks;
CREATE POLICY "HR can view org tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (
    public.is_hr(auth.uid())
    AND (
      organization_id IS NULL
      OR organization_id = public.user_organization_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "HR can view all task attachments" ON public.task_attachments;
CREATE POLICY "HR can view org task attachments"
  ON public.task_attachments FOR SELECT TO authenticated
  USING (
    public.is_hr(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_attachments.task_id
        AND (
          t.organization_id IS NULL
          OR t.organization_id = public.user_organization_id(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "HR can view all workflows" ON public.workflows;
CREATE POLICY "HR can view org workflows"
  ON public.workflows FOR SELECT TO authenticated
  USING (
    public.is_hr(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = workflows.raised_by
        AND (
          p.organization_id IS NULL
          OR p.organization_id = public.user_organization_id(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "HR can view all workflow stages" ON public.workflow_stages;
CREATE POLICY "HR can view org workflow stages"
  ON public.workflow_stages FOR SELECT TO authenticated
  USING (
    public.is_hr(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workflows w
      JOIN public.profiles p ON p.id = w.raised_by
      WHERE w.id = workflow_stages.workflow_id
        AND (
          p.organization_id IS NULL
          OR p.organization_id = public.user_organization_id(auth.uid())
        )
    )
  );

-- 6. Performance indexes for common RLS paths
CREATE INDEX IF NOT EXISTS idx_tasks_organization ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON public.task_assignees(user_id);
