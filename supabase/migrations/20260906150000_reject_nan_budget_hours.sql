-- numeric NaN satisfies "col >= 0" because NaN comparisons are not FALSE.
-- Require col = col (NaN is not equal to itself) so totals cannot become NaN.

UPDATE public.projects SET budget_amount = NULL WHERE budget_amount = 'NaN'::numeric;
UPDATE public.projects SET allocated_hours = NULL WHERE allocated_hours = 'NaN'::numeric;
UPDATE public.tasks SET estimated_hours = NULL WHERE estimated_hours = 'NaN'::numeric;
UPDATE public.tasks SET logged_hours = 0 WHERE logged_hours = 'NaN'::numeric;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_budget_amount_nonneg;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_budget_amount_nonneg
  CHECK (budget_amount IS NULL OR (budget_amount >= 0 AND budget_amount = budget_amount));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_allocated_hours_nonneg;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_allocated_hours_nonneg
  CHECK (allocated_hours IS NULL OR (allocated_hours >= 0 AND allocated_hours = allocated_hours));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_estimated_hours_nonneg;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_estimated_hours_nonneg
  CHECK (estimated_hours IS NULL OR (estimated_hours >= 0 AND estimated_hours = estimated_hours));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_logged_hours_nonneg;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_logged_hours_nonneg
  CHECK (logged_hours >= 0 AND logged_hours = logged_hours);
