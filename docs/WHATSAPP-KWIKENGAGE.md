# WhatsApp alerts (KwikEngage)

TaskFlow sends **transactional** assignment alerts over the connected WhatsApp
Business number (`+91 79849 84563`, WABA `1173075567986214`). Email stays the
primary channel. Session (free-form) WhatsApp only works inside Meta’s 24-hour
window, so every business-initiated alert uses an approved **Utility**
template — not Marketing.

## Secrets (Vault, never git)

Set via Dashboard or MCP. Edge reads them through `kwikengage_config()`:

| Vault name | Purpose |
| --- | --- |
| `kwikengage_api_key` | Send-message API key (raw `Authorization` header, not Bearer) |
| `kwikengage_merchant_id` | Merchant id |
| `kwikengage_template_task_assigned` | Approved template name (today: `test_template`) |
| `kwikengage_template_language` | Template language (`en`) |
| `kwikengage_webhook_secret` | Query token for inbound Complete replies |

## Template to create

In KwikEngage **Template Builder**, create a **Utility** template, e.g.
`taskflow_task_assigned`, with a Complete quick-reply. After Meta approves it,
update Vault `kwikengage_template_task_assigned` to that name. Until then the
existing `test_template` is used so assignment sends still go out.

## Inbound Complete → task done

KwikEngage Chats → Setup webhook:

`https://nekdjoquirhecmejuoba.supabase.co/functions/v1/kwikengage-webhook?token=<kwikengage_webhook_secret>`

A Complete / Done reply (or `tf:complete:<taskId>` button payload) marks the
matching TaskFlow task `done` only if we previously logged an outbound row for
that phone + task.

## Opt-out

Settings → Notifications → **Task assignment WhatsApp**. Requires a parseable
mobile number on the profile (`91XXXXXXXXXX`).
