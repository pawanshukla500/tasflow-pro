-- Personal Access Tokens for the MCP server (external AI clients connecting in).
-- Each token belongs to one user; the MCP server resolves token -> user and runs
-- every query under that user's RLS scope. Only the SHA-256 hash is stored.

CREATE TABLE IF NOT EXISTS public.mcp_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tokens_hash_active
  ON public.mcp_access_tokens (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user_active
  ON public.mcp_access_tokens (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.mcp_access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own mcp tokens" ON public.mcp_access_tokens;
CREATE POLICY "Users read own mcp tokens" ON public.mcp_access_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users revoke own mcp tokens" ON public.mcp_access_tokens;
CREATE POLICY "Users revoke own mcp tokens" ON public.mcp_access_tokens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own mcp tokens" ON public.mcp_access_tokens;
CREATE POLICY "Users delete own mcp tokens" ON public.mcp_access_tokens
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mark_mcp_token_used(_token_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.mcp_access_tokens
  SET last_used_at = now()
  WHERE id = _token_id;
$$;
