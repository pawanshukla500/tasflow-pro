-- Eager-load friendly task deps + pagination indexes + delete scrubber.
-- Adds blocked_by / depends_on UUID arrays and a BEFORE DELETE trigger that
-- removes the deleted task id from every other task's dependency arrays
-- (prevents orphaned references).

-- ── Dependency arrays ──────────────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS blocked_by UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS depends_on UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tasks.blocked_by IS
  'Task IDs that currently block this task. Scrubbed on delete of referenced tasks.';
COMMENT ON COLUMN public.tasks.depends_on IS
  'Task IDs this task depends on (soft dependency graph). Scrubbed on delete.';

CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by_gin
  ON public.tasks USING GIN (blocked_by);

CREATE INDEX IF NOT EXISTS idx_tasks_depends_on_gin
  ON public.tasks USING GIN (depends_on);

-- Pagination / list hot path
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_id_desc
  ON public.tasks (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_org_created_at
  ON public.tasks (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
  ON public.task_comments (task_id);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id
  ON public.task_attachments (task_id);

-- Help PostgREST nest profile names on assignees / creators (same UUID as auth.users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_assignees_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.task_assignees
      ADD CONSTRAINT task_assignees_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Skipping task_assignees→profiles FK: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_created_by_profiles_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_created_by_profiles_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Skipping tasks.created_by→profiles FK: %', SQLERRM;
END $$;

-- ── Pre-delete scrubber (middleware equivalent) ────────────────────────────
CREATE OR REPLACE FUNCTION public.scrub_task_dependency_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove OLD.id from every other task's blocked_by / depends_on arrays.
  UPDATE public.tasks
  SET
    blocked_by = array_remove(COALESCE(blocked_by, '{}'::uuid[]), OLD.id),
    depends_on = array_remove(COALESCE(depends_on, '{}'::uuid[]), OLD.id),
    updated_at = now()
  WHERE id IS DISTINCT FROM OLD.id
    AND (
      OLD.id = ANY (COALESCE(blocked_by, '{}'::uuid[]))
      OR OLD.id = ANY (COALESCE(depends_on, '{}'::uuid[]))
    );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_scrub_task_deps_before_delete ON public.tasks;
CREATE TRIGGER trg_scrub_task_deps_before_delete
  BEFORE DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.scrub_task_dependency_refs();
