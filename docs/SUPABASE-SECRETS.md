# Supabase Secrets — TaskFlow Pro

## Where to open secrets in the dashboard

**Project:** `nekdjoquirhecmejuoba` (task.youthnic.shop)

1. Open: [Supabase Dashboard → Project Settings → Edge Functions](https://supabase.com/dashboard/project/nekdjoquirhecmejuoba/settings/functions)
2. Or navigate: **Project Settings** (gear) → **Edge Functions** → **Secrets**
3. CLI alternative: `npx supabase secrets list --project-ref nekdjoquirhecmejuoba`

> Edge Function secrets are **not** the same as Vault secrets. Use the Edge Functions Secrets page for API keys used by Deno functions.

## Secrets used by this app

| Secret | Used for | Referenced in |
|--------|----------|---------------|
| `GOOGLE_AI_API_KEY` | AI polish notes, daily motivation (`gemma-4-31b-it`) | `supabase/functions/_shared/google-ai.ts`, `polish-note`, `daily-motivation` |
| `RESEND_API_KEY` | Transactional email via Resend | `supabase/functions/_shared/send-email.ts`, `_shared/env.ts` |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | From address / display name | `_shared/send-email.ts`, `_shared/env.ts` |
| `EMAIL_LOGO_URL` | Email header logo (**PNG**, not SVG) | `_shared/transactional-email-templates/_layout.tsx` |
| `APP_URL` | Deep links in emails | `_shared/env.ts`, email templates |
| `SUPABASE_URL` | Edge function DB / function calls | Most edge functions + `_shared/env.ts` |
| `SUPABASE_ANON_KEY` | User-scoped Supabase clients | `firebase-auth`, `mcp-auth`, etc. |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB access | Most edge functions |
| `SUPABASE_AUTH_HOOK_SECRET` | Auth email hook verification | `_shared/env.ts`, `auth-email-hook` |
| `EMAIL_WEBHOOK_SECRET` | Resend webhook verification | `_shared/env.ts` |
| `FIREBASE_WEB_API_KEY` | Firebase Admin REST | `_shared/firebase-admin.ts` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin / Storage | `_shared/load-service-account.ts` |
| `FIREBASE_STORAGE_BUCKET` | File uploads | `_shared/env.ts`, `firebase-upload` |
| `FIREBASE_PROJECT_ID` | Firebase project | `_shared/firebase-admin-auth.ts` |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Calendar OAuth | `_shared/google-oauth.ts` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Calendar OAuth | `_shared/google-oauth.ts` |
| `GOOGLE_OAUTH_REDIRECT_URI` | OAuth callback URL | `_shared/google-oauth.ts` |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Encrypt stored Google tokens | `_shared/google-oauth.ts` |
| `GMAIL_SENDER_EMAIL` / `GMAIL_FROM_NAME` | Legacy email from (fallback) | `_shared/send-email.ts` |

## Frontend env (not Supabase secrets)

Browser-exposed Vite vars live in hosting / local `.env` (see `.env.example`):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_FIREBASE_*`, `VITE_APP_URL`.
