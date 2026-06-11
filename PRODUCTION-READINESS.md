# TaskFlow Pro — Production deployment

## Backend (Supabase)

```powershell
cd C:\Users\shukl\Desktop\Taskflow
npx supabase db push --include-all
node scripts/upload-email-secrets.mjs
node scripts/upload-firebase-secret.mjs
.\scripts\setup-email.ps1
```

### Report email schedules (one-time)

1. Open Supabase Dashboard → SQL Editor
2. Edit `scripts/setup-report-cron.sql` — replace `<SERVICE_ROLE_KEY>` with your service_role key
3. Run the script

| Job | Time (IST) | Recipients |
|-----|------------|------------|
| `send-daily-digest` | 08:00 daily | All users + MD/Admin executive snapshot |
| `send-department-daily-summary` | 08:30 daily | Department managers |
| `send-weekly-pending-report` | Monday 09:00 | MD / System Admin |
| `send-monthly-report` | 1st of month 09:00 | MD / System Admin |

## Frontend — Google Cloud Run

```powershell
docker build `
  --build-arg VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=eyJ... `
  --build-arg VITE_FIREBASE_API_KEY=... `
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=... `
  --build-arg VITE_FIREBASE_PROJECT_ID=... `
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=... `
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=... `
  --build-arg VITE_FIREBASE_APP_ID=... `
  -t gcr.io/YOUR_PROJECT/taskflow .

gcloud run deploy taskflow --image gcr.io/YOUR_PROJECT/taskflow --port 8080 --allow-unauthenticated
```

## Role-based access

| Role | Access |
|------|--------|
| MD / System Admin | All modules, users, departments, workflows, reports |
| Department Manager | Own department users, tasks, reports, performance |
| Employee | Assigned tasks, personal dashboard, workflows they participate in |

## Smoke test checklist

- Sign in as Admin, Manager, and Employee
- Admin creates task → assignee dashboard updates (realtime)
- Manager sees only department tasks in Reports
- Employee cannot open `/team` or `/departments`
- Password reset + welcome emails via Resend
