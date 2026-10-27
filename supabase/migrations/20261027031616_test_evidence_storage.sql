-- Test images only. LINE entries and employee data keep their existing tables.
create table public.line_evidence_files (
  reference text primary key check (reference ~ '^supabase:[a-f0-9]{64}$'),
  employee_id text not null check (employee_id ~ '^[0-9]{8}$'),
  object_path text not null unique,
  work_date date not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now(),
  purged_at timestamptz
);
create index line_evidence_retention_idx on public.line_evidence_files(work_date) where purged_at is null;
alter table public.line_evidence_files enable row level security;
revoke all on public.line_evidence_files from anon, authenticated;
grant all on public.line_evidence_files to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Scheduling is configured after deployment, using the existing server credential
-- in Vault. No credentials belong in migrations. Objects are deleted via Storage
-- API, never by deleting storage.objects rows directly.
