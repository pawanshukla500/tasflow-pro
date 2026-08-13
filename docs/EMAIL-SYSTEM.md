# Email notification system

## Policy
- **No email on every task create/import** — in-app notification only (`notify-task-assigned` with `sendEmail: false`).
- **Daily pending briefing** Mon–Sat at **09:30 IST** via `send-daily-digest` for every active user who has due/pending work (skipped if empty; opt-out: Settings → Daily digest). This is the **only** personal "pending tasks" email — see Deduping below.
- **Department manager summary** daily at **08:30 IST** via `send-department-daily-summary` for users in `department_managers` (team-wide rollup, separate from their own personal digest).
- **Friday management overview** at **09:00 IST** via `send-weekly-pending-report` for System Admin / MD — department-wise completion, top performers, departments needing attention, employee productivity, insights, recommendations.
- **Monthly rollup** on the 1st at **09:00 IST** via `send-monthly-report` for System Admin / MD — org-scoped totals (fixed 2026-08-13: previously mixed every organization's tasks into one number for every recipient).
- Assignment email template remains for rare/urgent cases (`sendEmail: true`).

## Deduping (fixed 2026-08-13)
Every active user used to get **two** near-identical "your pending tasks" emails every weekday: `send-due-reminders` at 08:00 IST (`task-due-reminder` template) and `send-daily-digest` at 09:30 IST (`daily-digest` template). The older cron (`send-due-reminders-daily`) was scheduled in an early migration and never unscheduled when `send-daily-digest` was built to replace it. Migration `20260813120000_dedupe_daily_emails_and_idempotency.sql` unschedules it; `supabase/functions/send-due-reminders/` is kept in source (marked deprecated) but not cron-wired. Do not re-add its cron job without retiring `send-daily-digest` first.

Separately, `send-transactional-email` accepted an `idempotencyKey` from every digest/report call but never enforced it — a double cron fire or manual re-trigger could email everyone twice with no protection. `email_send_log.idempotency_key` now has a real unique index, and the function checks-then-inserts against it before rendering/enqueueing, so a repeat call with the same key is a safe no-op.

## Branding
- Shell: `supabase/functions/_shared/transactional-email-templates/_layout.tsx` — every transactional **and** auth template renders through this one shell, so logo/palette/footer are identical across all mail kinds (verified 2026-08-13: no template bypasses it).
- Palette: Soft UI teal (`#0D9488`), Plus Jakarta Sans stack, PNG logo (`EMAIL_LOGO_URL` / `youthnic-logo.png`)
- Auth emails (signup, invite, magic link, OTP, recovery) use the same shell
- Footer (added 2026-08-13): copyright line + "Manage email preferences" link (→ `/settings?tab=notifications`) + a visible automated-message / confidentiality warning line, in addition to the existing `List-Unsubscribe` header (RFC 8058 one-click).
- `supabase/functions/_shared/gmail-templates.ts` and `_shared/gmail-send.ts` are legacy/unused (no importers) — safe to delete in a follow-up cleanup.

## Templates
| Key | Purpose |
|-----|---------|
| `daily-digest` | Morning pending summary |
| `weekly-leadership-insight` | Friday Admin/MD department + productivity overview |
| `welcome-user` | New member credentials |
| `password-reset` | App-initiated reset |
| `task-assigned` | Optional urgent assignment |
| `task-due-reminder` | Due/overdue reminder batch (template kept for reuse; its `send-due-reminders` cron is retired, see Deduping) |
| `task-completed` | Completion notice (when wired) |
| `department-daily-summary` | Manager dept digest |
| `monthly-report` | Monthly Admin/MD rollup |
| `workflow-stage-assigned` | Workflow handoff |
| `generic-notification` | Fallback |

## Deploy
```bash
npx supabase db push --include-all
npx supabase functions deploy notify-task-assigned send-daily-digest send-department-daily-summary send-weekly-pending-report send-monthly-report send-transactional-email auth-email-hook --project-ref nekdjoquirhecmejuoba
```
Or let GitHub Actions run `scripts/deploy-supabase.sh` on push to `main`
(repairs migration drift, marks already-applied locals, pushes, then runs `scripts/fix-email-crons.sql`).

`db push` applies `20260813120000_dedupe_daily_emails_and_idempotency.sql`, which unschedules the
duplicate `send-due-reminders-daily` cron and adds the `email_send_log.idempotency_key` unique index —
run it before/with the function deploy above, not after, so the dedupe guard is live before any digest fires.

If cron still shows the old time, run `scripts/fix-email-crons.sql` in the SQL Editor.

Confirm Edge secrets:
- `EMAIL_LOGO_URL=https://task.youthnic.shop/youthnic-logo.png`
- `APP_URL=https://task.youthnic.shop`
