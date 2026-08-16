-- Idempotent: email report crons for TaskFlow Pro.
-- Safe to re-run via SQL Editor or `supabase db query -f` (single statement).
--
-- Daily digest: Mon–Sat 09:30 IST = 04:00 UTC (no Sunday)
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

  -- process-email-queue is what actually calls Resend and sends a queued
  -- email — send-transactional-email also flushes it immediately on every
  -- send, but this is the durable backstop when that immediate flush
  -- doesn't complete (see migration 20260816090000 for the full story).
  -- Re-asserted here every deploy so it can never silently go missing again.
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
        )
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
       OR EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1);
    $cron$
  );

  RAISE NOTICE 'Email crons set: daily digest Mon–Sat 09:30 IST; weekly leadership Friday 09:00 IST; queue flush every minute.';
END $$;
