begin;
create table if not exists public.ihd_employee_directory (
  employee_id text primary key,
  name text not null,
  email text not null,
  team text not null,
  position text not null,
  active boolean not null default true
);
alter table public.ihd_employee_directory enable row level security;
revoke all on public.ihd_employee_directory from anon, authenticated;
grant all on public.ihd_employee_directory to service_role;
commit;
