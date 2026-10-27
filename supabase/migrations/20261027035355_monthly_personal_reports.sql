create table public.line_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  period date not null check(extract(day from period)=1),
  employee_id text not null,
  line_user_id text,
  snapshot jsonb not null,
  object_paths text[] not null default array[]::text[],
  report_url text,
  push_text text,
  status text not null default 'pending' check(status in ('pending','sent','blocked','ambiguous')),
  retry_key uuid not null default gen_random_uuid(),
  first_attempt_at timestamptz,
  sent_at timestamptz,
  lease_token text,
  lease_until timestamptz,
  last_error text,
  expires_at timestamptz not null,
  unique(period,employee_id)
);
alter table public.line_monthly_reports enable row level security;
revoke all on public.line_monthly_reports from anon,authenticated;
grant all on public.line_monthly_reports to service_role;

create function public.line_prepare_monthly_reports(p_period date)
returns integer language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
  if p_period is distinct from (date_trunc('month',now() at time zone 'Asia/Bangkok')-interval '1 month')::date then raise exception 'Invalid report month'; end if;
  insert into public.line_monthly_reports(period,employee_id,line_user_id,snapshot,expires_at,status,last_error)
  select p_period,d.employee_id,
    case when bindings.total=1 then bindings.line_id else null end,
    jsonb_build_object('employee',to_jsonb(d),'entries',entries.items),
    ((p_period+interval '2 months')::timestamp at time zone 'Asia/Bangkok'),
    case when bindings.total=1 then 'pending' else 'blocked' end,
    case when bindings.total=1 then null else 'missing_or_ambiguous_line_binding' end
  from public.ihd_employee_directory d
  cross join lateral (
    select jsonb_agg(jsonb_build_object('id',w.id,'data',w.data) order by w.work_date) as items
    from public.line_work_entries w where w.employee_id=d.employee_id and w.work_date>=p_period and w.work_date<(p_period+interval '1 month')::date
  ) entries
  cross join lateral (
    select count(*) as total,min(user_id) as line_id from public.line_sessions s
    where s.user_id ~ '^U[0-9a-f]{32}$' and s.state#>>'{conversation,employee,employeeId}'=d.employee_id
  ) bindings
  where d.active and entries.items is not null
  on conflict(period,employee_id) do nothing;
  get diagnostics inserted=row_count;
  return inserted;
end $$;

create function public.line_claim_monthly_report(p_period date,p_lease text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.line_monthly_reports;
begin
  update public.line_monthly_reports set status='ambiguous',last_error='retry_window_expired'
    where period=p_period and status='pending' and first_attempt_at<now()-interval '23 hours'
      and (lease_until is null or lease_until<=now());
  select * into job from public.line_monthly_reports
    where period=p_period and status='pending' and expires_at>now() and (lease_until is null or lease_until<=now())
    order by employee_id for update skip locked limit 1;
  if not found then return null; end if;
  update public.line_monthly_reports set lease_token=p_lease,lease_until=now()+interval '120 seconds' where id=job.id returning * into job;
  return to_jsonb(job);
end $$;

create function public.line_monthly_mark_attempt(p_id uuid,p_lease text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.line_monthly_reports;
begin
  select * into job from public.line_monthly_reports where id=p_id for update;
  if not found or job.status<>'pending' or job.lease_token is distinct from p_lease or job.lease_until<=now() or job.report_url is null or job.push_text is null then raise exception 'Report lease lost'; end if;
  if not exists(select 1 from public.ihd_employee_directory d where d.employee_id=job.employee_id and d.active)
    or not exists(select 1 from public.line_sessions s where s.user_id=job.line_user_id and s.state#>>'{conversation,employee,employeeId}'=job.employee_id) then
    update public.line_monthly_reports set status='blocked',last_error='recipient_binding_changed',lease_token=null,lease_until=null where id=p_id;
    return false;
  end if;
  if job.first_attempt_at<now()-interval '23 hours' then
    update public.line_monthly_reports set status='ambiguous',last_error='retry_window_expired',lease_token=null,lease_until=null where id=p_id;
    return false;
  end if;
  update public.line_monthly_reports set first_attempt_at=coalesce(first_attempt_at,now()) where id=p_id;
  return true;
end $$;

create function public.line_monthly_config()
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('lineToken',(select decrypted_secret from vault.decrypted_secrets where name='ihd_monthly_line_token'),
    'appOrigin','https://ihd-gen.vercel.app');
$$;
revoke execute on function public.line_prepare_monthly_reports(date),public.line_claim_monthly_report(date,text),public.line_monthly_mark_attempt(uuid,text),public.line_monthly_config() from public,anon,authenticated;
grant execute on function public.line_prepare_monthly_reports(date),public.line_claim_monthly_report(date,text),public.line_monthly_mark_attempt(uuid,text),public.line_monthly_config() to service_role;
