-- Guarantee the complete personal digest pipeline is installed.
--
-- Older migrations returned successfully when the cron credential was absent.
-- That made a deployment look healthy while leaving no automatic 09:30 IST
-- trigger (or no queue worker to hand the generated messages to Resend).  A
-- migration is not re-run after a Vault secret is added, so that state could
-- persist indefinitely.  This migration uses the existing Gmail cron service
-- credential as a fallback and fails loudly if neither credential exists.
DO $$
DECLARE
  service_key text;
BEGIN
  SELECT decrypted_secret
    INTO service_key
    FROM vault.decrypted_secrets
   WHERE name = 'report_cron_service_role_key'
   LIMIT 1;

  IF service_key IS NULL THEN
    SELECT decrypted_secret
      INTO service_key
      FROM vault.decrypted_secrets
     WHERE name = 'gmail_cron_key'
     LIMIT 1;

    IF service_key IS NOT NULL THEN
      PERFORM vault.create_secret(service_key, 'report_cron_service_role_key');
    END IF;
  END IF;

  IF service_key IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Daily digest cron was not installed: service-role credential is missing from Vault',
      HINT = 'Create report_cron_service_role_key (or gmail_cron_key) in Supabase Vault and redeploy migrations.';
  END IF;

  -- Keep exactly one personal reminder.  send-due-reminders-daily is the
  -- retired duplicate that previously sent a second morning email.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-due-reminders-daily') THEN
    PERFORM cron.unschedule('send-due-reminders-daily');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest') THEN
    PERFORM cron.unschedule('send-daily-digest');
  END IF;

  PERFORM cron.schedule(
    'send-daily-digest',
    '0 4 * * 1-6', -- 04:00 UTC = 09:30 IST, Monday through Saturday
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

  -- Generating a digest only enqueues it.  This automatic worker is the
  -- durable delivery step that invokes Resend, including when the edge
  -- function's immediate background flush is interrupted.
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
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    )
    WHERE EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
       OR EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1);
    $cron$
  );
END $$;

