-- KRA table
CREATE TABLE public.kras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  weight NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'quarterly',
  status TEXT NOT NULL DEFAULT 'on_track',
  target_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own KRAs"
ON public.kras FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins MD view all KRAs"
ON public.kras FOR SELECT TO authenticated
USING (public.is_admin_or_md(auth.uid()));

CREATE POLICY "Dept managers view team KRAs"
ON public.kras FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = kras.user_id
    AND p.department_id IS NOT NULL
    AND public.manages_department(auth.uid(), p.department_id)
));

CREATE TRIGGER update_kras_updated_at
BEFORE UPDATE ON public.kras
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- KPI table
CREATE TABLE public.kpis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kra_id UUID REFERENCES public.kras(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  metric TEXT,
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT DEFAULT '',
  period TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'on_track',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own KPIs"
ON public.kpis FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins MD view all KPIs"
ON public.kpis FOR SELECT TO authenticated
USING (public.is_admin_or_md(auth.uid()));

CREATE POLICY "Dept managers view team KPIs"
ON public.kpis FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = kpis.user_id
    AND p.department_id IS NOT NULL
    AND public.manages_department(auth.uid(), p.department_id)
));

CREATE TRIGGER update_kpis_updated_at
BEFORE UPDATE ON public.kpis
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_kras_user ON public.kras(user_id);
CREATE INDEX idx_kpis_user ON public.kpis(user_id);
CREATE INDEX idx_kpis_kra ON public.kpis(kra_id);

-- Recurring task fields
ALTER TABLE public.tasks
  ADD COLUMN frequency TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN recurrence_parent_id UUID,
  ADD COLUMN next_due_date DATE;

CREATE INDEX idx_tasks_recurrence_parent ON public.tasks(recurrence_parent_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_completed_at ON public.tasks(completed_at);

-- Auto create next occurrence when a recurring task is marked done
CREATE OR REPLACE FUNCTION public.create_next_recurring_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_due DATE;
  next_start DATE;
  new_task_id UUID;
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done')
     AND COALESCE(NEW.frequency,'none') <> 'none'
     AND NEW.due_date IS NOT NULL THEN

    next_due := CASE NEW.frequency
      WHEN 'daily' THEN NEW.due_date + INTERVAL '1 day'
      WHEN 'weekly' THEN NEW.due_date + INTERVAL '7 days'
      WHEN 'biweekly' THEN NEW.due_date + INTERVAL '14 days'
      WHEN 'monthly' THEN NEW.due_date + INTERVAL '1 month'
      WHEN 'quarterly' THEN NEW.due_date + INTERVAL '3 months'
      ELSE NULL
    END;

    IF next_due IS NULL THEN
      RETURN NEW;
    END IF;

    next_start := CASE WHEN NEW.start_date IS NOT NULL
      THEN NEW.start_date + (next_due - NEW.due_date)
      ELSE NULL END;

    -- Avoid duplicate creation if already chained
    IF NOT EXISTS (
      SELECT 1 FROM public.tasks
      WHERE recurrence_parent_id = COALESCE(NEW.recurrence_parent_id, NEW.id)
        AND due_date = next_due
    ) THEN
      INSERT INTO public.tasks (
        title, description, department_id, priority, status,
        due_date, start_date, created_by, frequency, recurrence_parent_id
      ) VALUES (
        NEW.title, NEW.description, NEW.department_id, NEW.priority, 'todo',
        next_due, next_start, NEW.created_by, NEW.frequency,
        COALESCE(NEW.recurrence_parent_id, NEW.id)
      ) RETURNING id INTO new_task_id;

      INSERT INTO public.task_assignees (task_id, user_id)
      SELECT new_task_id, user_id FROM public.task_assignees WHERE task_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_next_recurring_task
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.create_next_recurring_task();