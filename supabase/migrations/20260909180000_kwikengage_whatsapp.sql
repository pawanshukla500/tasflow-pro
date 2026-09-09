-- KwikEngage WhatsApp: Vault-backed config RPC, assignment opt-in, outbound
-- log used when a Complete reply/button should mark the TaskFlow task done.
-- API keys are stored in Vault (not git) via Dashboard/MCP.

CREATE OR REPLACE FUNCTION public.kwikengage_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'api_key', (
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kwikengage_api_key'
    ),
    'merchant_id', (
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kwikengage_merchant_id'
    ),
    'template_task_assigned', COALESCE((
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kwikengage_template_task_assigned'
    ), 'test_template'),
    'template_language', COALESCE((
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kwikengage_template_language'
    ), 'en'),
    'webhook_secret', (
      SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'kwikengage_webhook_secret'
    )
  );
$$;

COMMENT ON FUNCTION public.kwikengage_config() IS
  'service_role-only KwikEngage credentials. Never granted to anon/authenticated.';

REVOKE ALL ON FUNCTION public.kwikengage_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kwikengage_config() FROM anon;
REVOKE ALL ON FUNCTION public.kwikengage_config() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kwikengage_config() TO service_role;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_alerts boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.whatsapp_outbound (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_phone_created
  ON public.whatsapp_outbound (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_task_phone
  ON public.whatsapp_outbound (task_id, phone);

ALTER TABLE public.whatsapp_outbound ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_outbound FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_outbound TO service_role;
