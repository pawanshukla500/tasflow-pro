-- OPTIONAL one-time setup: retry sweep for the email queue.
-- Run in Supabase Dashboard → SQL Editor.
--
-- Normal sends are flushed immediately by send-transactional-email.
-- This cron job re-processes messages that failed transiently (Gmail rate
-- limits, network errors) every minute.
--
-- BEFORE RUNNING: replace <SERVICE_ROLE_KEY> below with the key from
-- Dashboard → Settings → API → service_role. Do not commit the filled-in file.

select vault.create_secret('<SERVICE_ROLE_KEY>', 'email_queue_service_role_key');

select cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from pgmq.q_transactional_emails limit 1)
     or exists (select 1 from pgmq.q_auth_emails limit 1);
  $$
);
