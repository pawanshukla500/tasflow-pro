# TaskFlow Pro — Claude Code Handoff Prompt

Copy everything below into Claude Code to continue this project.

---

## Project Overview

**TaskFlow Pro by VB Exports** — Enterprise SaaS task & workflow manager (Asana/Monday-style).

| Layer | Stack |
|--------|--------|
| Frontend | React 18 + Vite + TypeScript + shadcn/ui + TanStack Query + React Router v6 |
| Auth | **Firebase Authentication** (email/password) bridged to **Supabase Auth** session for RLS |
| Database | Supabase Postgres (`project_ref`: `nekdjoquirhecmejuoba`) |
| Storage | Firebase Storage (uploads via `firebase-upload` edge function) |
| Email | Gmail API via Supabase Edge Functions (queue: pgmq) |
| Dev server | Port **8080** — run `.\run.bat` |

**Workspace:** `C:\Users\shukl\Desktop\Taskflow`

---

## Current Architecture (Auth)

1. User signs in with **Firebase** (`src/integrations/firebase/auth.ts`)
2. App bridges Firebase ID token → Supabase session via `src/lib/authBridge.ts`:
   - **Primary:** `supabase.auth.signInWithIdToken({ provider: 'firebase', token })` — requires enabling Firebase in Supabase Dashboard → Authentication → Third-party → Firebase
   - **Fallback:** `firebase-auth` edge function (needs deploy + `SUPABASE_SERVICE_ROLE_KEY` secret)
3. Org registration uses **client-side** inserts into `organizations` (no edge function required) — `createOrganizationInDb()` in `authBridge.ts`
4. Postgres RLS uses `auth.uid()` from Supabase session

---

## Organization & Role Model (Target)

```
Organization (e.g. VB EXPORT, domain: vbexports.co.in)
  └── Department (create FIRST in /departments)
        ├── Head of Department (HOD)  → DB role: department_manager
        └── Team Member(s)            → DB role: employee
  └── Managing Director (MD)          → DB role: managing_director
  └── System Admin (org creator)      → DB role: system_admin
```

**Setup order for admins:**
1. Register Org (Login → Register Org tab)
2. Create Departments (`/departments`)
3. Add Team Members (`/team`) — assign role + department

Role labels UI: `src/lib/roleLabels.ts`  
Team page: `src/pages/TeamPage.tsx` (department required for HOD & Team Member)

---

## Environment (`.env`) — CRITICAL

```env
VITE_SUPABASE_URL=https://nekdjoquirhecmejuoba.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key — SET>
VITE_FIREBASE_API_KEY=AIzaSyDR8Yzd58za5h0wlcj-EJp4MdBInPnLePU
VITE_FIREBASE_AUTH_DOMAIN=taskflow-pro-by-vb-exports.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=taskflow-pro-by-vb-exports
SUPABASE_SERVICE_ROLE_KEY=<MUST SET — still REPLACE_ME in .env>
```

**Blockers if not set:**
- `SUPABASE_SERVICE_ROLE_KEY=REPLACE_ME` → edge functions (`create-team-member`, `firebase-auth`) fail
- Firebase third-party auth not enabled in Supabase → bridge falls back to edge function → "Failed to fetch" if function not deployed

---

## Database State

- **ALL 30 migrations applied (2026-06-10)** — workflows, goals, email infra, task_subtasks, chat, KRAs/KPIs, notification_and_digest all live. Migration history repaired (remote-only versions 20260610133753/20260610141613 marked reverted; local 20260413110626 + 20260610200000 marked applied).
- **DB connection:** direct host `db.nekdjoquirhecmejuoba.supabase.co` is IPv6-only (unreachable from IPv4 networks). Use the pooler:
  `postgresql://postgres.nekdjoquirhecmejuoba:<password>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres` (project region: ap-northeast-2 Seoul)
- **Data:** Wiped clean (no demo users in Supabase)
- **Firebase:** May still have user `returnorders@vbexports.co.in` from failed signup attempts — delete in Firebase Console → Authentication → Users for true fresh start

---

## Known Bugs Fixed (Recent)

| Bug | Fix |
|-----|-----|
| `auth/email-already-in-use` on Register Org | `firebaseSignUpOrSignIn()` signs in if email exists |
| `Failed to fetch` on auth | Client-side bridge via `signInWithIdToken` + clearer errors in `authBridge.ts` |
| Register org required undeployed edge function | `createOrganizationInDb()` client-side |
| Team Export CSV broken | Fixed handler |
| HR role missing in UI | Added to role select |
| Route guards missing | `RoleRoute` on manager pages |

---

## Remaining Work (Priority)

### P0 — Must do for production
1. ~~Set `SUPABASE_SERVICE_ROLE_KEY` in `.env`~~ DONE (edge functions get it auto-injected; do not set it as a secret manually)
2. ~~Run `npx supabase db push` to apply all migrations~~ DONE 2026-06-10 via pooler
3. **`npx supabase login`** (one-time, opens browser) then run **`deploy.bat`** — it links the project, sets `FIREBASE_WEB_API_KEY` secret, and deploys all edge functions including `firebase-auth`. This is the ONLY remaining auth blocker.
   - Note: `signInWithIdToken({provider:'firebase'})` is NOT supported by Supabase — that dead path was removed from `authBridge.ts`. Supabase "Firebase third-party auth" is a JWT passthrough that breaks `auth.uid()` UUID RLS; the edge function bridge is the correct architecture.
4. Save Firebase service account JSON to `secrets/firebase-service-account.json` (needed by `firebase-upload`)

### P1 — Features requested
1. **Onboarding wizard** after org registration (Departments → HOD → Team Members)
2. **Daily digest emails** — `send-daily-digest` edge function + pg_cron schedule
3. **Admin panel** — Settings → Admin tab (`AdminSettingsPanel.tsx`) — org settings, audit logs, email config
4. **Multi-tenant RLS** — scope all tables by `organization_id`
5. **UI polish** — mobile nav done; extend PageHeader to all pages

### P2 — Nice to have
- Code-split Vite bundle (currently ~2.9MB)
- Firebase App Hosting or Supabase + Vercel deploy
- Rotate DB password (was shared in chat)

---

## Key Files

```
src/contexts/AuthContext.tsx       # Firebase + Supabase auth state
src/lib/authBridge.ts              # Token bridge + org creation (NEW)
src/lib/roleLabels.ts              # MD / HOD / Team Member labels (NEW)
src/pages/Login.tsx                # Sign in + Register Org
src/pages/DepartmentsPage.tsx      # Create departments first
src/pages/TeamPage.tsx             # Add HOD + Team Members
src/pages/SettingsPage.tsx         # Profile + Admin tab
supabase/functions/
  firebase-auth/                   # Bridge fallback
  register-organization/           # Server-side org (optional now)
  create-team-member/              # Creates Firebase + Supabase user
  send-daily-digest/               # Daily email summary
supabase/migrations/
  20260610200000_multi_tenant_organizations.sql
```

---

## Commands

```powershell
cd C:\Users\shukl\Desktop\Taskflow
.\run.bat                                    # Dev server :8080
npm run build                                # Production build
npx supabase link --project-ref nekdjoquirhecmejuoba
npx supabase db push                         # Apply all migrations
npx supabase functions deploy firebase-auth --project-ref nekdjoquirhecmejuoba
npx supabase functions deploy create-team-member --project-ref nekdjoquirhecmejuoba
```

---

## Test Account (Target)

| Field | Value |
|-------|--------|
| Org | VB EXPORT |
| Domain | vbexports.co.in |
| Admin email | returnorders@vbexports.co.in |
| Auth | Firebase + Supabase bridge |

---

## Instructions for Claude Code

1. Read `README.md` and this handoff first
2. Fix any remaining auth errors by ensuring Supabase Firebase third-party auth OR deployed edge functions
3. Complete onboarding flow: Org → Department → HOD → Team Members
4. Apply all pending DB migrations and verify CRUD on tasks/workflows
5. Do NOT commit unless asked; do NOT push secrets to git
6. Match existing code style (shadcn, sonner toasts, PageHeader pattern)

---

_End of handoff._
