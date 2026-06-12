-- Schedule gmail-sync edge function every 15 minutes (when vault secret exists).

DO $$
DECLARE
  v_secret_present BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'gmail_cron_key'
  ) INTO v_secret_present;

  IF NOT v_secret_present THEN
    RAISE NOTICE 'Skipping gmail-sync cron: vault secret gmail_cron_key not yet present.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gmail-sync') THEN
    PERFORM cron.unschedule('gmail-sync');
  END IF;

  PERFORM cron.schedule(
    'gmail-sync',
    '*/15 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://nekdjoquirhecmejuoba.supabase.co/functions/v1/gmail-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-service-key', coalesce(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gmail_cron_key'),
          ''
        )
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;
