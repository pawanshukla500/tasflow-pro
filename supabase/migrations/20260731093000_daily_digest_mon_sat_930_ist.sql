-- Daily pending digest: Mon–Sat 09:30 IST (04:00 UTC). No Sunday send.
-- Edge function skips users with no pending tasks / active workflow stages.

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
    '0 4 * * 1-6', -- Mon–Sat 09:30 IST
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
