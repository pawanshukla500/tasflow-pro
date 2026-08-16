-- Root-cause fix: the daily digest (and every other transactional email)
-- was reliably being ENQUEUED at the right time, but the job that actually
-- SENDS a queued email — process-email-queue — was never guaranteed to run.
--
-- Two things were wrong:
--  1. send-transactional-email tries to flush the queue immediately with an
--     un-awaited `fetch(...).catch(...)` after it returns its response. In a
--     serverless edge runtime that background request is not guaranteed to
--     finish once the response has gone out — see the code fix in
--     send-transactional-email/index.ts (EdgeRuntime.waitUntil) alongside
--     this migration.
--  2. The only *scheduled* backstop for process-email-queue was
--     `supabase/setup-email-cron.sql` — a file explicitly marked "OPTIONAL
--     one-time setup" that requires a human to paste a service-role key into
--     the SQL editor and run it by hand. It was never captured as a
--     migration, never re-asserted by CI (unlike send-daily-digest /
--     send-weekly-pending-report, which scripts/fix-email-crons.sql
--     re-schedules on every deploy), and nothing would notice if it had
--     never been run, or had been dropped.
--
-- Net effect: send-daily-digest firing at 09:30 IST and successfully
-- enqueueing every recipient's email looks completely healthy in logs and
-- in `cron.job`, while the actual Resend send never happens because nothing
-- reliably drains the queue. This migration makes process-email-queue a
-- real, idempotent, CI-verified cron job like the others, reusing the
-- already-provisioned report_cron_service_role_key instead of the
-- separate/likely-never-provisioned email_queue_service_role_key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'report_cron_service_role_key'
  ) THEN
    RAISE NOTICE 'Skipping process-email-queue cron: report_cron_service_role_key missing.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    PERFORM cron.unschedule('process-email-queue');
  END IF;

  -- Every minute (pg_cron's minimum granularity) is far more than enough —
  -- this only needs to drain whatever send-transactional-email enqueued,
  -- not hit any real-time target. The WHERE clause keeps idle minutes cheap.
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
END $$;
