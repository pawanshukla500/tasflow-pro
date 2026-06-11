-- Scheduled report emails (run once in Supabase Dashboard → SQL Editor).
-- Replace <SERVICE_ROLE_KEY> with your service_role key from Settings → API.
-- Requires pg_cron + pg_net (see migration 20260413130418_email_infra.sql).
-- Skip the vault line if report_cron_service_role_key already exists.

DO $$
BEGIN
  PERFORM vault.create_secret('<SERVICE_ROLE_KEY>', 'report_cron_service_role_key');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Daily user digest — 08:00 IST (02:30 UTC)
select cron.unschedule('send-daily-digest') where exists (
  select 1 from cron.job where jobname = 'send-daily-digest'
);
select cron.schedule(
  'send-daily-digest',
  '30 2 * * *',
  $$
  select net.http_post(
    url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_service_role_key'),
      'x-internal-service-key', (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Department manager summary — 08:30 IST (03:00 UTC)
select cron.unschedule('send-department-daily-summary') where exists (
  select 1 from cron.job where jobname = 'send-department-daily-summary'
);
select cron.schedule(
  'send-department-daily-summary',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-department-daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_service_role_key'),
      'x-internal-service-key', (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Weekly executive insight — Monday 09:00 IST (03:30 UTC)
select cron.unschedule('send-weekly-pending-report') where exists (
  select 1 from cron.job where jobname = 'send-weekly-pending-report'
);
select cron.schedule(
  'send-weekly-pending-report',
  '30 3 * * 1',
  $$
  select net.http_post(
    url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-weekly-pending-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_service_role_key'),
      'x-internal-service-key', (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Monthly report — 1st of month 09:00 IST (03:30 UTC)
select cron.unschedule('send-monthly-report') where exists (
  select 1 from cron.job where jobname = 'send-monthly-report'
);
select cron.schedule(
  'send-monthly-report',
  '30 3 1 * *',
  $$
  select net.http_post(
    url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/send-monthly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_service_role_key'),
      'x-internal-service-key', (select decrypted_secret from vault.decrypted_secrets where name = 'report_cron_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
