-- Daily company-wide pending-tasks overview for Managing Directors / System Admins.
-- Mon–Sat 09:30 IST (04:00 UTC) — same time as the personal digest (send-daily-digest).
-- Distinct from that (personal, own tasks only) and from send-weekly-pending-report
-- (Friday-only week-in-review) — this is a lean daily team pulse, skipped when the
-- recipient's org has nothing open.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'report_cron_service_role_key'
  ) THEN
    RAISE NOTICE 'Skipping send-admin-daily-overview cron: report_cron_service_role_key missing.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-admin-daily-overview') THEN
    PERFORM cron.unschedule('send-admin-daily-overview');
  END IF;

  PERFORM cron.schedule(
    'send-admin-daily-overview',
    '0 4 * * 1-6', -- Mon–Sat 09:30 IST
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-admin-daily-overview',
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
