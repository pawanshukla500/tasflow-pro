-- User scratch notes (quick planning / short-term memory)

CREATE TABLE IF NOT EXISTS public.user_scratch_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  polished_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_scratch_notes_user ON public.user_scratch_notes(user_id, updated_at DESC);

ALTER TABLE public.user_scratch_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own scratch notes"
    ON public.user_scratch_notes FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TRIGGER update_user_scratch_notes_updated_at
  BEFORE UPDATE ON public.user_scratch_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
