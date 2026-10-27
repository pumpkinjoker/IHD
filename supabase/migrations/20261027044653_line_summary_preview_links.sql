create table public.line_summary_previews (
  employee_id text not null,
  period date not null check(extract(day from period)=1),
  object_path text not null,
  primary key(employee_id,period)
);
alter table public.line_summary_previews enable row level security;
revoke all on public.line_summary_previews from anon,authenticated;
grant all on public.line_summary_previews to service_role;
