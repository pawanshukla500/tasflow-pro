-- Schedule (or reschedule) the daily user-level task due / overdue reminder.
--
-- Why this migration exists: the cron job for `send-due-reminders` was
-- previously only set up via the manual `scripts/setup-report-cron.sql`
-- script. If an operator forgot that step, users never received the daily
-- task-due reminder. Migration 20260505041826 only re-scheduled an
-- existing job; it did not create one.
--
-- This migration creates the job idempotently — but only when the vault
-- secret `report_cron_service_role_key` already exists. On a brand-new
-- project the operator still runs `scripts/setup-report-cron.sql` once
-- to populate that secret; after that, subsequent migrations keep the
-- schedule in sync automatically.
--
-- Schedule: 02:30 UTC Mon–Sat (= 08:00 IST). Sundays the function itself
-- short-circuits, so even if cron fires no email is sent.

DO $$
DECLARE
  v_secret_present BOOLEAN;
BEGIN
  -- Only proceed when the vault secret has been provisioned.
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'report_cron_service_role_key'
  ) INTO v_secret_present;

  IF NOT v_secret_present THEN
    RAISE NOTICE 'Skipping send-due-reminders-daily cron schedule: vault secret report_cron_service_role_key not yet present. Run scripts/setup-report-cron.sql once to provision it.';
    RETURN;
  END IF;

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
END $$;
