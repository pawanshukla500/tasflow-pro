-- Move daily user digest to 10:00 IST (04:30 UTC).
-- Pending-task summary each morning for every active user (assignment emails on create are off).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest') THEN
    PERFORM cron.unschedule('send-daily-digest');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'report_cron_service_role_key'
  ) THEN
    RAISE NOTICE 'Skipping daily digest reschedule: report_cron_service_role_key missing.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'send-daily-digest',
    '30 4 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-service-key', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'report_cron_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;
