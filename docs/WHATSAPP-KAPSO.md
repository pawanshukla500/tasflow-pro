# Daily pending-task WhatsApp (Kapso)

Every active teammate already has a **country-coded** mobile on Team
(`+91 …`). The 09:30 IST daily digest (Mon–Sat) now also sends a **consolidated**
WhatsApp to that number via Kapso — same pending / overdue / due-soon counts as
the email.

**From number:** Youthnic Operations `+91 99982 49498` (Kapso project
Youthnic Automation, phone number id `1306133332581906`).

**Template:** Utility `taskflow_daily_digest` (`en`), Meta template id
`1615149666924073`. Body is name, date, overdue / due-soon / pending /
workflow counts, plus a short highlights line. Button opens
https://task.youthnic.shop/my-tasks

Assignment alerts stay on KwikEngage. This path is digest-only.

## Secrets (Vault, never git)

| Vault name | Purpose |
| --- | --- |
| `kapso_api_key` | Kapso project API key (`X-API-Key`). Create in Kapso → Integrations → API keys |
| `kapso_phone_number_id` | Optional override (default `1306133332581906`) |
| `kapso_template_daily_digest` | Optional override (default `taskflow_daily_digest`) |
| `kapso_template_language` | Optional override (default `en`) |

Edge reads them through `kapso_config()` (service_role only). You can also set
edge secret `KAPSO_API_KEY`.

Until `kapso_api_key` is set, email still goes out and WhatsApp is logged
`skipped_no_kapso_key`.

## Who gets it

- Active profiles with a parseable mobile (`+91` / 10-digit India → `91XXXXXXXXXX`)
- At least one pending task or workflow stage
- Settings → Notifications → **WhatsApp (assignment + daily digest)** is on (default)

Skipped: no pending work, no phone, opted out, duplicate same IST day.

## After merge: admin numbers too

CI queues `send-daily-digest` once after functions deploy
(`scripts/send-daily-digest-now.sql`) with `{"smoke_admins": true}`. Everyone
with pending work still gets the real digest. Then **MD / system_admin**
phones also get a WhatsApp even if they have nothing pending:

- Pawan Shukla `+91 9426279142` (system_admin)
- Vaibhav Bajaj `+91 7227076777` (MD)
- Nidhi Bajaj `+91 9825149497` (MD)

Same-day real digest still dedupes. The scheduled 09:30 IST cron body is `{}`
and does **not** send this empty admin smoke.

## Opt-out

Settings → Notifications → WhatsApp toggle.
