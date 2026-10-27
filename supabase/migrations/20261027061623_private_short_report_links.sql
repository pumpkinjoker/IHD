create table public.line_report_links (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  employee_id text not null,
  period date not null,
  object_path text not null,
  expires_at timestamptz not null
);
create index line_report_links_expiry_idx on public.line_report_links(expires_at);
alter table public.line_report_links enable row level security;
revoke all on public.line_report_links from anon,authenticated;
grant all on public.line_report_links to service_role;
