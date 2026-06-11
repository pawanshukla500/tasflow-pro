-- 1. Add 'blocked' workflow_stage status + blocked_reason + last_escalated_at
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_escalated_at TIMESTAMPTZ;

-- Backfill last_escalated_at from escalated_at so re-escalation timer starts correctly
UPDATE public.workflow_stages
  SET last_escalated_at = escalated_at
  WHERE last_escalated_at IS NULL AND escalated_at IS NOT NULL;

-- 2. Workflow stage events (audit trail)
CREATE TABLE IF NOT EXISTS public.workflow_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL,
  workflow_id UUID NOT NULL,
  actor_id UUID,
  event_type TEXT NOT NULL, -- reassigned | tat_extended | nudged | blocked | unblocked | escalated | status_changed | comment
  from_value TEXT,
  to_value TEXT,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wfse_stage ON public.workflow_stage_events(stage_id);
CREATE INDEX IF NOT EXISTS idx_wfse_workflow ON public.workflow_stage_events(workflow_id);

ALTER TABLE public.workflow_stage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stage events"
  ON public.workflow_stage_events FOR SELECT TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR public.user_in_workflow(auth.uid(), workflow_id)
  );

CREATE POLICY "Insert stage events"
  ON public.workflow_stage_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      public.is_admin_or_md(auth.uid())
      OR public.user_in_workflow(auth.uid(), workflow_id)
    )
  );

-- 3. Workflow stage comments
CREATE TABLE IF NOT EXISTS public.workflow_stage_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL,
  workflow_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wfsc_stage ON public.workflow_stage_comments(stage_id);

ALTER TABLE public.workflow_stage_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stage comments"
  ON public.workflow_stage_comments FOR SELECT TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR public.user_in_workflow(auth.uid(), workflow_id)
  );

CREATE POLICY "Add stage comments"
  ON public.workflow_stage_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_admin_or_md(auth.uid())
      OR public.user_in_workflow(auth.uid(), workflow_id)
    )
  );

CREATE POLICY "Delete own stage comments"
  ON public.workflow_stage_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_admin_or_md(auth.uid()));