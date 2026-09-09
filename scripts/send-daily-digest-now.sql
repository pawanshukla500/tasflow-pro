-- Queue send-daily-digest once via pg_net (same headers as the 09:30 IST cron).
-- CI substitutes __DIGEST_URL__ with https://$PROJECT_REF.supabase.co/functions/v1/send-daily-digest
-- so this never posts to a hardcoded production host.
-- Safe to re-run: the function's idempotency key is daily-digest-<IST date>-<user>.

DO $$
DECLARE
  cron_key text;
BEGIN
  SELECT decrypted_secret INTO cron_key
  FROM vault.decrypted_secrets
  WHERE name = 'report_cron_service_role_key';

  IF cron_key IS NULL OR length(cron_key) < 16 THEN
    RAISE EXCEPTION 'report_cron_service_role_key missing; not queueing daily digest';
  END IF;

  PERFORM net.http_post(
    url := '__DIGEST_URL__',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_key,
      'x-internal-service-key', cron_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
END $$;
