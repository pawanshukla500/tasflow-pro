# Email notification system

## Policy
- **No email on every task create/import** — in-app notification only (`notify-task-assigned` with `sendEmail: false`).
- **Daily pending briefing** at **10:00 IST** via `send-daily-digest` for every active user (opt-out: Settings → Daily digest).
- **Friday management overview** at **09:00 IST** via `send-weekly-pending-report` for System Admin / MD.
- Assignment email template remains for rare/urgent cases (`sendEmail: true`).

## Branding
- Shell: `supabase/functions/_shared/transactional-email-templates/_layout.tsx`
- Palette: Soft UI teal (`#0D9488`), Plus Jakarta Sans stack, PNG logo (`EMAIL_LOGO_URL` / `youthnic-logo.png`)
- Auth emails (signup, invite, magic link, OTP, recovery) use the same shell

## Templates
| Key | Purpose |
|-----|---------|
| `daily-digest` | Morning pending summary |
| `weekly-leadership-insight` | Friday Admin/MD department + productivity overview |
| `welcome-user` | New member credentials |
| `password-reset` | App-initiated reset |
| `task-assigned` | Optional urgent assignment |
| `task-due-reminder` | Due/overdue reminder batch |
| `task-completed` | Completion notice (when wired) |
| `department-daily-summary` | Manager dept digest |
| `monthly-report` | Monthly Admin/MD rollup |
| `workflow-stage-assigned` | Workflow handoff |
| `generic-notification` | Fallback |

## Deploy
```bash
npx supabase db push --include-all
npx supabase functions deploy notify-task-assigned send-daily-digest send-weekly-pending-report send-transactional-email auth-email-hook --project-ref nekdjoquirhecmejuoba
```
Confirm Edge secret `EMAIL_LOGO_URL=https://task.youthnic.shop/youthnic-logo.png`.
