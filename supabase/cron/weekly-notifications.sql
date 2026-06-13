-- Roadmap spec v1.3 — run ONCE in the project's SQL editor (not a migration;
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

-- Mondays 13:00 UTC (~early morning North America; no per-household timezone
-- yet — a future enhancement). Posts to the notify function in cron mode.
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
    body := '{}'::jsonb
  );
  $cmd$
);

-- To remove: select cron.unschedule('weekly-notifications');
