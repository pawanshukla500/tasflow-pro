-- Local proof for 20261020120000_task_discussion.sql.
-- Builds the smallest schema that migration expects, applies it, then checks
-- RLS, replies, mentions, attachments, and realtime publication.
-- Run with: psql -v ON_ERROR_STOP=1 -f src/test/task-discussion-rls.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT 'CREATE ROLE authenticated NOINHERIT' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') \gexec
SELECT 'CREATE ROLE anon NOINHERIT' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') \gexec

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'managing_director', 'system_admin', 'department_manager', 'employee', 'hr'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  organization_id UUID
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL
);

CREATE TABLE IF NOT EXISTS public.department_managers (
  user_id UUID NOT NULL,
  department_id UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  organization_id UUID,
  department_id UUID,
  created_by UUID,
  reviewer_user_id UUID,
  status TEXT NOT NULL DEFAULT 'todo'
);

CREATE TABLE IF NOT EXISTS public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'note',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin_or_md(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('managing_director', 'system_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_hr(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'hr'
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_department(_user_id UUID, _dept_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_managers
    WHERE user_id = _user_id AND department_id = _dept_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_task_assignee(_user_id UUID, _task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE user_id = _user_id AND task_id = _task_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_task(_task_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        t.created_by = _user_id
        OR public.is_admin_or_md(_user_id)
        OR public.is_hr(_user_id)
        OR (t.department_id IS NOT NULL AND public.manages_department(_user_id, t.department_id))
        OR EXISTS (
          SELECT 1 FROM public.task_assignees ta
          WHERE ta.task_id = t.id AND ta.user_id = _user_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime;

\ir ../../supabase/migrations/20261020120000_task_discussion.sql

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
REVOKE ALL ON public.task_comment_mentions FROM anon;

-- Mirror the production read policies the mention check joins through.
CREATE POLICY "Users can view relevant tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR public.is_admin_or_md((SELECT auth.uid()))
    OR public.is_hr((SELECT auth.uid()))
    OR public.is_task_assignee((SELECT auth.uid()), id)
  );

CREATE POLICY "View profiles in organization"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_admin_or_md((SELECT auth.uid()))
    OR organization_id = public.user_organization_id((SELECT auth.uid()))
  );

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666');

INSERT INTO public.profiles (id, name, email, active, organization_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Assignee', 'assignee@example.test', true, '99999999-9999-4999-8999-999999999999'),
  ('22222222-2222-4222-8222-222222222222', 'Outsider', 'outsider@example.test', true, '88888888-8888-4888-8888-888888888888'),
  ('33333333-3333-4333-8333-333333333333', 'Creator', 'creator@example.test', true, '99999999-9999-4999-8999-999999999999'),
  ('44444444-4444-4444-8444-444444444444', 'Reviewer', 'reviewer@example.test', true, '99999999-9999-4999-8999-999999999999'),
  ('55555555-5555-4555-8555-555555555555', 'Admin', 'admin@example.test', true, '99999999-9999-4999-8999-999999999999'),
  ('66666666-6666-4666-8666-666666666666', 'Other HR', 'hr@example.test', true, '88888888-8888-4888-8888-888888888888');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('55555555-5555-4555-8555-555555555555', 'system_admin'),
  ('66666666-6666-4666-8666-666666666666', 'hr');

INSERT INTO public.tasks (id, title, organization_id, created_by, reviewer_user_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Launch brief', '99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Other task', '99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333', NULL);

INSERT INTO public.task_assignees (task_id, user_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111');

INSERT INTO public.task_comments (id, task_id, user_id, body, comment_type) VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'Existing progress note', 'note');

-- Assignee can read history and post a reply.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

DO $$
DECLARE
  n INTEGER;
  message_id UUID;
BEGIN
  SELECT count(*) INTO n FROM public.task_comments WHERE task_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF n <> 1 THEN
    RAISE EXCEPTION 'assignee should see the existing note, saw %', n;
  END IF;

  INSERT INTO public.task_comments (id, task_id, user_id, body, comment_type, parent_id)
  VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'Reply on the task',
    'message',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  )
  RETURNING id INTO message_id;

  INSERT INTO public.task_comment_mentions (comment_id, task_id, mentioned_user_id)
  VALUES (message_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444');

  INSERT INTO public.task_attachments (task_id, comment_id, uploaded_by, file_name, file_url)
  VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    message_id,
    '11111111-1111-4111-8111-111111111111',
    'brief.pdf',
    'https://example.test/brief.pdf'
  );
END $$;

RESET ROLE;

DO $$
DECLARE
  n INTEGER;
  edited TIMESTAMPTZ;
BEGIN
  SELECT count(*) INTO n
  FROM public.in_app_notifications
  WHERE user_id = '44444444-4444-4444-8444-444444444444'
    AND notification_type = 'mention';
  IF n <> 1 THEN
    RAISE EXCEPTION 'reviewer should get one mention notification, saw %', n;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.task_comments
  SET body = 'Reply edited'
  WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  RESET ROLE;

  SELECT edited_at INTO edited
  FROM public.task_comments
  WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  IF edited IS NULL THEN
    RAISE EXCEPTION 'editing a message should stamp edited_at';
  END IF;
END $$;

-- Outsider cannot read or write the thread.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS (SELECT 1 FROM public.task_comments) THEN
    RAISE EXCEPTION 'outsider should not see task comments';
  END IF;
  BEGIN
    INSERT INTO public.task_comments (task_id, user_id, body, comment_type)
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'leak',
      'message'
    );
    RAISE EXCEPTION 'outsider insert should fail';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%row-level security%' THEN
        RAISE;
      END IF;
  END;
END $$;

-- Mention someone who cannot see the task.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.task_comment_mentions (comment_id, task_id, mentioned_user_id)
    VALUES (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'mention of an outsider should fail';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%row-level security%' THEN
        RAISE;
      END IF;
  END;
END $$;

-- Reply cannot jump tasks or nest a second level.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.task_comments (task_id, user_id, body, comment_type, parent_id)
    VALUES (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '11111111-1111-4111-8111-111111111111',
      'wrong task',
      'message',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    );
    RAISE EXCEPTION 'cross-task reply should fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%same task%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.task_comments (task_id, user_id, body, comment_type, parent_id)
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'too deep',
      'message',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    );
    RAISE EXCEPTION 'second-level reply should fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%one level%' THEN
        RAISE;
      END IF;
  END;
END $$;

-- Review and system comments are not deletable. Own chat messages are.
DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.task_comments (id, task_id, user_id, body, comment_type)
  VALUES (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
    'Approved',
    'review_approve'
  );
  DELETE FROM public.task_comments WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  RESET ROLE;
  SELECT count(*) INTO n FROM public.task_comments WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  IF n <> 1 THEN
    RAISE EXCEPTION 'review comments must stay in the history';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.task_comments WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  RESET ROLE;
  SELECT count(*) INTO n FROM public.task_comments WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  IF n <> 0 THEN
    RAISE EXCEPTION 'admin should be able to delete a chat message';
  END IF;
END $$;

-- Reviewer who is not an assignee can see the task and its participants.
DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.tasks WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF n <> 1 THEN
    RAISE EXCEPTION 'reviewer should be able to open the task';
  END IF;
  SELECT count(*) INTO n FROM public.list_task_discussion_participants('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  IF n < 2 THEN
    RAISE EXCEPTION 'reviewer should see teammates on the task, saw %', n;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_task_discussion_participants('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    WHERE id IN (
      '44444444-4444-4444-8444-444444444444',
      '66666666-6666-4666-8666-666666666666',
      '22222222-2222-4222-8222-222222222222'
    )
  ) THEN
    RAISE EXCEPTION 'picker leaked the caller, another org, or an outsider';
  END IF;
END $$;

-- Realtime identity
DO $$
DECLARE
  ident CHAR;
  published INTEGER;
BEGIN
  SELECT relreplident INTO ident FROM pg_class WHERE relname = 'task_comments';
  IF ident <> 'f' THEN
    RAISE EXCEPTION 'task_comments replica identity should be FULL';
  END IF;
  SELECT count(*) INTO published
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND tablename IN ('task_comments', 'task_attachments');
  IF published <> 2 THEN
    RAISE EXCEPTION 'discussion tables should be in supabase_realtime, saw %', published;
  END IF;
END $$;

SELECT 'task_discussion_ok' AS result;
