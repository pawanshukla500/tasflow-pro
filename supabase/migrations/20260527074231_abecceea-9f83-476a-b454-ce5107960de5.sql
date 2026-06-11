ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time time;

CREATE OR REPLACE FUNCTION public.create_next_recurring_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    IF next_due IS NULL THEN RETURN NEW; END IF;

    next_start := CASE WHEN NEW.start_date IS NOT NULL
      THEN NEW.start_date + (next_due - NEW.due_date)
      ELSE NULL END;

    IF NOT EXISTS (
      SELECT 1 FROM public.tasks
      WHERE recurrence_parent_id = COALESCE(NEW.recurrence_parent_id, NEW.id)
        AND due_date = next_due
    ) THEN
      INSERT INTO public.tasks (
        title, description, department_id, priority, status,
        due_date, due_time, start_date, created_by, frequency, recurrence_parent_id
      ) VALUES (
        NEW.title, NEW.description, NEW.department_id, NEW.priority, 'todo',
        next_due, NEW.due_time, next_start, NEW.created_by, NEW.frequency,
        COALESCE(NEW.recurrence_parent_id, NEW.id)
      ) RETURNING id INTO new_task_id;

      INSERT INTO public.task_assignees (task_id, user_id)
      SELECT new_task_id, user_id FROM public.task_assignees WHERE task_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;