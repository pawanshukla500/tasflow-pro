-- Run in Supabase Dashboard → SQL Editor (applies pending migrations)

\i scripts/apply-notes-table.sql
\i supabase/migrations/20260611140000_password_reset_cache_and_in_app_notifications.sql

-- Or run individually:
-- 1. scripts/apply-notes-table.sql
-- 2. supabase/migrations/20260611140000_password_reset_cache_and_in_app_notifications.sql
