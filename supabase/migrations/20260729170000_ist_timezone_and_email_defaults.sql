-- Use Asia/Kolkata (IST, GMT+5:30) for performance day boundaries.
-- Postgres CURRENT_DATE / ::date on timestamptz use UTC on Supabase by default,
-- which mis-classifies overdue / late completions between 00:00–05:29 IST.

CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
$$;

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
  v_has_assignees BOOLEAN := false;
  v_completed_ist DATE;
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    v_completed_ist := (NEW.completed_at AT TIME ZONE 'Asia/Kolkata')::date;

    IF NEW.due_date IS NOT NULL AND v_completed_ist > NEW.due_date THEN
      v_days_late := (v_completed_ist - NEW.due_date);
      v_on_time := false;
    END IF;

    NEW.days_late := v_days_late;
    NEW.completed_on_time := v_on_time;
    NEW.late_recorded_at := now();

    FOR a IN SELECT user_id FROM public.task_assignees WHERE task_id = NEW.id
    LOOP
      v_has_assignees := true;
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

    IF NOT v_has_assignees AND NEW.created_by IS NOT NULL THEN
      PERFORM public.recalculate_user_performance(NEW.created_by);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Patch overdue day boundary inside recalculate_user_performance by replacing
-- CURRENT_DATE / v_today with ist_today(). Re-apply the latest fairness function
-- body with IST today.
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
  v_task_recent INT := 0;
  v_wf_recent INT := 0;
  v_recent_activity INT := 0;
  v_task_rate NUMERIC := 0;
  v_on_time_rate NUMERIC := 0;
  v_wf_rate NUMERIC := 0;
  v_quality_rate NUMERIC := 0;
  v_overdue_penalty NUMERIC := 100;
  v_engagement NUMERIC := 0;
  v_collab NUMERIC := 100;
  v_score NUMERIC := 0;
  v_has_data BOOLEAN := false;
  v_reasons JSONB := '[]'::jsonb;
  v_breakdown JSONB := '[]'::jsonb;
  v_today DATE := public.ist_today();
  w_task NUMERIC := 0;
  w_ontime NUMERIC := 0;
  w_overdue NUMERIC := 0;
  w_wf NUMERIC := 0;
  w_quality NUMERIC := 0;
  w_eng NUMERIC := 0;
  w_collab NUMERIC := 0;
  w_total NUMERIC := 0;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = p_user_id;

  WITH user_tasks AS (
    SELECT DISTINCT t.id, t.status, t.due_date, t.completed_on_time, t.days_late,
           t.completed_at, t.updated_at, t.created_at, t.requires_review, t.reviewed_at
    FROM public.tasks t
    WHERE t.id IN (
      SELECT ta.task_id FROM public.task_assignees ta WHERE ta.user_id = p_user_id
      UNION
      SELECT t2.id
      FROM public.tasks t2
      WHERE t2.created_by = p_user_id
        AND NOT EXISTS (
          SELECT 1 FROM public.task_assignees ta2 WHERE ta2.task_id = t2.id
        )
    )
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status = 'done')::int,
    COUNT(*) FILTER (WHERE status = 'done' AND COALESCE(completed_on_time, true))::int,
    COUNT(*) FILTER (WHERE status = 'done' AND days_late > 0)::int,
    COUNT(*) FILTER (WHERE status != 'done' AND due_date IS NOT NULL AND due_date < v_today)::int,
    COUNT(*) FILTER (WHERE status NOT IN ('done', 'blocked'))::int,
    COUNT(*) FILTER (
      WHERE status = 'done'
        AND completed_at IS NOT NULL
        AND completed_at >= (now() - interval '14 days')
    )::int
  INTO v_assigned, v_completed, v_on_time, v_late, v_overdue, v_pending, v_task_recent
  FROM user_tasks;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE ws.status = 'completed')::int,
    COUNT(*) FILTER (WHERE ws.status = 'completed' AND COALESCE(ws.completed_on_time, true))::int,
    COUNT(*) FILTER (
      WHERE ws.status = 'completed'
        AND ws.completed_at IS NOT NULL
        AND ws.completed_at >= (now() - interval '14 days')
    )::int
  INTO v_wf_assigned, v_wf_completed, v_wf_on_time, v_wf_recent
  FROM public.workflow_stages ws
  WHERE ws.assignee_user_id = p_user_id;

  v_recent_activity := COALESCE(v_task_recent, 0) + COALESCE(v_wf_recent, 0);

  SELECT
    COUNT(*) FILTER (WHERE t.status = 'done' AND t.reviewed_at IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE t.status IN ('done', 'pending_review') AND t.requires_review)::int
  INTO v_review_pass, v_review_total
  FROM (
    SELECT DISTINCT t.id, t.status, t.reviewed_at, t.requires_review
    FROM public.tasks t
    WHERE t.id IN (
      SELECT ta.task_id FROM public.task_assignees ta WHERE ta.user_id = p_user_id
      UNION
      SELECT t2.id
      FROM public.tasks t2
      WHERE t2.created_by = p_user_id
        AND NOT EXISTS (
          SELECT 1 FROM public.task_assignees ta2 WHERE ta2.task_id = t2.id
        )
    )
  ) t;

  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 3600
  ), 0)
  INTO v_avg_response
  FROM public.tasks t
  WHERE t.id IN (
    SELECT ta.task_id FROM public.task_assignees ta WHERE ta.user_id = p_user_id
    UNION
    SELECT t2.id
    FROM public.tasks t2
    WHERE t2.created_by = p_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.task_assignees ta2 WHERE ta2.task_id = t2.id
      )
  )
  AND t.status NOT IN ('todo');

  v_has_data := (v_assigned > 0 OR v_wf_assigned > 0);

  IF NOT v_has_data THEN
    v_score := 0;
    v_reasons := jsonb_build_array(jsonb_build_object(
      'type', 'no_assigned_work',
      'count', 0,
      'message', 'No assigned tasks or workflows yet — your score will appear once work is assigned',
      'impact', 'neutral'
    ));
    v_breakdown := '[]'::jsonb;
  ELSE
    v_task_rate := CASE WHEN v_assigned > 0 THEN (v_completed::numeric / v_assigned) * 100 ELSE 0 END;
    v_on_time_rate := CASE WHEN v_completed > 0 THEN (v_on_time::numeric / v_completed) * 100 ELSE 0 END;
    v_wf_rate := CASE WHEN v_wf_assigned > 0 THEN (v_wf_completed::numeric / v_wf_assigned) * 100 ELSE 0 END;
    v_quality_rate := CASE WHEN v_review_total > 0 THEN (v_review_pass::numeric / v_review_total) * 100 ELSE 0 END;

    v_overdue_penalty := GREATEST(0, 100 - LEAST(v_overdue * 8, 40));
    v_engagement := LEAST(100, v_recent_activity * 25);
    v_collab := GREATEST(0, 100 - LEAST(v_avg_response, 72));

    w_task := CASE WHEN v_assigned > 0 THEN 30 ELSE 0 END;
    w_ontime := CASE WHEN v_completed > 0 THEN 25 ELSE 0 END;
    w_overdue := CASE WHEN v_assigned > 0 THEN 15 ELSE 0 END;
    w_wf := CASE WHEN v_wf_assigned > 0 THEN 10 ELSE 0 END;
    w_quality := CASE WHEN v_review_total > 0 THEN 10 ELSE 0 END;
    w_eng := 5;
    w_collab := 5;
    w_total := w_task + w_ontime + w_overdue + w_wf + w_quality + w_eng + w_collab;

    IF w_total > 0 THEN
      v_score := ROUND((
        v_task_rate * w_task +
        v_on_time_rate * w_ontime +
        v_overdue_penalty * w_overdue +
        v_wf_rate * w_wf +
        v_quality_rate * w_quality +
        v_engagement * w_eng +
        v_collab * w_collab
      ) / w_total);
    ELSE
      v_score := 0;
    END IF;
    v_score := GREATEST(0, LEAST(100, v_score));

    v_breakdown := '[]'::jsonb;
    IF w_task > 0 THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'factor', 'Task completion', 'weight', w_task,
        'effective_weight', ROUND((w_task / w_total) * 1000) / 10,
        'value', ROUND(v_task_rate),
        'contribution', ROUND((v_task_rate * w_task) / w_total)
      ));
    END IF;
    IF w_ontime > 0 THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'factor', 'On-time delivery', 'weight', w_ontime,
        'effective_weight', ROUND((w_ontime / w_total) * 1000) / 10,
        'value', ROUND(v_on_time_rate),
        'contribution', ROUND((v_on_time_rate * w_ontime) / w_total)
      ));
    END IF;
    IF w_overdue > 0 THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'factor', 'Overdue health', 'weight', w_overdue,
        'effective_weight', ROUND((w_overdue / w_total) * 1000) / 10,
        'value', ROUND(v_overdue_penalty),
        'contribution', ROUND((v_overdue_penalty * w_overdue) / w_total)
      ));
    END IF;
    IF w_wf > 0 THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'factor', 'Workflow completion', 'weight', w_wf,
        'effective_weight', ROUND((w_wf / w_total) * 1000) / 10,
        'value', ROUND(v_wf_rate),
        'contribution', ROUND((v_wf_rate * w_wf) / w_total)
      ));
    END IF;
    IF w_quality > 0 THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'factor', 'Quality / reviews', 'weight', w_quality,
        'effective_weight', ROUND((w_quality / w_total) * 1000) / 10,
        'value', ROUND(v_quality_rate),
        'contribution', ROUND((v_quality_rate * w_quality) / w_total)
      ));
    END IF;
    IF w_eng > 0 THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'factor', 'Recent activity', 'weight', w_eng,
        'effective_weight', ROUND((w_eng / w_total) * 1000) / 10,
        'value', ROUND(v_engagement),
        'contribution', ROUND((v_engagement * w_eng) / w_total)
      ));
    END IF;
    IF w_collab > 0 THEN
      v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
        'factor', 'Response time', 'weight', w_collab,
        'effective_weight', ROUND((w_collab / w_total) * 1000) / 10,
        'value', ROUND(v_collab),
        'contribution', ROUND((v_collab * w_collab) / w_total)
      ));
    END IF;

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
        'message', format('%s task(s) currently overdue — score reduced by %s points', v_overdue, LEAST(v_overdue * 8, 40)),
        'impact', 'negative'
      ));
    END IF;
    IF v_pending > 0 THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type', 'pending_work', 'count', v_pending,
        'message', format('%s task(s) still open', v_pending),
        'impact', CASE WHEN v_overdue > 0 THEN 'negative' ELSE 'neutral' END
      ));
    END IF;
    IF v_wf_assigned > v_wf_completed THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type', 'pending_workflows', 'count', v_wf_assigned - v_wf_completed,
        'message', format('%s workflow stage(s) still pending', v_wf_assigned - v_wf_completed),
        'impact', 'negative'
      ));
    END IF;
    IF v_on_time_rate >= 90 AND v_completed >= 3 THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type', 'strong_on_time', 'count', v_on_time,
        'message', format('Strong on-time delivery (%s%% across %s completions)', ROUND(v_on_time_rate), v_completed),
        'impact', 'positive'
      ));
    END IF;
    IF v_task_rate >= 80 AND v_completed >= 3 THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type', 'high_completion', 'count', v_completed,
        'message', format('High task completion rate (%s%%)', ROUND(v_task_rate)),
        'impact', 'positive'
      ));
    END IF;
    IF v_engagement >= 75 THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type', 'active_engagement', 'count', v_recent_activity,
        'message', 'Consistent activity in the last 2 weeks',
        'impact', 'positive'
      ));
    ELSIF v_engagement < 25 AND v_pending > 0 THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'type', 'low_engagement', 'count', 0,
        'message', 'Low recent activity — complete or update tasks to improve your score',
        'impact', 'negative'
      ));
    END IF;
  END IF;

  INSERT INTO public.user_performance_metrics (
    user_id, organization_id, performance_score,
    tasks_assigned, tasks_completed, tasks_on_time, tasks_late, tasks_overdue, tasks_pending,
    workflows_assigned, workflows_completed, workflows_on_time,
    reviews_passed, reviews_total, avg_response_hours,
    task_completion_rate, on_time_rate, workflow_completion_rate, quality_rate, collaboration_score,
    engagement_score, overdue_penalty_score, has_sufficient_data,
    score_breakdown, deduction_reasons, updated_at
  ) VALUES (
    p_user_id, v_org, v_score::int,
    v_assigned, v_completed, v_on_time, v_late, v_overdue, v_pending,
    v_wf_assigned, v_wf_completed, v_wf_on_time,
    v_review_pass, v_review_total, v_avg_response,
    v_task_rate, v_on_time_rate, v_wf_rate, v_quality_rate, v_collab,
    v_engagement, v_overdue_penalty, v_has_data,
    v_breakdown, v_reasons, now()
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
    engagement_score = EXCLUDED.engagement_score,
    overdue_penalty_score = EXCLUDED.overdue_penalty_score,
    has_sufficient_data = EXCLUDED.has_sufficient_data,
    score_breakdown = EXCLUDED.score_breakdown,
    deduction_reasons = EXCLUDED.deduction_reasons,
    updated_at = now();

  UPDATE public.profiles SET performance_score = v_score::int, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Refresh scores with IST day boundary
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE active = true
  LOOP
    PERFORM public.recalculate_user_performance(r.id);
  END LOOP;
END $$;
