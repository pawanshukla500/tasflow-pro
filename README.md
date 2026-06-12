# TaskFlow Pro by VB Exports

Team task & workflow management for **Youthnic / VB Exports** — inspired by **Asana**, **Monday.com**, and **ClickUp**, built on **Supabase** (PostgreSQL + Auth) and **Firebase** (file storage).

---

## Quick start

```powershell
# 1. Copy environment file (all vars documented in one place)
copy .env.example .env

# 2. Install & run
run.bat
# → http://localhost:8080
```

Set **Supabase Edge Function secrets** in Dashboard (backend section in `.env.example`).

Apply new migrations (subtasks, etc.):

```powershell
npx supabase db push
```

---

## How the product works (Asana / Monday mental model)

| Concept | TaskFlow Pro | Asana / Monday equivalent |
|--------|--------------|---------------------------|
| **Task** | Title, assignees, due date, priority, status | Task / Item |
| **Subtasks** | Checklist under a task (new) | Subtasks / Checklist |
| **Board** | Kanban columns by status | Board view |
| **My Tasks** | Filter: assigned to me, by me, overdue | My tasks |
| **Workflows** | Multi-stage approval chains with TAT | Custom workflows / automations |
| **Goals** | Measurable targets with progress | Goals / OKRs |
| **Departments** | Teams with colors & managers | Teams / Groups |
| **Inbox** | Internal chat + notifications | Messages |
| **Reports** | CSV export, monthly reports | Dashboards / Reporting |

### Typical flows

**Employee**
1. Sign in → **Home** dashboard (due today, overdue, KPIs)
2. **My Tasks** → work assigned to you; tick subtasks as you go
3. **Board** → drag cards between To Do → In Progress → Done
4. **Inbox** → chat with teammates

**Manager / HR**
1. **New Task** (sidebar) → assign doers, add subtasks, attach files
2. **Workflows** → launch template (e.g. purchase approval)
3. **Team** → create users (welcome email sent automatically)
4. **Reports** → export or review performance

**Admin / MD**
- Full visibility across departments, goals, workflows, settings

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React SPA (Vite)          src/lib/env.ts ← .env        │
│  Pages, Board, Workflows, CreateTaskModal + Subtasks    │
└───────────────────────────┬─────────────────────────────┘
                            │ supabase-js
┌───────────────────────────▼─────────────────────────────┐
│  Supabase                                                 │
│  • PostgreSQL (tasks, subtasks, workflows, profiles…)   │
│  • Auth (login, roles, RLS)                             │
│  • Edge Functions (email, uploads, team create)         │
└───────────────┬─────────────────────┬───────────────────┘
                │                     │
         Gmail API              Firebase Storage
    (HTML welcome mail)         (attachments, avatars)
```

**PostgreSQL** is hosted by Supabase — the app never opens a raw `postgres://` connection from the browser. All data goes through the Supabase client with **Row Level Security**.

---

## Environment variables (single file)

| File | Purpose |
|------|---------|
| **`.env.example`** | Master list — frontend `VITE_*` + backend secrets (commented) |
| **`.env`** | Your local values — frontend + backend in one file |
| **`secrets/firebase-service-account.json`** | Firebase service account (download from Firebase Console) |
| **`src/lib/env.ts`** | Frontend reads all `VITE_*` vars |
| **`supabase/functions/_shared/env.ts`** | Edge functions read backend secrets |

### Frontend (`.env` — `VITE_*` only)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | `https://nekdjoquirhecmejuoba.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Anon key from Dashboard → API |
| `VITE_SUPABASE_PROJECT_ID` | Yes | `nekdjoquirhecmejuoba` |
| `VITE_APP_URL` | Recommended | App URL for links |
| `VITE_FIREBASE_*` | For uploads | Firebase web config (public) |

### Backend (same `.env` file — no `VITE_` prefix)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Direct Postgres: `postgresql://postgres:...@db.nekdjoquirhecmejuoba.supabase.co:5432/postgres` |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | API keys from Dashboard |
| `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` | Path to `./secrets/firebase-service-account.json` (local) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Inline JSON in Supabase Dashboard secrets (production) |
| `FIREBASE_STORAGE_BUCKET` | Firebase bucket name |
| `GMAIL_*` / `EMAIL_LOGO_URL` / `APP_URL` | Email sending |

**Note:** The React app does **not** use `DATABASE_URL` directly — it uses `VITE_SUPABASE_URL` + anon key. `DATABASE_URL` is for migrations (`npx supabase db push`).

---

## Key features

### Tasks & subtasks
- Create from sidebar (**⌘K** search, **New Task**)
- **Subtasks**: break work into steps (like Asana checklists) — add at create or edit time
- Statuses: To Do → In Progress → In Review → Done / Blocked
- Recurring tasks (daily / weekly / monthly)
- Assign multiple doers; department scoping

### Workflows
- Template → instance → stage progression
- Decision branches (yes/no), TAT escalation, custom fields

### Roles
`managing_director`, `system_admin`, `department_manager`, `hr`, `employee` — sidebar and RLS enforce access.

### Email
Branded HTML via **Gmail API** (not Resend). Welcome email on team member create.

### AI tools (MCP)
Connect external AI clients (Claude, ChatGPT, …) to TaskFlow Pro via a hosted **MCP server**
(`supabase/functions/mcp-server`, Streamable HTTP). Each user generates a **Personal Access Token**
in **Settings → Integrations → AI Connections**, then adds the server to their AI client:

```json
{
  "mcpServers": {
    "taskflow-pro": {
      "type": "http",
      "url": "https://<project>.supabase.co/functions/v1/mcp-server",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}
```

The token maps to one user; every tool call runs under that user's Supabase RLS scope, so the AI can
only see/do what the user could. Tools cover tasks, subtasks, workflows, departments and people.
Deploy: `npx supabase db push` then `npx supabase functions deploy mcp-server issue-mcp-token`.

### Automatic deploy (GitHub Actions)

Pushes to `main` auto-deploy **Cloud Run** (frontend) and **Supabase** (migrations + edge functions including MCP).

**One-time setup** — add 3 GitHub repo secrets (`Settings → Secrets → Actions`):

| Secret | How to get it |
|--------|----------------|
| `GCP_SA_KEY` | In Cloud Shell: `bash scripts/setup-gcp-github-actions.sh` → paste JSON into GitHub |
| `SUPABASE_ACCESS_TOKEN` | [Supabase account tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → Project Settings → Database |

If secrets are missing, the workflow fails with a clear error (not a cryptic auth message).

**Cloud Shell** (manual fallback):

```bash
export PROJECT_ID=robust-solution-425310-t9
export SUPABASE_ACCESS_TOKEN='sbp_...'
export SUPABASE_DB_PASSWORD='...'
bash scripts/deploy-all-cloudshell.sh
```

`supabase login` is **not** needed when `SUPABASE_ACCESS_TOKEN` is set.

---

## Scripts

| Command | Description |
|---------|-------------|
| `run.bat` | Install deps + dev server |
| `build.bat` | Production build → `dist/` |
| `npm test` | Vitest |
| `npx supabase db push` | Apply SQL migrations |
| `npx supabase functions deploy <name>` | Deploy edge function |

---

## Project structure

```
src/
  pages/           Route screens (Dashboard, Board, MyTasks, Workflows…)
  components/      UI + CreateTaskModal, SubtaskEditor, AppSidebar
  hooks/           useTasks (fetch + enrich tasks/subtasks)
  contexts/        Auth, Theme
  lib/env.ts       ← all frontend env
  integrations/    supabase client, firebase client

supabase/
  migrations/      PostgreSQL schema + RLS
  functions/       Edge Functions (email, upload, team)
    _shared/env.ts ← all backend env names
```

---

## Database (main tables)

| Table | Purpose |
|-------|---------|
| `tasks` | Core work items |
| `task_subtasks` | Checklist items per task |
| `task_assignees` | Many-to-many assignees |
| `task_attachments` | File metadata (Firebase URLs) |
| `workflows` / `workflow_stages` | Approval pipelines |
| `profiles` / `user_roles` | Users & permissions |
| `departments` | Org structure |
| `goals` / `kras` / `kpis` | Performance tracking |

---

## License

Private — VB Exports / Youthnic.
