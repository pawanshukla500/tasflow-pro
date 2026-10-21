-- Quick notes last 7 days for the person who wrote them, then disappear.
alter table public.user_scratch_notes
  add column if not exists expires_at timestamptz;

update public.user_scratch_notes
set expires_at = created_at + interval '7 days'
where expires_at is null;

alter table public.user_scratch_notes
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

create index if not exists idx_user_scratch_notes_expiry
  on public.user_scratch_notes (user_id, expires_at);
