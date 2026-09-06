-- Project-dedicated budget and time. Hours live on tasks (not a separate
-- time-entry table) so board/list rollups stay a single query.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS budget_amount numeric,
  ADD COLUMN IF NOT EXISTS budget_currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS allocated_hours numeric;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS logged_hours numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_budget_amount_nonneg'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_budget_amount_nonneg CHECK (budget_amount IS NULL OR budget_amount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_allocated_hours_nonneg'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_allocated_hours_nonneg CHECK (allocated_hours IS NULL OR allocated_hours >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_estimated_hours_nonneg'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_estimated_hours_nonneg CHECK (estimated_hours IS NULL OR estimated_hours >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_logged_hours_nonneg'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_logged_hours_nonneg CHECK (logged_hours >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.projects.budget_amount IS
  'Money reserved for this project only. Not shared with other projects.';
COMMENT ON COLUMN public.projects.allocated_hours IS
  'Hours reserved for this project only.';
COMMENT ON COLUMN public.tasks.estimated_hours IS
  'Planned hours for this task; counted only when the task belongs to a project.';
COMMENT ON COLUMN public.tasks.logged_hours IS
  'Hours spent on this task; counted only when the task belongs to a project.';
