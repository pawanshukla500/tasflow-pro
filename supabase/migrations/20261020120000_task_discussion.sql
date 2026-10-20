-- Task discussion: replies, @mentions, and comment attachments on the existing
-- task_comments / task_attachments tables.
--
-- Additive and idempotent. Existing notes, review comments, and due-date
-- comments stay in task_comments. Chat messages use comment_type = 'message'.
-- Apply only after review. This file does not run by itself.

-- ---------------------------------------------------------------------------
-- Access: same people who can already work a task, plus its reviewer.
-- can_access_task already covers creator, assignees, department managers,
-- HR, and Admin/MD. Reviewers need the thread when they audit a task.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_discuss_task(_task_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_task(_task_id, _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = _task_id
        AND t.reviewer_user_id = _user_id
    );
$$;

REVOKE ALL ON FUNCTION public.can_discuss_task(UUID, UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.can_discuss_task(UUID, UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.can_discuss_task(UUID, UUID) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.can_discuss_task(UUID, UUID) TO service_role;
  END IF;
END $$;

-- Reviewers can open the task they were asked to audit. Other visibility
-- policies are unchanged.
DROP POLICY IF EXISTS "Reviewers can view tasks they review" ON public.tasks;
CREATE POLICY "Reviewers can view tasks they review"
  ON public.tasks FOR SELECT TO authenticated
  USING (reviewer_user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tasks_reviewer_user_id
  ON public.tasks (reviewer_user_id)
  WHERE reviewer_user_id IS NOT NULL;

-- Assignees list on a task the reviewer opens.
DROP POLICY IF EXISTS "View task assignees for accessible tasks" ON public.task_assignees;
CREATE POLICY "View task assignees for accessible tasks"
  ON public.task_assignees FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin_or_md((SELECT auth.uid()))
    OR public.is_hr((SELECT auth.uid()))
    OR public.is_task_assignee((SELECT auth.uid()), task_id)
    OR EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_assignees.task_id
        AND (
          t.created_by = (SELECT auth.uid())
          OR t.reviewer_user_id = (SELECT auth.uid())
          OR public.manages_department((SELECT auth.uid()), t.department_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Comments: one-level replies and edit marker. Existing rows stay valid.
-- ---------------------------------------------------------------------------

ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.task_comments
    ADD CONSTRAINT task_comments_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.task_comments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.task_comments
    ADD CONSTRAINT task_comments_parent_not_self
    CHECK (parent_id IS NULL OR parent_id <> id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.task_comments
    ADD CONSTRAINT task_comments_body_length
    CHECK (char_length(body) <= 4000);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_comments_parent
  ON public.task_comments (parent_id, created_at)
  WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_task_comment_shape()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_task UUID;
  parent_parent UUID;
BEGIN
  IF char_length(NEW.body) > 4000 THEN
    RAISE EXCEPTION 'Comment is too long (max 4000 characters)';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.task_id IS DISTINCT FROM OLD.task_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
      OR NEW.comment_type IS DISTINCT FROM OLD.comment_type
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Only the comment text can be edited';
    END IF;
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      NEW.edited_at := now();
    END IF;
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT c.task_id, c.parent_id
      INTO parent_task, parent_parent
    FROM public.task_comments c
    WHERE c.id = NEW.parent_id;

    IF parent_task IS NULL OR parent_task IS DISTINCT FROM NEW.task_id THEN
      RAISE EXCEPTION 'Reply must stay on the same task';
    END IF;
    IF parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'Replies can only be one level deep';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_task_comment_shape() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.enforce_task_comment_shape() TO authenticated;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_task_comment_shape ON public.task_comments;
CREATE TRIGGER trg_enforce_task_comment_shape
  BEFORE INSERT OR UPDATE ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_comment_shape();

DROP POLICY IF EXISTS "View comments on accessible tasks" ON public.task_comments;
CREATE POLICY "View comments on accessible tasks"
  ON public.task_comments FOR SELECT TO authenticated
  USING (public.can_discuss_task(task_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Add comments on accessible tasks" ON public.task_comments;
CREATE POLICY "Add comments on accessible tasks"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_discuss_task(task_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Edit own task comments" ON public.task_comments;
CREATE POLICY "Edit own task comments"
  ON public.task_comments FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND comment_type IN ('message', 'note')
    AND public.can_discuss_task(task_id, (SELECT auth.uid()))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND comment_type IN ('message', 'note')
    AND public.can_discuss_task(task_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Delete own task comments" ON public.task_comments;
CREATE POLICY "Delete own task comments"
  ON public.task_comments FOR DELETE TO authenticated
  USING (
    comment_type IN ('message', 'note')
    AND public.can_discuss_task(task_id, (SELECT auth.uid()))
    AND (
      user_id = (SELECT auth.uid())
      OR public.is_admin_or_md((SELECT auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- Mentions. Rows are written by the author; a trigger notifies the person.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_comment_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_comment_mentions_comment
  ON public.task_comment_mentions (comment_id);

CREATE INDEX IF NOT EXISTS idx_task_comment_mentions_user
  ON public.task_comment_mentions (mentioned_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_comment_mentions_task
  ON public.task_comment_mentions (task_id);

ALTER TABLE public.task_comment_mentions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.task_comment_mentions FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.task_comment_mentions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, DELETE ON public.task_comment_mentions TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.task_comment_mentions TO service_role;
  END IF;
END $$;

DROP POLICY IF EXISTS "View mentions on accessible tasks" ON public.task_comment_mentions;
CREATE POLICY "View mentions on accessible tasks"
  ON public.task_comment_mentions FOR SELECT TO authenticated
  USING (public.can_discuss_task(task_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Author adds mentions" ON public.task_comment_mentions;
CREATE POLICY "Author adds mentions"
  ON public.task_comment_mentions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.task_comments c
      JOIN public.tasks t ON t.id = c.task_id
      JOIN public.profiles mentioned ON mentioned.id = task_comment_mentions.mentioned_user_id
      WHERE c.id = task_comment_mentions.comment_id
        AND c.task_id = task_comment_mentions.task_id
        AND c.user_id = (SELECT auth.uid())
        AND mentioned.active IS TRUE
        AND public.can_discuss_task(c.task_id, mentioned.id)
        AND (
          t.organization_id IS NULL
          OR mentioned.organization_id IS NULL
          OR mentioned.organization_id = t.organization_id
        )
    )
  );

DROP POLICY IF EXISTS "Author removes mentions" ON public.task_comment_mentions;
CREATE POLICY "Author removes mentions"
  ON public.task_comment_mentions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.task_comments c
      WHERE c.id = task_comment_mentions.comment_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.notify_task_comment_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author UUID;
  v_author_name TEXT;
  v_task_title TEXT;
BEGIN
  SELECT c.user_id, COALESCE(p.name, 'Someone'), left(t.title, 140)
    INTO v_author, v_author_name, v_task_title
  FROM public.task_comments c
  JOIN public.tasks t ON t.id = c.task_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE c.id = NEW.comment_id;

  IF v_author IS NULL OR v_author = NEW.mentioned_user_id THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.in_app_notifications (
      user_id, notification_type, title, body, action_url, metadata
    ) VALUES (
      NEW.mentioned_user_id,
      'mention',
      v_author_name || ' mentioned you',
      v_task_title,
      '/my-tasks?task=' || NEW.task_id::text,
      jsonb_build_object(
        'task_id', NEW.task_id,
        'comment_id', NEW.comment_id
      )
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE WARNING 'task mention notification skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_task_comment_mention() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.notify_task_comment_mention() TO authenticated;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_notify_task_comment_mention ON public.task_comment_mentions;
CREATE TRIGGER trg_notify_task_comment_mention
  AFTER INSERT ON public.task_comment_mentions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_comment_mention();

-- People the signed-in user may @ on this task. Empty when they cannot
-- participate, so the picker does not leak names.
CREATE OR REPLACE FUNCTION public.list_task_discussion_participants(_task_id UUID)
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT
      public.can_discuss_task(_task_id, auth.uid()) AS ok,
      t.organization_id
    FROM public.tasks t
    WHERE t.id = _task_id
  )
  SELECT p.id, p.name, p.avatar_url
  FROM (
    SELECT a.user_id AS id
    FROM public.task_assignees a
    WHERE a.task_id = _task_id
    UNION
    SELECT t.created_by
    FROM public.tasks t
    WHERE t.id = _task_id AND t.created_by IS NOT NULL
    UNION
    SELECT t.reviewer_user_id
    FROM public.tasks t
    WHERE t.id = _task_id AND t.reviewer_user_id IS NOT NULL
    UNION
    SELECT dm.user_id
    FROM public.tasks t
    JOIN public.department_managers dm ON dm.department_id = t.department_id
    WHERE t.id = _task_id
    UNION
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('managing_director', 'system_admin', 'hr')
  ) people
  JOIN public.profiles p ON p.id = people.id
  CROSS JOIN allowed
  WHERE allowed.ok
    AND p.active IS TRUE
    AND p.id IS DISTINCT FROM auth.uid()
    AND (
      allowed.organization_id IS NULL
      OR p.organization_id IS NULL
      OR p.organization_id = allowed.organization_id
    )
  ORDER BY p.name;
$$;

REVOKE ALL ON FUNCTION public.list_task_discussion_participants(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.list_task_discussion_participants(UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.list_task_discussion_participants(UUID) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.list_task_discussion_participants(UUID) TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Files on a comment reuse task_attachments. comment_id NULL stays a
-- task-level file (existing behavior).
-- ---------------------------------------------------------------------------

ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS comment_id UUID;

DO $$
BEGIN
  ALTER TABLE public.task_attachments
    ADD CONSTRAINT task_attachments_comment_id_fkey
    FOREIGN KEY (comment_id) REFERENCES public.task_comments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_attachments_comment
  ON public.task_attachments (comment_id)
  WHERE comment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_task_attachment_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NEW.comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.task_comments c
    WHERE c.id = NEW.comment_id
      AND c.task_id = NEW.task_id
  ) THEN
    RAISE EXCEPTION 'Attachment must belong to a comment on the same task';
  END IF;

  SELECT count(*) INTO n
  FROM public.task_attachments a
  WHERE a.comment_id = NEW.comment_id
    AND a.id IS DISTINCT FROM NEW.id;

  IF n >= 8 THEN
    RAISE EXCEPTION 'A comment can have at most 8 attachments';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_task_attachment_comment() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.enforce_task_attachment_comment() TO authenticated;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_task_attachment_comment ON public.task_attachments;
CREATE TRIGGER trg_enforce_task_attachment_comment
  BEFORE INSERT OR UPDATE ON public.task_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_attachment_comment();

DROP POLICY IF EXISTS "View task attachments" ON public.task_attachments;
CREATE POLICY "View task attachments"
  ON public.task_attachments FOR SELECT TO authenticated
  USING (public.can_discuss_task(task_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Upload task attachments" ON public.task_attachments;
CREATE POLICY "Upload task attachments"
  ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND public.can_discuss_task(task_id, (SELECT auth.uid()))
    AND (
      comment_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.task_comments c
        WHERE c.id = task_attachments.comment_id
          AND c.task_id = task_attachments.task_id
          AND c.user_id = (SELECT auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime. FULL identity so DELETE events still carry task_id for filters.
-- ---------------------------------------------------------------------------

ALTER TABLE public.task_comments REPLICA IDENTITY FULL;
ALTER TABLE public.task_attachments REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_attachments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
