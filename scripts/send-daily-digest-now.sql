-- Queue send-daily-digest once via pg_net (same headers as the 09:30 IST cron).
-- Safe to re-run: the function's idempotency key is daily-digest-<IST date>-<user>,
-- so a second invoke the same IST day does not double-send.
-- CI runs this AFTER edge functions deploy so auth + RPC are already live.

SELECT net.http_post(
  url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-daily-digest',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'report_cron_service_role_key'
    ),
    'x-internal-service-key', (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'report_cron_service_role_key'
    )
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 300000
);
