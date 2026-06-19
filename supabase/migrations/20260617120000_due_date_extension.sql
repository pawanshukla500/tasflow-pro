-- Allow assigned users to extend task due dates and workflow stage TAT with audit trail.

CREATE TABLE IF NOT EXISTS public.task_due_date_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_due_date DATE,
  new_due_date DATE NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_due_date_events_task
  ON public.task_due_date_events (task_id, created_at DESC);

ALTER TABLE public.task_due_date_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View task due date events" ON public.task_due_date_events;
CREATE POLICY "View task due date events"
  ON public.task_due_date_events FOR SELECT TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR public.is_hr(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_due_date_events.task_id
        AND (
          t.created_by = auth.uid()
          OR public.is_task_assignee(auth.uid(), t.id)
          OR public.manages_department(auth.uid(), t.department_id)
          OR public.can_review_task(auth.uid(), t.id)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.extend_task_due_date(
  p_task_id UUID,
  p_new_due_date DATE,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  old_date DATE;
  v_status TEXT;
  v_max_date DATE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Please provide a reason for the extension (at least 5 characters)';
  END IF;

  SELECT due_date, status INTO old_date, v_status
  FROM public.tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_status = 'done' THEN
    RAISE EXCEPTION 'Cannot extend due date on a completed task';
  END IF;

  IF NOT (
    public.is_admin_or_md(uid)
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = p_task_id AND t.created_by = uid)
    OR public.is_task_assignee(uid, p_task_id)
  ) THEN
    RAISE EXCEPTION 'You are not allowed to extend this task due date';
  END IF;

  IF old_date IS NOT NULL AND p_new_due_date <= old_date THEN
    RAISE EXCEPTION 'New due date must be after the current due date';
  END IF;

  IF old_date IS NULL AND p_new_due_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'New due date cannot be in the past';
  END IF;

  v_max_date := COALESCE(old_date, CURRENT_DATE) + 30;
  IF p_new_due_date > v_max_date THEN
    RAISE EXCEPTION 'Maximum extension is 30 days per request';
  END IF;

  UPDATE public.tasks
  SET due_date = p_new_due_date
  WHERE id = p_task_id;

  INSERT INTO public.task_due_date_events (task_id, actor_id, old_due_date, new_due_date, reason)
  VALUES (p_task_id, uid, old_date, p_new_due_date, trim(p_reason));

  INSERT INTO public.task_comments (task_id, user_id, body, comment_type)
  VALUES (
    p_task_id,
    uid,
    'Due date extended to ' || to_char(p_new_due_date, 'YYYY-MM-DD') || ': ' || trim(p_reason),
    'due_date_extended'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_workflow_stage_tat(
  p_stage_id UUID,
  p_add_hours INT,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_stage public.workflow_stages%ROWTYPE;
  v_raised_by UUID;
  v_max_hours INT;
  v_new_tat INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Please provide a reason for the extension (at least 5 characters)';
  END IF;

  SELECT * INTO v_stage FROM public.workflow_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow stage not found';
  END IF;

  SELECT raised_by INTO v_raised_by FROM public.workflows WHERE id = v_stage.workflow_id;

  IF v_stage.status NOT IN ('in_progress', 'blocked') THEN
    RAISE EXCEPTION 'Can only extend deadline for active stages';
  END IF;

  IF NOT (
    public.is_admin_or_md(uid)
    OR v_stage.assignee_user_id = uid
    OR v_raised_by = uid
    OR (
      v_stage.owner_department_id IS NOT NULL
      AND public.manages_department(uid, v_stage.owner_department_id)
    )
  ) THEN
    RAISE EXCEPTION 'You are not allowed to extend this stage deadline';
  END IF;

  IF p_add_hours < 1 THEN
    RAISE EXCEPTION 'Extension must be at least 1 hour';
  END IF;

  IF public.is_admin_or_md(uid) OR v_raised_by = uid THEN
    v_max_hours := 720;
  ELSE
    v_max_hours := 168;
  END IF;

  IF p_add_hours > v_max_hours THEN
    RAISE EXCEPTION 'Maximum extension is % hours per request', v_max_hours;
  END IF;

  v_new_tat := v_stage.tat_hours + p_add_hours;

  UPDATE public.workflow_stages
  SET
    tat_hours = v_new_tat,
    escalated_at = NULL,
    last_escalated_at = NULL
  WHERE id = p_stage_id;

  INSERT INTO public.workflow_stage_events (
    stage_id, workflow_id, actor_id, event_type, from_value, to_value, note
  )
  VALUES (
    p_stage_id,
    v_stage.workflow_id,
    uid,
    'tat_extended',
    v_stage.tat_hours::TEXT,
    v_new_tat::TEXT,
    trim(p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.extend_task_due_date(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_workflow_stage_tat(UUID, INT, TEXT) TO authenticated;
