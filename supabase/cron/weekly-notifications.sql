-- ADR-004 notification jobs. Run once in the project's SQL editor (not a migration;
-- pg_cron is not guaranteed in the local test image, so keeping this out of
-- migrations keeps `supabase db reset` / CI pgTAP green). Re-running is safe:
-- cron.schedule upserts a job of the same name.
--
-- Prerequisites (see SETUP.md):
--   • Vault secret `project_url`  = https://<ref>.supabase.co
--   • Vault secret `cron_secret`  = the same value as the CRON_SECRET function secret
--   • Edge Function deployed (CI) with secret CRON_SECRET set

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Mondays 13:00 UTC. Household time zones affect schedule reminders, while
-- this quiet warranty and end-of-life digest keeps its existing weekly slot.
select cron.schedule(
  'weekly-notifications',
  '0 13 * * 1',
  $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"mode":"weekly-digest"}'::jsonb
  );
  $cmd$
);

select cron.schedule(
  'schedule-reminders',
  '0 * * * *',
  $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"mode":"schedule-reminders"}'::jsonb
  );
  $cmd$
);

select cron.schedule(
  'schedule-notification-delivery-cleanup',
  '30 3 * * *',
  $cmd$
  select public.cleanup_schedule_notification_deliveries();
  $cmd$
);

-- To remove: unschedule all three named jobs above with cron.unschedule(name).
