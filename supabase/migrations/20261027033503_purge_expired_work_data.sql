-- Called only after the corresponding Storage API deletion succeeds.
create or replace function public.line_purge_expired_data(p_cutoff date,p_references text[],p_lease text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare removed_ids text[]; entry_count integer; event_count integer; media_count integer;
begin
  if p_cutoff is distinct from (date_trunc('month',now() at time zone 'Asia/Bangkok') - interval '1 month')::date then
    raise exception 'Invalid retention cutoff';
  end if;
  if not exists(select 1 from public.line_media_lock where lease_token=p_lease and lease_until>now()) then
    raise exception 'Media lease lost';
  end if;
  with removed as (
    delete from public.line_work_entries w where w.work_date<p_cutoff and
      (w.data->>'imageId'=any(p_references) or not exists(select 1 from public.line_evidence_files f where f.reference=w.data->>'imageId'))
    returning id
  ) select coalesce(array_agg(id),array[]::text[]) into removed_ids from removed;
  entry_count := cardinality(removed_ids);

  -- Preserve employee registration; remove expired work drafts and button context.
  update public.line_sessions s set state=jsonb_set(jsonb_set(s.state,'{conversation,intake}','{"step":"idle","draft":null}'::jsonb),'{buttonContext}','""'::jsonb)
    where (s.lease_until is null or s.lease_until<=now()) and
      (s.state#>>'{conversation,intake,draft,workDate}' < p_cutoff::text or s.state->>'buttonContext'=any(removed_ids));
  delete from public.line_events e where not exists(select 1 from public.line_work_entries w where w.id=e.event_id)
    and (e.event_id=any(removed_ids) or e.created_at<(p_cutoff::timestamp at time zone 'Asia/Bangkok'))
    and not exists(select 1 from public.line_sessions s where s.user_id=e.user_id and s.lease_until>now());
  get diagnostics event_count = row_count;
  delete from public.line_evidence_files where reference=any(p_references) and work_date<p_cutoff;
  get diagnostics media_count = row_count;
  return jsonb_build_object('entries',entry_count,'events',event_count,'images',media_count);
end $$;
revoke execute on function public.line_purge_expired_data(date,text[],text) from public,anon,authenticated;
grant execute on function public.line_purge_expired_data(date,text[],text) to service_role;
