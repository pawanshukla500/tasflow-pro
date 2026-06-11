# TaskFlow Pro — Go-Live Checklist (task.youthnic.shop)

Backend status (verified 2026-06-11): all 30 DB migrations applied, all 19 edge
functions deployed, auth bridge tested end-to-end, email pipeline tested up to
Gmail authorization (see step 4 — the only remaining blocker).

---

## 1. Deploy the frontend (Firebase Hosting)

```powershell
cd C:\Users\shukl\Desktop\Taskflow
npm run build
npx firebase-tools login          # one time, opens browser
npx firebase-tools deploy --only hosting
```

`firebase.json` + `.firebaserc` are already configured (SPA rewrites, asset
caching, project `taskflow-pro-by-vb-exports`).

## 2. Connect the custom domain

1. Firebase Console → Hosting → **Add custom domain** → `task.youthnic.shop`
2. Add the TXT (verification) and A/CNAME records it shows at your
   youthnic.shop DNS provider
3. Wait for the SSL certificate to provision (minutes to a few hours)

## 3. Firebase Auth settings for the new domain

1. **Authorized domains**: Firebase Console → Authentication → Settings →
   Authorized domains → add `task.youthnic.shop`
   (without this, sign-in from the production site is rejected)
2. **Password-reset emails**: Authentication → Templates → Password reset →
   edit the **Action URL** to `https://task.youthnic.shop/reset-password`
   so reset links open the in-app page (src/pages/ResetPassword.tsx)

## 4. Gmail sending — REQUIRED, currently failing

Every email currently fails at the last step with:
`invalid_grant: Invalid email or User ID` — the service account is not yet
allowed to send as `noreply@youthnic.shop`. Fix (one time, ~5 minutes):

1. The mailbox must exist: in Google Workspace for **youthnic.shop**, create
   user `noreply@youthnic.shop` (or pick an existing user and update the
   `GMAIL_SENDER_EMAIL` secret to match).
2. Go to **admin.google.com** (Workspace admin for youthnic.shop) →
   Security → Access and data control → API controls →
   **Domain-wide delegation** → Add new:
   - **Client ID:** `102728116474999691257`
     (service account `firebase-adminsdk-fbsvc@taskflow-pro-by-vb-exports.iam.gserviceaccount.com`)
   - **OAuth scope:** `https://www.googleapis.com/auth/gmail.send`
3. Wait ~10 minutes for propagation, then re-test from the app (create a team
   member) and check Settings → Admin → audit/email log, or:
   `GET /rest/v1/email_send_log?order=created_at.desc&limit=1` → status `sent`.

## 5. Optional: email retry cron

Immediate sending already works without this. To auto-retry transient
failures, run `supabase/setup-email-cron.sql` in Dashboard → SQL Editor
(paste your service_role key where indicated first).

## 6. Edge function secrets (already set)

`FIREBASE_WEB_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
`FIREBASE_STORAGE_BUCKET`, `GMAIL_SENDER_EMAIL`, `GMAIL_FROM_NAME`,
`APP_URL=https://task.youthnic.shop` — manage with
`npx supabase secrets list`.

## 7. Post-deploy smoke test

1. Open https://task.youthnic.shop → sign in with your org admin account
2. Team → Add member → confirm the welcome email arrives (after step 4)
3. Settings → Profile → Change Password → verify old password stops working
4. Login → Forgot password → confirm the reset email links to
   task.youthnic.shop/reset-password
