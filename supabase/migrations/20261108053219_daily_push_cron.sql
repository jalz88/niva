-- Morning push: 02:30 UTC = 08:00 Sri Lanka (UTC+05:30, no DST). Same pattern as
-- the daily-ical-sync job: service role key read from Vault at run time, never
-- stored here. The send-push Edge Function re-checks the bearer itself
-- (verify_jwt is off for it so a user JWT can't be mistaken for authorization).
select cron.schedule(
  'daily-push-digest',
  '30 2 * * *',
  $job$
  select net.http_post(
    url := 'https://bijahfikigdykdypempv.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_room_ical_service_key'
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
