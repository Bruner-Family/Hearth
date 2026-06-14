-- Roadmap spec v1.3 "Notifications" — per-household delivery config. One row
-- per household (PK = household_id). Webhook-only in v1.3 (Discord/Telegram);
-- an email column slots in later. Owner-writable, member-readable.

create table public.notification_settings (
  household_id       uuid primary key references public.households (id) on delete cascade,
  enabled            boolean not null default true,
  discord_webhook_url text,
  telegram_bot_token  text,
  telegram_chat_id    text,
  lead_time_days     integer not null default 14 check (lead_time_days between 1 and 90),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function private.set_updated_at();

alter table public.notification_settings enable row level security;

-- Members can read their household's config; only owners may change it.
create policy notification_settings_select on public.notification_settings
  for select using (private.is_household_member(household_id));

create policy notification_settings_insert on public.notification_settings
  for insert with check (private.is_household_owner(household_id));

create policy notification_settings_update on public.notification_settings
  for update using (private.is_household_owner(household_id))
  with check (private.is_household_owner(household_id));

create policy notification_settings_delete on public.notification_settings
  for delete using (private.is_household_owner(household_id));

grant select, insert, update, delete
  on public.notification_settings to authenticated;
