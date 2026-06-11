
-- Helper: is user assigned to a task (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_task_assignee(_user_id uuid, _task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = _task_id AND user_id = _user_id
  )
$$;

-- Helper: get task's department (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.task_department(_task_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id FROM public.tasks WHERE id = _task_id
$$;

-- Drop broken policies on tasks
DROP POLICY IF EXISTS "Users can view relevant tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins and managers can update tasks" ON public.tasks;

-- Recreate without self-referencing subqueries
CREATE POLICY "Users can view relevant tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (
  is_admin_or_md(auth.uid())
  OR manages_department(auth.uid(), department_id)
  OR created_by = auth.uid()
  OR is_task_assignee(auth.uid(), id)
);

CREATE POLICY "Admins and managers can update tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (
  is_admin_or_md(auth.uid())
  OR manages_department(auth.uid(), department_id)
  OR is_task_assignee(auth.uid(), id)
);

-- Drop broken policies on task_assignees
DROP POLICY IF EXISTS "Admins and managers can manage assignees" ON public.task_assignees;

CREATE POLICY "Admins and managers can manage assignees"
ON public.task_assignees FOR ALL
TO authenticated
USING (
  is_admin_or_md(auth.uid())
  OR manages_department(auth.uid(), task_department(task_id))
)
WITH CHECK (
  is_admin_or_md(auth.uid())
  OR manages_department(auth.uid(), task_department(task_id))
);
