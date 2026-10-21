-- Quick notes already hide themselves in the app once expires_at passes.
-- This job removes the rows even when nobody opens Notes.
delete from public.user_scratch_notes
where expires_at < now();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-expired-scratch-notes') then
    perform cron.unschedule('purge-expired-scratch-notes');
  end if;

  perform cron.schedule(
    'purge-expired-scratch-notes',
    '15 * * * *',
    $cron$delete from public.user_scratch_notes where expires_at < now();$cron$
  );
end $$;
