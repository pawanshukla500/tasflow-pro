# AGENTS.md

## Cursor Cloud specific instructions

### Product / services
- **TaskFlow Pro** — React 18 + Vite + TypeScript SPA (port **8080**) talking to **hosted Supabase** (Postgres/RLS/Edge Functions) and **Firebase Auth/Storage**. There is no local Docker Compose / `supabase start` stack for day-to-day UI work.
- Must-run for local UI: `npm run dev` (after `.env` with `VITE_*` from `.env.example`; public keys also ship in production `https://task.youthnic.shop/runtime-env.js`).
- Auth: Firebase email/password → `firebase-auth` edge function bridges to a Supabase session. Org registration requires a **verified** Firebase email.
- Optional for full E2E: Firebase Storage uploads, Resend email, Google Calendar/AI, MCP tokens.
- **MCP clients:** Sign in to TaskFlow → Settings → Integrations → generate a PAT. Connect Cursor (`~/.cursor/mcp.json` `url` + Bearer), Claude Code (`claude mcp add --transport http`), or Google Antigravity (`serverUrl` + headers). Token = that user’s account (RLS). At the start of coding call `sync_coding_work` (creates the project + a task assigned to you); pass `task_id` + `progress_note` to keep it updated. Docs/PRs/CI stay in git/gh. See `docs/MCP-CLIENTS.md`.

### Commands
- Install: `npm install` (lockfile: `package-lock.json`)
- Dev: `npm run dev` → http://localhost:8080
- Lint: `npm run lint` (repo has many pre-existing eslint issues under `supabase/functions`; prefer scoping to touched files)
- Test: `npm test` (Vitest)
- Build check: `npm run build`

### Non-obvious caveats
- `.env` is gitignored. Without `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`, the SPA still boots but data/auth fail. Copy `.env.example` or mirror production `runtime-env.js` for local cloud agents.
- Creating tasks / exercising My Tasks / Board needs a real signed-in user (test login). The DEV-only route `/__dev__/new-task` opens `CreateTaskModal` for layout checks without auth; assignee lists stay empty under RLS until signed in.
- Task create UI lives in `src/components/CreateTaskModal.tsx` — essentials first (title, description, assignees, due chips, priority); secondary fields are under **More options**.
- **Emails:** React Email shell in `supabase/functions/_shared/transactional-email-templates/_layout.tsx` (teal Soft UI + landscape logo lockup using **PNG** `youthnic-logo.png`, not SVG). Task create awaits `notify-task-assigned` via `invokeEdgeFunction`. Daily pending digests: `send-daily-digest` Mon–Sat **09:30 IST** (skips users with no pending/due work) / `send-due-reminders`. Admin/MD department overlook: `send-weekly-pending-report` on **Friday** 09:00 IST (migration `20260730090000_weekly_leadership_friday.sql`). Set Edge secret `EMAIL_LOGO_URL=https://task.youthnic.shop/youthnic-logo.png`. Deploy email-related functions after template changes.
- **WhatsApp:** KwikEngage Utility templates on assignment (`notify-task-assigned`); Complete/Done inbound webhook `kwikengage-webhook` marks the task done. Credentials live in Vault (`kwikengage_*`), not git. See `docs/WHATSAPP-KWIKENGAGE.md`.
- Do not put `npm run dev`, migrations, or edge deploys in the VM update script; start the Vite server yourself when you need the UI.
