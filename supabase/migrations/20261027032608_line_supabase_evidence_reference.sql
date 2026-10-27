create or replace function public.line_finish_event(p_event_id text,p_user_id text,p_lease text,p_state jsonb,p_entry jsonb,p_reply jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.line_sessions; e public.line_events;
begin
  select * into s from public.line_sessions where user_id=p_user_id for update;
  if not found or s.lease_token is distinct from p_lease or s.lease_until <= now() then raise exception 'Session lease lost'; end if;
  select * into e from public.line_events where event_id=p_event_id for update;
  if not found or e.user_id <> p_user_id or e.status <> 'processing' then raise exception 'Event is not claimed'; end if;
  if p_entry is not null then
    if coalesce(p_entry->>'imageId','') !~ '^(drive:[A-Za-z0-9_-]+|(local|supabase):[a-f0-9]{64})$' then raise exception 'Evidence is not durable'; end if;
    if p_entry->>'employeeId' is distinct from p_state->'conversation'->'employee'->>'employeeId' then raise exception 'Employee mismatch'; end if;
    if p_entry->>'imageId' like 'supabase:%' and not exists (
      select 1 from public.line_evidence_files
      where reference=p_entry->>'imageId' and employee_id=p_entry->>'employeeId'
        and work_date=(p_entry->>'workDate')::date and purged_at is null
    ) then raise exception 'Evidence missing or expired'; end if;
    insert into public.line_work_entries(id,user_id,employee_id,work_date,data)
    values(p_event_id,p_user_id,p_entry->>'employeeId',(p_entry->>'workDate')::date,p_entry);
  end if;
  update public.line_sessions set state=p_state,last_timestamp=e.event_timestamp,lease_token=null,lease_until=null where user_id=p_user_id;
  update public.line_events set status='done',reply=p_reply where event_id=p_event_id;
end $$;
revoke execute on function public.line_finish_event(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.line_finish_event(text,text,text,jsonb,jsonb,jsonb) to service_role;
