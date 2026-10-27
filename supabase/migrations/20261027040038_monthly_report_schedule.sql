-- 01:00 UTC = 08:00 Bangkok on the first. Additional runs retry only pending
-- recipients with the same LINE retry key; sent reports are never re-sent.
select cron.schedule('ihd-monthly-personal-reports','*/5 1-2 1 * *',$job$
  select net.http_post(
    url:='https://pqyvtdvskovhbsjduskr.supabase.co/functions/v1/monthly-report-worker',
    headers:=jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='ihd_test_evidence_service_key'),
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='ihd_test_evidence_service_key')),
    body:='{}'::jsonb,timeout_milliseconds:=90000);
$job$);
