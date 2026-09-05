-- Permanent delivery fix for task-assignment + daily digest email.
--
-- 1. Idempotency unique index previously covered EVERY status, so a `failed`
--    or stuck `pending` row blocked all retries of the same logical email
--    (task-assigned-<task>-<user> never recovered). Restrict uniqueness to
--    in-flight/successful rows so a real failure can be retried.
--
-- 2. Re-assert every mail cron with BOTH Authorization and
--    x-internal-service-key. CI's older fix-email-crons.sql scheduled
--    send-daily-digest with only x-internal-service-key, and the function
--    compared that Vault JWT to the Edge-injected sb_secret_ key with !==,
--    so the 09:30 IST job 401'd while password-reset (direct Resend) worked.

DROP INDEX IF EXISTS public.idx_email_send_log_idempotency_key_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_idempotency_key_unique
  ON public.email_send_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('pending', 'sent');

-- Stale pending rows from the old fire-and-forget queue path must not keep
-- blocking a retry of the same assignment/digest key.
UPDATE public.email_send_log
   SET status = 'failed',
       error_message = COALESCE(error_message, 'stale pending — released for retry')
 WHERE status = 'pending'
   AND created_at < now() - interval '10 minutes';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'report_cron_service_role_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'gmail_cron_key'
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Email crons were not installed: service-role credential is missing from Vault',
      HINT = 'Create report_cron_service_role_key (or gmail_cron_key) in Supabase Vault and redeploy migrations.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'report_cron_service_role_key') THEN
    PERFORM vault.create_secret(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gmail_cron_key' LIMIT 1),
      'report_cron_service_role_key'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-due-reminders-daily') THEN
    PERFORM cron.unschedule('send-due-reminders-daily');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest') THEN
    PERFORM cron.unschedule('send-daily-digest');
  END IF;
  PERFORM cron.schedule(
    'send-daily-digest',
    '0 4 * * 1-6',
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
    '0 4 * * 1-6',
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
    '0 3 * * 1-6',
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
    '30 3 * * 5',
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
    '30 3 1 * *',
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
END $$;
