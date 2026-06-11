-- Task permissions: creator-only delete/edit; assignee progress-only; audit/review flow.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'note',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.task_comments (task_id, created_at DESC);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_delete_task(_user_id UUID, _task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (public.is_admin_or_md(_user_id) OR t.created_by = _user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_task_metadata(_user_id UUID, _task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_delete_task(_user_id, _task_id)
     OR public.is_hr(_user_id)
     OR EXISTS (
       SELECT 1 FROM public.tasks t
       WHERE t.id = _task_id
         AND t.department_id IS NOT NULL
         AND public.manages_department(_user_id, t.department_id)
         AND t.created_by = _user_id
     );
$$;

CREATE OR REPLACE FUNCTION public.can_review_task(_user_id UUID, _task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        public.is_admin_or_md(_user_id)
        OR t.created_by = _user_id
        OR t.reviewer_user_id = _user_id
        OR (t.department_id IS NOT NULL AND public.manages_department(_user_id, t.department_id))
      )
  );
$$;

-- DELETE: only task creator or Admin/MD
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.tasks;
CREATE POLICY "Creator or admin can delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (public.can_delete_task(auth.uid(), id));

-- UPDATE: assignees may update progress; metadata editors per can_edit_task_metadata / can_review_task
DROP POLICY IF EXISTS "Admins and managers can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "HR can update tasks" ON public.tasks;

CREATE POLICY "Authorized users update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR public.is_hr(auth.uid())
    OR created_by = auth.uid()
    OR public.manages_department(auth.uid(), department_id)
    OR public.is_task_assignee(auth.uid(), id)
    OR public.can_review_task(auth.uid(), id)
  )
  WITH CHECK (
    public.is_admin_or_md(auth.uid())
    OR public.is_hr(auth.uid())
    OR created_by = auth.uid()
    OR public.manages_department(auth.uid(), department_id)
    OR public.is_task_assignee(auth.uid(), id)
    OR public.can_review_task(auth.uid(), id)
  );

CREATE OR REPLACE FUNCTION public.enforce_task_update_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_or_md(uid) OR public.is_hr(uid) OR OLD.created_by = uid THEN
    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
      NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
      NEW.reviewed_by := COALESCE(NEW.reviewed_by, uid);
    ELSIF NEW.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF public.can_review_task(uid, OLD.id) AND OLD.status = 'pending_review' THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at := now();
      NEW.reviewed_at := now();
      NEW.reviewed_by := uid;
      RETURN NEW;
    ELSIF NEW.status IN ('in_progress', 'todo', 'blocked') THEN
      NEW.reviewed_at := now();
      NEW.reviewed_by := uid;
      RETURN NEW;
    END IF;
  END IF;

  IF public.is_task_assignee(uid, OLD.id) THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.priority IS DISTINCT FROM OLD.priority
      OR NEW.department_id IS DISTINCT FROM OLD.department_id
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.due_time IS DISTINCT FROM OLD.due_time
      OR NEW.frequency IS DISTINCT FROM OLD.frequency
      OR NEW.requires_review IS DISTINCT FROM OLD.requires_review
      OR NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Assignees cannot edit task details. Contact the person who assigned this task.';
    END IF;

    IF OLD.requires_review THEN
      IF NEW.status = 'done' THEN
        RAISE EXCEPTION 'This task requires audit/review. Submit for review instead of marking complete.';
      END IF;
      IF NEW.status = 'pending_review' AND OLD.status IS DISTINCT FROM 'pending_review' THEN
        NEW.submitted_for_review_at := now();
        RETURN NEW;
      END IF;
    ELSE
      IF NEW.status = 'done' THEN
        NEW.completed_at := now();
        RETURN NEW;
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
      AND NEW.status IN ('todo', 'in_progress', 'blocked', 'pending_review')
    THEN
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.review_note IS DISTINCT FROM OLD.review_note
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    THEN
      RAISE EXCEPTION 'You are not allowed to change this task field.';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized to update this task';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_update_permissions ON public.tasks;
CREATE TRIGGER trg_enforce_task_update_permissions
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_update_permissions();

DROP POLICY IF EXISTS "View comments on accessible tasks" ON public.task_comments;
CREATE POLICY "View comments on accessible tasks"
  ON public.task_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND (
          public.is_admin_or_md(auth.uid())
          OR public.is_hr(auth.uid())
          OR t.created_by = auth.uid()
          OR public.manages_department(auth.uid(), t.department_id)
          OR public.is_task_assignee(auth.uid(), t.id)
        )
    )
  );

DROP POLICY IF EXISTS "Add comments on accessible tasks" ON public.task_comments;
CREATE POLICY "Add comments on accessible tasks"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND (
          public.is_admin_or_md(auth.uid())
          OR t.created_by = auth.uid()
          OR public.manages_department(auth.uid(), t.department_id)
          OR public.is_task_assignee(auth.uid(), t.id)
        )
    )
  );
