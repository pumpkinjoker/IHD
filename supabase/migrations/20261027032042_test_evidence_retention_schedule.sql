-- 17:00 UTC = 00:00 Asia/Bangkok. The cutoff only advances on the first
-- day of the month; daily execution also catches up after a missed run.
-- The existing service credential must be provisioned in Vault first.
select cron.schedule('ihd-test-evidence-retention', '0 17 * * *', $job$
  select net.http_post(
    url := 'https://pqyvtdvskovhbsjduskr.supabase.co/functions/v1/cleanup-test-evidence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ihd_test_evidence_service_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'ihd_test_evidence_service_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
$job$);
