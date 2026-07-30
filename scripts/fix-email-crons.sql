-- Idempotent: email report crons for TaskFlow Pro.
-- Safe to re-run via SQL Editor or `supabase db query -f`.
--
-- Daily digest: 10:00 IST = 04:30 UTC
-- Weekly leadership (Admin/MD): Friday 09:00 IST = 03:30 UTC
--
-- Dashboard: https://supabase.com/dashboard/project/nekdjoquirhecmejuoba/sql/new

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'report_cron_service_role_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'gmail_cron_key'
  ) THEN
    RAISE NOTICE 'Skipping: report_cron_service_role_key / gmail_cron_key missing in vault.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'report_cron_service_role_key') THEN
    PERFORM vault.create_secret(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gmail_cron_key' LIMIT 1),
      'report_cron_service_role_key'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest') THEN
    PERFORM cron.unschedule('send-daily-digest');
  END IF;

  PERFORM cron.schedule(
    'send-daily-digest',
    '30 4 * * *', -- 10:00 IST
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

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-pending-report') THEN
    PERFORM cron.unschedule('send-weekly-pending-report');
  END IF;

  PERFORM cron.schedule(
    'send-weekly-pending-report',
    '30 3 * * 5', -- Friday 09:00 IST
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-weekly-pending-report',
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
      body := '{}'::jsonb
    );
    $cron$
  );

  RAISE NOTICE 'Email crons set: daily digest 10:00 IST; weekly leadership Friday 09:00 IST.';
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
