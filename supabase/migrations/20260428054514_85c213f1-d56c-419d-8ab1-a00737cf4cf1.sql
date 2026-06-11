-- Workflow stage: help requested fields
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS help_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS help_requested_by uuid,
  ADD COLUMN IF NOT EXISTS help_requested_note text,
  ADD COLUMN IF NOT EXISTS help_mention_user_id uuid;

-- New transactional email template tracking is handled in code (registry)
-- No DB changes needed for digest emails (they read from existing tasks).