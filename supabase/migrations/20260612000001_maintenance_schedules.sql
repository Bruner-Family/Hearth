-- Roadmap spec v1.2 "Reasons to Return" — recurring maintenance schedules.
-- A schedule belongs to a household and optionally to an item (null item_id =
-- house-level task like "test smoke detectors"). It recurs either every
-- interval_months or yearly in anchor_month; exactly one cadence is set.

-- Lets schedules FK-verify that a referenced item belongs to the same
-- household (same pattern as attachments → maintenance_logs (id, item_id)).
alter table public.items
  add constraint items_id_household_key unique (id, household_id);

create table public.maintenance_schedules (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  item_id           uuid,
  name              text not null check (char_length(name) between 1 and 200),
  interval_months   integer check (interval_months between 1 and 120),
  anchor_month      integer check (anchor_month between 1 and 12),
  next_due          date not null,
  last_completed_on date,
  notes             text,
  created_by        uuid not null default auth.uid() references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- exactly one cadence: every N months XOR every <anchor month>
  check (num_nonnulls(interval_months, anchor_month) = 1),
  -- MATCH SIMPLE: null item_id (house-level) passes; non-null must match the
  -- same household, so a schedule can never point at another tenant's item.
  foreign key (item_id, household_id)
    references public.items (id, household_id) on delete cascade
);

create index maintenance_schedules_household_idx
  on public.maintenance_schedules (household_id);

create trigger maintenance_schedules_set_updated_at
  before update on public.maintenance_schedules
  for each row execute function private.set_updated_at();

alter table public.maintenance_schedules enable row level security;

create policy maintenance_schedules_rw on public.maintenance_schedules
  for all using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- RLS only filters; PostgREST roles still need table privileges
-- (see 20260610000005_grants.sql).
grant select, insert, update, delete
  on public.maintenance_schedules to authenticated;
