-- Performance management: late completion tracking, automated scoring, audit trail.

-- ── Task completion metrics ─────────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_on_time BOOLEAN,
  ADD COLUMN IF NOT EXISTS days_late INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_recorded_at TIMESTAMPTZ;

-- ── Workflow stage timing ───────────────────────────────────────────────────
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS completed_on_time BOOLEAN,
  ADD COLUMN IF NOT EXISTS hours_late NUMERIC;

-- ── Performance snapshot per user (updated in real time) ────────────────────
CREATE TABLE IF NOT EXISTS public.user_performance_metrics (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  performance_score INTEGER NOT NULL DEFAULT 0,
  tasks_assigned INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_on_time INTEGER NOT NULL DEFAULT 0,
  tasks_late INTEGER NOT NULL DEFAULT 0,
  tasks_overdue INTEGER NOT NULL DEFAULT 0,
  tasks_pending INTEGER NOT NULL DEFAULT 0,
  workflows_assigned INTEGER NOT NULL DEFAULT 0,
  workflows_completed INTEGER NOT NULL DEFAULT 0,
  workflows_on_time INTEGER NOT NULL DEFAULT 0,
  reviews_passed INTEGER NOT NULL DEFAULT 0,
  reviews_total INTEGER NOT NULL DEFAULT 0,
  avg_response_hours NUMERIC,
  task_completion_rate NUMERIC NOT NULL DEFAULT 0,
  on_time_rate NUMERIC NOT NULL DEFAULT 0,
  workflow_completion_rate NUMERIC NOT NULL DEFAULT 0,
  quality_rate NUMERIC NOT NULL DEFAULT 0,
  collaboration_score NUMERIC NOT NULL DEFAULT 0,
  deduction_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_performance_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own performance metrics" ON public.user_performance_metrics;
CREATE POLICY "Users read own performance metrics" ON public.user_performance_metrics
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Leadership read team performance metrics" ON public.user_performance_metrics;
CREATE POLICY "Leadership read team performance metrics" ON public.user_performance_metrics
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR public.is_hr(auth.uid())
    OR (
      organization_id IS NOT NULL
      AND organization_id = public.user_organization_id(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_performance_metrics.user_id
          AND p.department_id IS NOT NULL
          AND public.manages_department(auth.uid(), p.department_id)
      )
    )
  );

-- ── Late completion event log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.performance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  points_delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_events_user ON public.performance_events (user_id, created_at DESC);

ALTER TABLE public.performance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own performance events" ON public.performance_events;
CREATE POLICY "Users read own performance events" ON public.performance_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Leadership read team performance events" ON public.performance_events;
CREATE POLICY "Leadership read team performance events" ON public.performance_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR public.is_hr(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = performance_events.user_id
        AND p.department_id IS NOT NULL
        AND public.manages_department(auth.uid(), p.department_id)
    )
  );

-- ── Record late task completion on status → done ────────────────────────────
CREATE OR REPLACE FUNCTION public.record_task_completion_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_late INTEGER := 0;
  v_on_time BOOLEAN := true;
  a RECORD;
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());

    IF NEW.due_date IS NOT NULL AND NEW.completed_at::date > NEW.due_date THEN
      v_days_late := (NEW.completed_at::date - NEW.due_date);
      v_on_time := false;
    END IF;

    NEW.days_late := v_days_late;
    NEW.completed_on_time := v_on_time;
    NEW.late_recorded_at := now();

    FOR a IN SELECT user_id FROM public.task_assignees WHERE task_id = NEW.id
    LOOP
      IF NOT v_on_time THEN
        INSERT INTO public.performance_events (user_id, event_type, entity_type, entity_id, points_delta, reason, metadata)
        VALUES (
          a.user_id, 'late_task_completion', 'task', NEW.id, -LEAST(v_days_late * 2, 20),
          format('Completed "%s" %s day(s) after due date', NEW.title, v_days_late),
          jsonb_build_object('task_id', NEW.id, 'days_late', v_days_late, 'due_date', NEW.due_date)
        );
      END IF;
      PERFORM public.recalculate_user_performance(a.user_id);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = NEW.id) AND NEW.created_by IS NOT NULL THEN
      PERFORM public.recalculate_user_performance(NEW.created_by);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_completion_metrics ON public.tasks;
CREATE TRIGGER trg_task_completion_metrics
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.record_task_completion_metrics();

-- ── Recalculate workflow stage timing on completion ─────────────────────────
CREATE OR REPLACE FUNCTION public.record_workflow_stage_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours_late NUMERIC := 0;
  v_on_time BOOLEAN := true;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    IF NEW.started_at IS NOT NULL AND NEW.tat_hours IS NOT NULL THEN
      v_hours_late := GREATEST(0, EXTRACT(EPOCH FROM (NEW.completed_at - (NEW.started_at + (NEW.tat_hours || ' hours')::interval))) / 3600);
      v_on_time := v_hours_late <= 0;
    END IF;
    NEW.hours_late := v_hours_late;
    NEW.completed_on_time := v_on_time;

    IF NEW.assignee_user_id IS NOT NULL AND NOT v_on_time THEN
      INSERT INTO public.performance_events (user_id, event_type, entity_type, entity_id, points_delta, reason, metadata)
      VALUES (
        NEW.assignee_user_id, 'delayed_workflow_stage', 'workflow_stage', NEW.id,
        -LEAST(ROUND(v_hours_late)::int, 15),
        format('Workflow stage "%s" completed %.1f hour(s) past TAT', NEW.name, v_hours_late),
        jsonb_build_object('stage_id', NEW.id, 'workflow_id', NEW.workflow_id, 'hours_late', v_hours_late)
      );
      PERFORM public.recalculate_user_performance(NEW.assignee_user_id);
    ELSIF NEW.assignee_user_id IS NOT NULL THEN
      PERFORM public.recalculate_user_performance(NEW.assignee_user_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workflow_stage_metrics ON public.workflow_stages;
CREATE TRIGGER trg_workflow_stage_metrics
  BEFORE UPDATE ON public.workflow_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workflow_stage_metrics();

-- ── Core scoring: 40% task completion, 25% on-time, 20% workflow, 10% quality, 5% collab
CREATE OR REPLACE FUNCTION public.recalculate_user_performance(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_assigned INT := 0;
  v_completed INT := 0;
  v_on_time INT := 0;
  v_late INT := 0;
  v_overdue INT := 0;
  v_pending INT := 0;
  v_wf_assigned INT := 0;
  v_wf_completed INT := 0;
  v_wf_on_time INT := 0;
  v_review_pass INT := 0;
  v_review_total INT := 0;
  v_avg_response NUMERIC := 0;
  v_task_rate NUMERIC := 0;
  v_on_time_rate NUMERIC := 0;
  v_wf_rate NUMERIC := 0;
  v_quality_rate NUMERIC := 0;
  v_collab NUMERIC := 100;
  v_score NUMERIC := 0;
  v_reasons JSONB := '[]'::jsonb;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = p_user_id;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE t.status = 'done')::int,
    COUNT(*) FILTER (WHERE t.status = 'done' AND COALESCE(t.completed_on_time, true))::int,
    COUNT(*) FILTER (WHERE t.status = 'done' AND t.days_late > 0)::int,
    COUNT(*) FILTER (WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE)::int,
    COUNT(*) FILTER (WHERE t.status NOT IN ('done', 'blocked'))::int
  INTO v_assigned, v_completed, v_on_time, v_late, v_overdue, v_pending
  FROM public.task_assignees ta
  JOIN public.tasks t ON t.id = ta.task_id
  WHERE ta.user_id = p_user_id;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE ws.status = 'completed')::int,
    COUNT(*) FILTER (WHERE ws.status = 'completed' AND COALESCE(ws.completed_on_time, true))::int
  INTO v_wf_assigned, v_wf_completed, v_wf_on_time
  FROM public.workflow_stages ws
  WHERE ws.assignee_user_id = p_user_id;

  SELECT
    COUNT(*) FILTER (WHERE t.status = 'done' AND t.reviewed_at IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE t.status IN ('done', 'pending_review') AND t.requires_review)::int
  INTO v_review_pass, v_review_total
  FROM public.task_assignees ta
  JOIN public.tasks t ON t.id = ta.task_id
  WHERE ta.user_id = p_user_id;

  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 3600
  ), 0)
  INTO v_avg_response
  FROM public.task_assignees ta
  JOIN public.tasks t ON t.id = ta.task_id
  WHERE ta.user_id = p_user_id AND t.status NOT IN ('todo');

  v_task_rate := CASE WHEN v_assigned > 0 THEN (v_completed::numeric / v_assigned) * 100 ELSE 100 END;
  v_on_time_rate := CASE WHEN v_completed > 0 THEN (v_on_time::numeric / v_completed) * 100 ELSE 100 END;
  v_wf_rate := CASE WHEN v_wf_assigned > 0 THEN (v_wf_completed::numeric / v_wf_assigned) * 100 ELSE 100 END;
  v_quality_rate := CASE WHEN v_review_total > 0 THEN (v_review_pass::numeric / v_review_total) * 100 ELSE 100 END;
  v_collab := GREATEST(0, 100 - LEAST(v_avg_response, 72));

  v_score := ROUND(
    v_task_rate * 0.40 +
    v_on_time_rate * 0.25 +
    v_wf_rate * 0.20 +
    v_quality_rate * 0.10 +
    v_collab * 0.05
  );

  IF v_late > 0 THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type', 'late_completions', 'count', v_late,
      'message', format('%s task(s) completed after the due date', v_late),
      'impact', 'negative'
    ));
  END IF;
  IF v_overdue > 0 THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type', 'overdue_tasks', 'count', v_overdue,
      'message', format('%s assigned task(s) currently overdue', v_overdue),
      'impact', 'negative'
    ));
  END IF;
  IF v_pending > 0 AND v_overdue > 0 THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type', 'pending_work', 'count', v_pending,
      'message', format('%s task(s) still pending', v_pending),
      'impact', 'neutral'
    ));
  END IF;
  IF v_wf_assigned > v_wf_completed THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type', 'pending_workflows', 'count', v_wf_assigned - v_wf_completed,
      'message', format('%s workflow stage(s) still pending', v_wf_assigned - v_wf_completed),
      'impact', 'negative'
    ));
  END IF;
  IF v_on_time_rate >= 90 AND v_completed > 0 THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'type', 'strong_on_time', 'count', v_on_time,
      'message', format('Strong on-time delivery (%s%%)', ROUND(v_on_time_rate)),
      'impact', 'positive'
    ));
  END IF;

  INSERT INTO public.user_performance_metrics (
    user_id, organization_id, performance_score,
    tasks_assigned, tasks_completed, tasks_on_time, tasks_late, tasks_overdue, tasks_pending,
    workflows_assigned, workflows_completed, workflows_on_time,
    reviews_passed, reviews_total, avg_response_hours,
    task_completion_rate, on_time_rate, workflow_completion_rate, quality_rate, collaboration_score,
    deduction_reasons, updated_at
  ) VALUES (
    p_user_id, v_org, v_score::int,
    v_assigned, v_completed, v_on_time, v_late, v_overdue, v_pending,
    v_wf_assigned, v_wf_completed, v_wf_on_time,
    v_review_pass, v_review_total, v_avg_response,
    v_task_rate, v_on_time_rate, v_wf_rate, v_quality_rate, v_collab,
    v_reasons, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    performance_score = EXCLUDED.performance_score,
    tasks_assigned = EXCLUDED.tasks_assigned,
    tasks_completed = EXCLUDED.tasks_completed,
    tasks_on_time = EXCLUDED.tasks_on_time,
    tasks_late = EXCLUDED.tasks_late,
    tasks_overdue = EXCLUDED.tasks_overdue,
    tasks_pending = EXCLUDED.tasks_pending,
    workflows_assigned = EXCLUDED.workflows_assigned,
    workflows_completed = EXCLUDED.workflows_completed,
    workflows_on_time = EXCLUDED.workflows_on_time,
    reviews_passed = EXCLUDED.reviews_passed,
    reviews_total = EXCLUDED.reviews_total,
    avg_response_hours = EXCLUDED.avg_response_hours,
    task_completion_rate = EXCLUDED.task_completion_rate,
    on_time_rate = EXCLUDED.on_time_rate,
    workflow_completion_rate = EXCLUDED.workflow_completion_rate,
    quality_rate = EXCLUDED.quality_rate,
    collaboration_score = EXCLUDED.collaboration_score,
    deduction_reasons = EXCLUDED.deduction_reasons,
    updated_at = now();

  UPDATE public.profiles SET performance_score = v_score::int, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Backfill all active users
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE active = true
  LOOP
    PERFORM public.recalculate_user_performance(r.id);
  END LOOP;
END $$;
