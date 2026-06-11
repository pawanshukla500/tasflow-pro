-- Subtasks (checklist items under a parent task — Asana/Monday style)
CREATE TABLE IF NOT EXISTS public.task_subtasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id ON public.task_subtasks(task_id);

ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_task_subtasks_updated_at
  BEFORE UPDATE ON public.task_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reuse task visibility: anyone who can see/update the parent task can manage subtasks
CREATE OR REPLACE FUNCTION public.can_access_task(_task_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        t.created_by = _user_id
        OR public.is_admin_or_md(_user_id)
        OR public.is_hr(_user_id)
        OR (t.department_id IS NOT NULL AND public.manages_department(_user_id, t.department_id))
        OR EXISTS (
          SELECT 1 FROM public.task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = _user_id
        )
      )
  )
$$;

CREATE POLICY "Users can view subtasks for accessible tasks"
  ON public.task_subtasks FOR SELECT TO authenticated
  USING (public.can_access_task(task_id, auth.uid()));

CREATE POLICY "Users can add subtasks to accessible tasks"
  ON public.task_subtasks FOR INSERT TO authenticated
  WITH CHECK (public.can_access_task(task_id, auth.uid()));

CREATE POLICY "Users can update subtasks on accessible tasks"
  ON public.task_subtasks FOR UPDATE TO authenticated
  USING (public.can_access_task(task_id, auth.uid()));

CREATE POLICY "Users can delete subtasks on accessible tasks"
  ON public.task_subtasks FOR DELETE TO authenticated
  USING (public.can_access_task(task_id, auth.uid()));
