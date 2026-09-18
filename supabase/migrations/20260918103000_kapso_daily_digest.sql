-- Kapso WhatsApp (Youthnic Operations) for the daily pending-task digest.
-- API key lives in Vault (`kapso_api_key`), never git. Phone number id and
-- template name have safe defaults so only the key must be provisioned.

CREATE OR REPLACE FUNCTION public.kapso_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'api_key', (
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kapso_api_key'
    ),
    'phone_number_id', COALESCE((
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kapso_phone_number_id'
    ), '1306133332581906'),
    'template_daily_digest', COALESCE((
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kapso_template_daily_digest'
    ), 'taskflow_daily_digest'),
    'template_language', COALESCE((
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kapso_template_language'
    ), 'en')
  );
$$;

COMMENT ON FUNCTION public.kapso_config() IS
  'service_role-only Kapso credentials. Never granted to anon/authenticated.';

REVOKE ALL ON FUNCTION public.kapso_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kapso_config() FROM anon;
REVOKE ALL ON FUNCTION public.kapso_config() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kapso_config() TO service_role;

ALTER TABLE public.whatsapp_outbound
  ALTER COLUMN task_id DROP NOT NULL;

ALTER TABLE public.whatsapp_outbound
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'kwikengage',
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'assignment',
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_outbound_idempotency
  ON public.whatsapp_outbound (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_user_purpose_created
  ON public.whatsapp_outbound (user_id, purpose, created_at DESC);
