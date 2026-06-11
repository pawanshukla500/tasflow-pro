-- App-issued password reset tokens (no Firebase sendOobCode — avoids rate limits).

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  last_email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash_active
  ON public.password_reset_tokens (token_hash)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email_active
  ON public.password_reset_tokens (lower(email), expires_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
-- Edge functions only (service role).
