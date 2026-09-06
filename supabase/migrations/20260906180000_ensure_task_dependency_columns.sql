-- Hosted recorded 20260720140000 but tasks.blocked_by / depends_on are missing.
-- Re-add them so project-scoped selects that include DEPS_COLS can succeed.
-- Idempotent; do not rewrite the original migration.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS blocked_by UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS depends_on UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by_gin
  ON public.tasks USING GIN (blocked_by);

CREATE INDEX IF NOT EXISTS idx_tasks_depends_on_gin
  ON public.tasks USING GIN (depends_on);
