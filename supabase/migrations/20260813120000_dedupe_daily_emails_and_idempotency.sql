-- Fix 1: Users were getting TWO near-identical "pending tasks" emails every
-- weekday morning — 08:00 IST from `send-due-reminders` (task-due-reminder
-- template) and 09:30 IST from `send-daily-digest` (daily-digest template).
-- `send-daily-digest` is the current, fuller-featured, documented system
-- (workflow stages, priority breakdown, org-level opt-out) — see
-- docs/EMAIL-SYSTEM.md. The older `send-due-reminders-daily` cron job was
-- never unscheduled when `send-daily-digest` replaced it. Retire it here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-due-reminders-daily') THEN
    PERFORM cron.unschedule('send-due-reminders-daily');
  END IF;
END $$;

-- Fix 2: `send-transactional-email` has accepted an `idempotencyKey` for every
-- digest/report call (e.g. `daily-digest-2026-08-13-<user>`) and threaded it
-- into the queue payload, but nothing ever checked it — the only replay guard
-- was on `message_id`, which is a fresh random UUID per call. So a double
-- cron fire, a retried request, or an accidental manual re-trigger of a
-- digest function would email every recipient twice with no protection.
-- Persist the key and enforce it with a real uniqueness constraint.
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_idempotency_key_unique
  ON public.email_send_log(idempotency_key) WHERE idempotency_key IS NOT NULL;
