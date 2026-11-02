-- First Monday only, 08:00–09:55 Bangkok, with five-minute retries.
-- Keep weekday in cron and day-of-month in SQL: combining both cron fields uses OR.
-- Updating the named job preserves sent-job deduplication and LINE retry keys.
select cron.schedule('ihd-monthly-personal-reports','*/5 1-2 * * 1',$job$
  select net.http_post(
    url:='https://pqyvtdvskovhbsjduskr.supabase.co/functions/v1/monthly-report-worker',
    headers:=jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='ihd_test_evidence_service_key'),
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='ihd_test_evidence_service_key')),
    body:='{}'::jsonb,timeout_milliseconds:=90000)
  where extract(day from now() at time zone 'Asia/Bangkok') <= 7;
$job$);
