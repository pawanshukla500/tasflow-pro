-- Provision daily/weekly report email cron jobs.
--
-- Previously these jobs only ran after manually executing scripts/setup-report-cron.sql
-- with the service role key. Production had gmail_cron_key but not
-- report_cron_service_role_key, so send-due-reminders and send-daily-digest never fired.
--
-- This migration copies the existing gmail_cron_key (same service role) into
-- report_cron_service_role_key when missing, then schedules all report crons.

DO $$
DECLARE
  v_key TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'report_cron_service_role_key') THEN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'gmail_cron_key'
    LIMIT 1;

    IF v_key IS NULL OR length(v_key) = 0 THEN
      RAISE NOTICE 'Skipping report email cron setup: neither report_cron_service_role_key nor gmail_cron_key is present.';
      RETURN;
    END IF;

    PERFORM vault.create_secret(v_key, 'report_cron_service_role_key');
    RAISE NOTICE 'Created report_cron_service_role_key from gmail_cron_key.';
  END IF;

  -- User task due / pending reminder — Mon–Sat 08:00 IST (02:30 UTC)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-due-reminders-daily') THEN
    PERFORM cron.unschedule('send-due-reminders-daily');
  END IF;
  PERFORM cron.schedule(
    'send-due-reminders-daily',
    '30 2 * * 1-6',
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-due-reminders',
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

  -- Daily user digest — 08:00 IST (02:30 UTC)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest') THEN
    PERFORM cron.unschedule('send-daily-digest');
  END IF;
  PERFORM cron.schedule(
    'send-daily-digest',
    '30 2 * * *',
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

  -- Department manager summary — 08:30 IST (03:00 UTC)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-department-daily-summary') THEN
    PERFORM cron.unschedule('send-department-daily-summary');
  END IF;
  PERFORM cron.schedule(
    'send-department-daily-summary',
    '0 3 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-department-daily-summary',
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

  -- Weekly executive insight — Monday 09:00 IST (03:30 UTC)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-pending-report') THEN
    PERFORM cron.unschedule('send-weekly-pending-report');
  END IF;
  PERFORM cron.schedule(
    'send-weekly-pending-report',
    '30 3 * * 1',
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-weekly-pending-report',
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

  -- Monthly report — 1st of month 09:00 IST (03:30 UTC)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-monthly-report') THEN
    PERFORM cron.unschedule('send-monthly-report');
  END IF;
  PERFORM cron.schedule(
    'send-monthly-report',
    '30 3 1 * *',
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-monthly-report',
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
