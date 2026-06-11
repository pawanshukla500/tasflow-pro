-- Reschedule the daily due-reminders job to 02:30 UTC Mon-Sat.
-- The job is created outside this migration chain (dashboard / deploy script),
-- so skip silently when it does not exist on a fresh project.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'send-due-reminders-daily';
  if v_job_id is not null then
    perform cron.alter_job(job_id := v_job_id, schedule := '30 2 * * 1-6');
  end if;
end $$;
