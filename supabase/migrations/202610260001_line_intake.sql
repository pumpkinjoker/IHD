-- Server-only intake state. Run once in the project's Supabase SQL editor.
begin;
create table if not exists public.line_sessions (
  user_id text primary key,
  state jsonb,
  last_timestamp bigint not null default 0,
  lease_token text,
  lease_until timestamptz
);
create table if not exists public.line_events (
  event_id text primary key,
  user_id text not null,
  event_timestamp bigint not null,
  payload jsonb not null,
  status text not null default 'processing' check (status in ('processing', 'done', 'ignored')),
  reply jsonb,
  reply_status text not null default 'pending' check (reply_status in ('pending', 'sent', 'rejected')),
  created_at timestamptz not null default now()
);
create table if not exists public.line_work_entries (
  id text primary key references public.line_events(event_id),
  user_id text not null,
  employee_id text not null,
  work_date date not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.line_media_lock (
  singleton boolean primary key default true check (singleton),
  lease_token text,
  lease_until timestamptz
);
insert into public.line_media_lock(singleton) values(true) on conflict do nothing;
alter table public.line_sessions enable row level security;
alter table public.line_events enable row level security;
alter table public.line_work_entries enable row level security;
alter table public.line_media_lock enable row level security;
revoke all on public.line_sessions, public.line_events, public.line_work_entries, public.line_media_lock from anon, authenticated;
grant all on public.line_sessions, public.line_events, public.line_work_entries, public.line_media_lock to service_role;

create or replace function public.line_begin_event(p_event_id text, p_user_id text, p_timestamp bigint, p_lease text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.line_sessions; e public.line_events;
begin
  insert into public.line_sessions(user_id) values(p_user_id) on conflict do nothing;
  select * into s from public.line_sessions where user_id=p_user_id for update;
  select * into e from public.line_events where event_id=p_event_id;
  if found then
    if e.user_id <> p_user_id then raise exception 'Event owner mismatch'; end if;
    if e.status='done' then
      return jsonb_build_object('kind','duplicate','reply',e.reply,'replyStatus',e.reply_status);
    end if;
    if e.status='ignored' then return jsonb_build_object('kind','ignored'); end if;
  end if;
  if s.lease_until > now() then return jsonb_build_object('kind','busy'); end if;
  insert into public.line_events(event_id,user_id,event_timestamp,payload) values(p_event_id,p_user_id,p_timestamp,p_payload) on conflict do nothing;
  if exists(select 1 from public.line_events where user_id=p_user_id and status='processing' and event_timestamp < p_timestamp) then
    return jsonb_build_object('kind','busy');
  end if;
  if p_timestamp < s.last_timestamp then
    update public.line_events set status='ignored' where event_id=p_event_id;
    return jsonb_build_object('kind','ignored');
  end if;
  update public.line_sessions set lease_token=p_lease,lease_until=now()+interval '120 seconds' where user_id=p_user_id;
  return jsonb_build_object('kind','claimed','state',s.state);
end $$;

create or replace function public.line_finish_event(p_event_id text,p_user_id text,p_lease text,p_state jsonb,p_entry jsonb,p_reply jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.line_sessions; e public.line_events;
begin
  select * into s from public.line_sessions where user_id=p_user_id for update;
  if not found or s.lease_token is distinct from p_lease or s.lease_until <= now() then raise exception 'Session lease lost'; end if;
  select * into e from public.line_events where event_id=p_event_id for update;
  if not found or e.user_id <> p_user_id or e.status <> 'processing' then raise exception 'Event is not claimed'; end if;
  if p_entry is not null then
    if coalesce(p_entry->>'imageId','') !~ '^(drive:[A-Za-z0-9_-]+|local:[a-f0-9]{64})$' then raise exception 'Evidence is not durable'; end if;
    if p_entry->>'employeeId' is distinct from p_state->'conversation'->'employee'->>'employeeId' then raise exception 'Employee mismatch'; end if;
    insert into public.line_work_entries(id,user_id,employee_id,work_date,data)
    values(p_event_id,p_user_id,p_entry->>'employeeId',(p_entry->>'workDate')::date,p_entry);
  end if;
  update public.line_sessions set state=p_state,last_timestamp=e.event_timestamp,lease_token=null,lease_until=null where user_id=p_user_id;
  update public.line_events set status='done',reply=p_reply where event_id=p_event_id;
end $$;

create or replace function public.line_release_event(p_user_id text,p_lease text)
returns void language sql security invoker set search_path = '' as $$
  update public.line_sessions set lease_token=null,lease_until=null where user_id=p_user_id and lease_token=p_lease;
$$;
create or replace function public.line_claim_media(p_lease text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.line_media_lock set lease_token=p_lease,lease_until=now()+interval '120 seconds'
    where singleton and (lease_until is null or lease_until <= now());
  return found;
end $$;
create or replace function public.line_release_media(p_lease text)
returns void language sql security invoker set search_path = '' as $$
  update public.line_media_lock set lease_token=null,lease_until=null where singleton and lease_token=p_lease;
$$;

revoke execute on function public.line_begin_event(text,text,bigint,text,jsonb), public.line_finish_event(text,text,text,jsonb,jsonb,jsonb), public.line_release_event(text,text), public.line_claim_media(text), public.line_release_media(text) from public, anon, authenticated;
grant execute on function public.line_begin_event(text,text,bigint,text,jsonb), public.line_finish_event(text,text,text,jsonb,jsonb,jsonb), public.line_release_event(text,text), public.line_claim_media(text), public.line_release_media(text) to service_role;
commit;
