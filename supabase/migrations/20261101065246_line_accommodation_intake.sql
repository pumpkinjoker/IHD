-- Retain one row per employee/day, merging the two independently claimed costs.
create unique index if not exists line_work_entries_employee_day_unique
on public.line_work_entries(employee_id,work_date);

create or replace function public.line_finish_event(p_event_id text,p_user_id text,p_lease text,p_state jsonb,p_entry jsonb,p_reply jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.line_sessions; e public.line_events; previous public.line_work_entries;
  lodging boolean; merged jsonb; amount numeric;
begin
  select * into s from public.line_sessions where user_id=p_user_id for update;
  if not found or s.lease_token is distinct from p_lease or s.lease_until <= now() then raise exception 'Session lease lost'; end if;
  select * into e from public.line_events where event_id=p_event_id for update;
  if not found or e.user_id <> p_user_id or e.status <> 'processing' then raise exception 'Event is not claimed'; end if;
  if p_entry is not null then
    if p_entry->>'employeeId' is distinct from p_state->'conversation'->'employee'->>'employeeId' then raise exception 'Employee mismatch'; end if;
    lodging := coalesce(p_entry->>'kind','work') = 'accommodation';
    if lodging then
      amount := (p_entry->>'accommodation')::numeric;
      if amount is null or amount <= 0 or amount::text in ('NaN','Infinity','-Infinity') or round(amount,2) <> amount
        or coalesce(p_entry->>'imageId','') <> '' then raise exception 'Invalid accommodation'; end if;
      merged := p_entry || jsonb_build_object('expense',jsonb_build_object('accommodation',amount,'perDiem',0,'accommodationOnly',true));
    else
      if coalesce(p_entry->>'imageId','') !~ '^(drive:[A-Za-z0-9_-]+|(local|supabase):[a-f0-9]{64})$' then raise exception 'Evidence is not durable'; end if;
      -- Local installations need not have the Supabase registry table.
      if p_entry->>'imageId' like 'supabase:%' then
        if not exists (select 1 from public.line_evidence_files
          where reference=p_entry->>'imageId' and employee_id=p_entry->>'employeeId'
          and work_date=(p_entry->>'workDate')::date and purged_at is null)
        then raise exception 'Evidence missing or expired'; end if;
      end if;
      merged := p_entry;
    end if;
    -- The employee/day advisory lock also covers the case with no row to lock yet.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((p_entry->>'employeeId') || ':' || (p_entry->>'workDate'),0));
    select * into previous from public.line_work_entries
      where employee_id=p_entry->>'employeeId' and work_date=(p_entry->>'workDate')::date for update;
    if found then
      if previous.user_id <> p_user_id then raise exception 'Entry owner mismatch'; end if;
      if lodging then
        if previous.data ? 'accommodation' or (previous.data->'expense'->>'accommodation') is not null then raise exception 'Accommodation already claimed'; end if;
        merged := previous.data || jsonb_build_object('accommodation',amount,'expense',coalesce(previous.data->'expense','{}'::jsonb) || jsonb_build_object('accommodation',amount));
      else
        if coalesce(previous.data->>'kind','work') <> 'accommodation' then raise exception 'Work already claimed'; end if;
        merged := p_entry || jsonb_build_object('accommodation',previous.data->'accommodation','expense',
          coalesce(previous.data->'expense','{}'::jsonb) || jsonb_build_object('perDiem',300,'accommodationOnly',false));
      end if;
      update public.line_work_entries set data=merged where id=previous.id;
    else
      insert into public.line_work_entries(id,user_id,employee_id,work_date,data)
      values(p_event_id,p_user_id,p_entry->>'employeeId',(p_entry->>'workDate')::date,merged);
    end if;
  end if;
  update public.line_sessions set state=p_state,last_timestamp=e.event_timestamp,lease_token=null,lease_until=null where user_id=p_user_id;
  update public.line_events set status='done',reply=p_reply where event_id=p_event_id;
end $$;
revoke execute on function public.line_finish_event(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.line_finish_event(text,text,text,jsonb,jsonb,jsonb) to service_role;
