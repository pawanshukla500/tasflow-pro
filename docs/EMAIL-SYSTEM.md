# Email notification system

## Delivery pipeline actually sending (fixed 2026-08-16)
Users reported the 09:30 IST digest wasn't arriving. The cron *was* firing on schedule and
`send-daily-digest` *was* successfully enqueueing an email per recipient (confirmed live via CI
deploy logs: `cron.job` showed `send-daily-digest` active on `0 4 * * 1-6`) — the break was one
step later, in what actually sends a queued message:

1. Every enqueue (`send-transactional-email`, `auth-email-hook`) tried to flush the queue
   immediately with a bare, un-awaited `fetch('.../process-email-queue')`. Supabase Edge
   Functions run on an isolate that can be torn down right after the response is sent, so that
   background request isn't guaranteed to finish — the email would sit in `email_send_log` as
   `pending` forever. Fixed in `_shared/flush-email-queue.ts`, used by both callers: it now hands
   the fetch to `EdgeRuntime.waitUntil()` (Supabase's documented API for exactly this) so the
   isolate stays alive until the request actually completes.
2. The only *scheduled* backstop for `process-email-queue` was `supabase/setup-email-cron.sql` —
   a file explicitly marked "OPTIONAL one-time setup" that required a human to paste a
   service-role key into the SQL Editor and run it by hand. It was never a migration, was never
   re-asserted by CI the way `send-daily-digest`/`send-weekly-pending-report` are, and nothing
   would have surfaced if it had never been run or had quietly been dropped. Fixed by migration
   `20260816090000_ensure_process_email_queue_cron.sql`, which schedules `process-email-queue`
   every minute using the already-provisioned `report_cron_service_role_key`, and by adding the
   same job to `scripts/fix-email-crons.sql` so CI re-asserts it on every deploy like the others.

Net effect before this fix: the system looked completely healthy (cron active, function
succeeds, no errors in logs) while the actual Resend send might never happen. After this fix,
either the immediate flush completes reliably, or the once-a-minute cron backstop picks up
anything it missed — so a message can't sit unsent for more than ~60 seconds.

### Automatic scheduling is now deployment-enforced (2026-08-21)
Migration `20260821090000_guarantee_daily_digest_delivery.sql` installs both required jobs as one
unit: `send-daily-digest` at `0 4 * * 1-6` (09:30 IST, Mon–Sat) and
`process-email-queue` every minute when mail is waiting. Earlier scheduling migrations emitted a
notice and completed successfully when `report_cron_service_role_key` was missing. Since applied
migrations are not retried after a secret is later created, production could remain permanently
unscheduled while deploys appeared green. The guarantee migration now copies the already-used
`gmail_cron_key` when available, otherwise fails the deployment with an actionable error. This
prevents a successful release from silently depending on somebody manually triggering a digest.

## Silent suppression was invisible too (fixed 2026-08-17)
Even with delivery actually running, one more failure mode looked identical to success:
`send-transactional-email` returns **HTTP 200** both for a real send *and* for a recipient on the
`suppressed_emails` list (bounce, complaint, or a one-click "Unsubscribe" — trivially triggered by
accident, e.g. via Gmail's automatic `List-Unsubscribe` handling, and plausible during the period
the duplicate-daily-email bug above was live and annoying people) or a deduped idempotency key.
Every caller (`send-daily-digest`, `send-department-daily-summary`, `send-weekly-pending-report`,
`send-monthly-report`, `notify-task-assigned`, `notify-workflow-stage`) was logging **"sent"** as
long as the HTTP call didn't throw, never checking the response body — so a suppressed recipient
got zero emails forever while every log kept reporting success. `_shared/dispatch-transactional-email.ts`
is now used by all six callers and returns the real status (`sent` / `deduped` / `suppressed` /
`failed`) with a reason.

There was also no way to *fix* a suppressed recipient short of a raw SQL `DELETE` — added
`manage-email-suppression` (Admin/MD only, `verify_jwt = true`) plus an "Email Delivery
Diagnostics" panel in Settings → Admin: look up an address, see its suppression status and last
10 send attempts, and remove a suppression in one click (logged to `audit_logs`).

## System Smoke Test (added 2026-08-17)
Every prior fix here closed a real gap, but "digest still not arriving after N deploys" needed a
tool that answers the question directly instead of another round of hypothesis-and-fix. Added
`email-system-smoke-test` (Admin/MD only) + a "System Smoke Test" panel in Settings → Admin. It's
a dry run — sends nothing — and checks, in one click:

1. **Whether Resend can actually deliver to anyone but the account owner.** This is the failure
   mode nothing else here catches: `send-transactional-email` returns success as soon as a
   message is *enqueued*; the real Resend API call happens later inside `process-email-queue`. If
   `EMAIL_FROM` is still the sandbox address (`onboarding@resend.dev`) or the real domain was
   never verified, Resend accepts mail to the account owner's own address and silently rejects
   everyone else — which matches "password reset arrived, a teammate's digest never did" exactly.
   The check calls Resend's own `/domains` API to report real verification status, not a guess.
2. **Whether the daily admin overview and Friday leadership report (same recipient set) have any
   recipients at all** — if nobody currently holds the `managing_director` or `system_admin`
   role, that mail has nowhere to go, silently. Also flags when recipients exist but there are
   zero open tasks org-wide, so the daily overview correctly has nothing to send today.
3. **Every active team member, evaluated against send-daily-digest's exact eligibility rules**
   (profile active, org digest enabled, personal preference, suppression, pending-task count) —
   so "would this specific person get today's digest, and if not, which single check stopped it"
   is answered per person instead of guessed. Admins/MDs are marked with a badge in this same
   list, since they go through identical eligibility rules for their own *personal* digest.
4. **Real send failures from `email_send_log` in the last 48h** — surfaces the actual Resend
   rejection error text when #1 is the cause, without needing dashboard access.

## Admin daily team overview (added 2026-08-18)
Personal digest and the Friday report left a gap: an admin/MD with no tasks personally assigned
to them got no daily visibility into the team's work at all (`send-daily-digest` correctly has
nothing to send them — that's not a bug, see the smoke test section above). Added
`send-admin-daily-overview` — Mon–Sat 09:30 IST, same time as the personal digest — a lean
company-wide pending-tasks snapshot (open/overdue/due-soon totals, department breakdown with a
completion-% progress bar, a "needs attention" callout for departments with 2+ overdue) sent to
every `managing_director`/`system_admin`, skipped when their org has nothing open. Distinct from
`send-weekly-pending-report` (Friday-only, adds top performers / employee productivity / a week's
worth of insights — a heavier weekly retrospective, not a daily one) — the two are complementary,
not duplicates: daily pulse vs. weekly analysis.

## Policy
- **No email on every task create/import** — in-app notification only (`notify-task-assigned` with `sendEmail: false`).
- **Daily pending briefing** Mon–Sat at **09:30 IST** via `send-daily-digest` for every active user who has due/pending work (skipped if empty; opt-out: Settings → Daily digest). This is the **only** personal "pending tasks" email — see Deduping below.
- **Department manager summary** daily at **08:30 IST** via `send-department-daily-summary` for users in `department_managers` (team-wide rollup, separate from their own personal digest).
- **Admin daily team overview** Mon–Sat at **09:30 IST** via `send-admin-daily-overview` for System Admin / MD — company-wide open/overdue/due-soon totals + department breakdown, skipped when nothing's open. See "Admin daily team overview" below.
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
| `admin-daily-overview` | Mon–Sat Admin/MD company-wide pending snapshot |
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
npx supabase functions deploy notify-task-assigned send-daily-digest send-department-daily-summary send-admin-daily-overview send-weekly-pending-report send-monthly-report send-transactional-email auth-email-hook --project-ref nekdjoquirhecmejuoba
```
Or let GitHub Actions run `scripts/deploy-supabase.sh` on push to `main`
(repairs migration drift, marks already-applied locals, pushes, then runs `scripts/fix-email-crons.sql`).

`db push` applies `20260813120000_dedupe_daily_emails_and_idempotency.sql`, which unschedules the
duplicate `send-due-reminders-daily` cron and adds the `email_send_log.idempotency_key` unique index —
run it before/with the function deploy above, not after, so the dedupe guard is live before any digest fires.
It also applies `20260816090000_ensure_process_email_queue_cron.sql` — see "Delivery pipeline
actually sending" above; without this one, digests get enqueued but nothing durable sends them —
and `20260818070000_admin_daily_overview_cron.sql`, which schedules `send-admin-daily-overview`.

If cron still shows the old time, or you need to confirm delivery is actually wired up, run
`scripts/fix-email-crons.sql` in the SQL Editor — it re-asserts `send-daily-digest`,
`send-weekly-pending-report`, and `process-email-queue` together and is safe to re-run anytime.

Confirm Edge secrets:
- `EMAIL_LOGO_URL=https://task.youthnic.shop/youthnic-logo.png`
- `APP_URL=https://task.youthnic.shop`
