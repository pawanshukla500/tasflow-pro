-- Daily digest 401: Vault report_cron_service_role_key is a 48-char shared
-- secret (copied from gmail_cron_key), not a JWT and not the Edge-injected
-- sb_secret_ service role. send-daily-digest compared the cron header to
-- SUPABASE_SERVICE_ROLE_KEY and rejected every Mon–Sat 09:30 IST run
-- (pg_net status 401 {"error":"Unauthorized"}; no email_send_log since
-- 2026-07-20). Task-create mail kept working because notify-task-assigned is
-- invoked with a live session, not this Vault secret.
--
-- SECURITY DEFINER RPC lets Edge verify the cron header against Vault without
-- copying the secret into an Edge env. service_role may execute; anon /
-- authenticated cannot. The function never returns the secret.

CREATE OR REPLACE FUNCTION public.internal_cron_key_matches(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    candidate IS NOT NULL
    AND length(candidate) >= 16
    AND EXISTS (
      SELECT 1
      FROM vault.decrypted_secrets s
      WHERE s.name IN ('report_cron_service_role_key', 'gmail_cron_key')
        AND s.decrypted_secret = candidate
    );
$$;

COMMENT ON FUNCTION public.internal_cron_key_matches(text) IS
  'Returns true when candidate equals the Vault cron shared secret. service_role only.';

REVOKE ALL ON FUNCTION public.internal_cron_key_matches(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_cron_key_matches(text) FROM anon;
REVOKE ALL ON FUNCTION public.internal_cron_key_matches(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_cron_key_matches(text) TO service_role;
