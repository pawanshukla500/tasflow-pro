-- Alias of scripts/fix-email-crons.sql (kept for older docs/links).
-- Must stay in lockstep with the canonical file: an older copy scheduled
-- send-daily-digest WITHOUT Authorization and would re-break delivery if re-run.
--
-- Daily digest: Mon–Sat 09:30 IST = 04:00 UTC (no Sunday)
-- Dept manager summary: daily 08:30 IST = 03:00 UTC
-- Admin daily overview: Mon–Sat 09:30 IST = 04:00 UTC
-- Weekly leadership (Admin/MD): Friday 09:00 IST = 03:30 UTC
-- Monthly report: 1st of month 09:00 IST = 03:30 UTC
-- Queue worker: every minute when mail is waiting
--
-- EVERY cron job MUST send BOTH:
--   Authorization: Bearer <vault report_cron_service_role_key>
--   x-internal-service-key: <same>
-- Edge functions accept the current sb_secret_ key OR a legacy service_role JWT.
-- Sending only x-internal-service-key with a Vault JWT used to 401 daily digest
-- because the function compared it to SUPABASE_SERVICE_ROLE_KEY with !==.
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

  -- send-due-reminders-daily duplicated send-daily-digest (two "pending
  -- tasks" emails every weekday, 08:00 and 09:30 IST). Never reschedule it.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-due-reminders-daily') THEN
    PERFORM cron.unschedule('send-due-reminders-daily');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest') THEN
    PERFORM cron.unschedule('send-daily-digest');
  END IF;

  PERFORM cron.schedule(
    'send-daily-digest',
    '0 4 * * 1-6', -- Mon–Sat 09:30 IST
    $cron$
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
    $cron$
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-admin-daily-overview') THEN
    PERFORM cron.unschedule('send-admin-daily-overview');
  END IF;

  PERFORM cron.schedule(
    'send-admin-daily-overview',
    '0 4 * * 1-6', -- Mon–Sat 09:30 IST — company-wide pending snapshot for Admin/MD
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-admin-daily-overview',
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
    $cron$
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-department-daily-summary') THEN
    PERFORM cron.unschedule('send-department-daily-summary');
  END IF;

  PERFORM cron.schedule(
    'send-department-daily-summary',
    '0 3 * * *', -- daily 08:30 IST
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-department-daily-summary',
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
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    );
    $cron$
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-monthly-report') THEN
    PERFORM cron.unschedule('send-monthly-report');
  END IF;

  PERFORM cron.schedule(
    'send-monthly-report',
    '30 3 1 * *', -- 1st of month 09:00 IST
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-monthly-report',
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
    $cron$
  );

  -- process-email-queue is the durable backstop when an immediate Resend send
  -- is rate-limited. Re-asserted here every deploy so it can never go missing.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    PERFORM cron.unschedule('process-email-queue');
  END IF;

  PERFORM cron.schedule(
    'process-email-queue',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/process-email-queue',
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
    )
    WHERE EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
       OR EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1);
    $cron$
  );

  RAISE NOTICE 'Email crons set: daily digest + admin overview Mon–Sat 09:30 IST; dept summary daily 08:30 IST; weekly leadership Friday 09:00 IST; monthly on the 1st; queue flush every minute. All jobs send Authorization + x-internal-service-key.';
END $$;
