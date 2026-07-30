-- One-shot: move daily digest to 10:00 IST + ensure EMAIL branding secrets note.
-- Safe to re-run. Use if `db push` is blocked by migration history drift.
--
-- Run in: https://supabase.com/dashboard/project/nekdjoquirhecmejuoba/sql/new

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest') THEN
    PERFORM cron.unschedule('send-daily-digest');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'report_cron_service_role_key'
  ) THEN
    RAISE NOTICE 'Skipping: report_cron_service_role_key missing in vault.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'send-daily-digest',
    '30 4 * * *', -- 10:00 IST = 04:30 UTC
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

  RAISE NOTICE 'send-daily-digest cron set to 10:00 IST (30 4 * * *).';
END $$;

-- Verify
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'send-daily-digest',
  'send-weekly-pending-report',
  'send-due-reminders-daily',
  'send-department-daily-summary',
  'send-monthly-report'
)
ORDER BY jobname;
