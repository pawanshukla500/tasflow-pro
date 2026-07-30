# AGENTS.md

## Cursor Cloud specific instructions

### Product / services
- **TaskFlow Pro** — React 18 + Vite + TypeScript SPA (port **8080**) talking to **hosted Supabase** (Postgres/RLS/Edge Functions) and **Firebase Auth/Storage**. There is no local Docker Compose / `supabase start` stack for day-to-day UI work.
- Must-run for local UI: `npm run dev` (after `.env` with `VITE_*` from `.env.example`; public keys also ship in production `https://task.youthnic.shop/runtime-env.js`).
- Auth: Firebase email/password → `firebase-auth` edge function bridges to a Supabase session. Org registration requires a **verified** Firebase email.
- Optional for full E2E: Firebase Storage uploads, Resend email, Google Calendar/AI, MCP tokens.

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
- Do not put `npm run dev`, migrations, or edge deploys in the VM update script; start the Vite server yourself when you need the UI.
