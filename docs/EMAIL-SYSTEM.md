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
- Palette: Soft UI teal, Plus Jakarta Sans stack, PNG logo (`EMAIL_LOGO_URL` / `youthnic-logo.png`).
- **Palette accuracy (fixed 2026-08-13):** `colors` in `_layout.tsx` is now every hex value converted directly from `src/index.css`'s light-theme HSL tokens (see the comment block above `colors` for the conversion table). `warning` and `success` had drifted to generic Tailwind swatches (`#F59E0B`/`#16A34A`) instead of the app's actual `--warning`/`--success` (`#DB7706`/`#25935F`); `text` was noticeably lighter than the app's real `--foreground`. `primary`/`background`/`border`/`danger` were already accurate (within 1-2 hex digits) and untouched. `department-daily-summary.tsx` had its own hardcoded `#dc2626`/`#f59e0b` bypassing the shared tokens entirely (now uses `colors.danger`/`colors.warning`); `_layout.tsx`'s own card/button shadows and `welcome-user.tsx`'s credential-row glow had the primary's RGB hardcoded too (now `colors.primaryRgb`, kept in sync with `colors.primary`). If `src/index.css` tokens ever change, regenerate hex here the same way — don't hand-pick a "close enough" replacement, and don't hardcode a color/rgba directly in a template; always reference `colors.*`.
- Fonts: same Plus Jakarta Sans stack as `tailwind.config.ts`. Email clients that block remote `@font-face`/Google Fonts (most webmail, Outlook desktop) fall back to the declared system-font stack, same as the CSS `font-family` fallback chain — this is a client limitation, not a config gap.
- **Graphic parity:** added `ProgressBar` to `_layout.tsx` — a table-based percentage bar matching the app's actual `<Progress>` component (`src/components/ui/progress.tsx`: solid primary-teal fill on a pale track, fully rounded; no red/amber/green traffic-light, because the app doesn't do that either). Wired into `weekly-leadership-insight` (per-department completion) and `monthly-report` (org completion), which previously had numbers only, no graphic.
- Auth emails (signup, invite, magic link, OTP, recovery) use the same shell.
- Footer (added 2026-08-13): copyright line + "Manage email preferences" link (→ `/settings?tab=notifications`) + a visible automated-message / confidentiality warning line, in addition to the existing `List-Unsubscribe` header (RFC 8058 one-click).
- (Removed 2026-08-13) `_shared/gmail-templates.ts` / `_shared/gmail-send.ts` were a second, hand-maintained copy of this same shell/palette with no importers — deleted so there's exactly one place the brand theme is defined.

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
