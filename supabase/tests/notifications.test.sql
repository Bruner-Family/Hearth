-- notification_settings RLS + notifications_digest correctness (spec v1.3).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- Alice (owner of her household) and Bob (a different household).
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com', '{"name":"Alice"}'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com',   '{"name":"Bob"}');

create temporary table alice_household as
select household_id from public.household_members
where user_id = '00000000-0000-0000-0000-000000000001';
grant select on alice_household to authenticated;

create temporary table bob_household as
select household_id from public.household_members
where user_id = '00000000-0000-0000-0000-000000000002';
grant select on bob_household to authenticated;

create or replace function test_as(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'email', email)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- RLS: owner can write, member can read, non-member sees nothing -------------

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');

select lives_ok(
  $$ insert into public.notification_settings (household_id, discord_webhook_url, lead_time_days)
     select household_id, 'https://discord.com/api/webhooks/x/y', 14 from alice_household $$,
  'owner can create notification settings'
);

select lives_ok(
  $$ update public.notification_settings set lead_time_days = 7
     where household_id = (select household_id from alice_household) $$,
  'owner can update notification settings'
);

select results_eq(
  $$ select lead_time_days from public.notification_settings $$,
  $$ values (7) $$,
  'owner reads back their own settings'
);

select test_as('00000000-0000-0000-0000-000000000002', 'bob@example.com');

select is_empty(
  $$ select household_id from public.notification_settings $$,
  'non-member cannot read another household''s settings'
);

select throws_ok(
  $$ insert into public.notification_settings (household_id, lead_time_days)
     select household_id, 30 from alice_household $$,
  '42501',
  'new row violates row-level security policy for table "notification_settings"',
  'non-member cannot write another household''s settings'
);

-- lead_time_days bounds ------------------------------------------------------

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');

select throws_ok(
  $$ update public.notification_settings set lead_time_days = 0
     where household_id = (select household_id from alice_household) $$,
  '23514', null,
  'lead_time_days must be at least 1'
);

-- notifications_digest -------------------------------------------------------
-- Seed Alice's household with one of each signal plus a healthy item that
-- must NOT appear. (Tests run as table owner; the function is security
-- definer and takes an explicit household, so RLS is not involved here.)
-- reset role: test_as() above switched the session to `authenticated`, which
-- has no execute grant on notifications_digest (service_role only).
reset role;

-- An overdue schedule attached to an item.
insert into public.items (id, household_id, category_id, name, purchase_date, created_by)
select '30000000-0000-0000-0000-000000000001', a.household_id, c.id, 'Furnace', '2010-01-01',
       '00000000-0000-0000-0000-000000000001'
from alice_household a, public.item_categories c where c.name = 'HVAC – furnace';

insert into public.maintenance_schedules (household_id, item_id, name, interval_months, next_due)
select household_id, '30000000-0000-0000-0000-000000000001', 'Replace filter', 3, current_date - 2
from alice_household;

-- A warranty expiring in 5 days.
insert into public.items (household_id, category_id, name, warranty_until, created_by)
select a.household_id, c.id, 'Dishwasher', current_date + 5, '00000000-0000-0000-0000-000000000001'
from alice_household a, public.item_categories c where c.name = 'Dishwasher';

-- A brand-new healthy item (no signal).
insert into public.items (household_id, category_id, name, purchase_date, created_by)
select a.household_id, c.id, 'New washer', current_date, '00000000-0000-0000-0000-000000000001'
from alice_household a, public.item_categories c where c.name = 'Washer';

select results_eq(
  $$ select count(*)::int
     from public.notifications_digest((select household_id from alice_household), 14) $$,
  $$ values (3) $$,
  'digest returns the overdue schedule + expiring warranty + the end-of-life furnace, not the healthy washer'
);

select results_eq(
  $$ select kind from public.notifications_digest((select household_id from alice_household), 14)
     order by kind $$,
  $$ values ('end_of_life'::text), ('schedule'::text), ('warranty'::text) $$,
  'digest reports one of each expected kind'
);

select is_empty(
  $$ select kind from public.notifications_digest((select household_id from bob_household), 14) $$,
  'digest for an unrelated household is empty'
);

-- A schedule due in 20 days is excluded by a 14-day lead but included by 30.
-- (anchor_month must be non-null since interval_months is null — the table's
-- num_nonnulls(interval_months, anchor_month) = 1 check requires exactly one.)
insert into public.maintenance_schedules (household_id, name, anchor_month, next_due)
select household_id, 'Far task', extract(month from current_date + 20)::int, current_date + 20
from alice_household;

select results_eq(
  $$ select count(*)::int
     from public.notifications_digest((select household_id from alice_household), 14)
     where kind = 'schedule' $$,
  $$ values (1) $$,
  '14-day lead excludes a schedule due in 20 days'
);

select results_eq(
  $$ select count(*)::int
     from public.notifications_digest((select household_id from alice_household), 30)
     where kind = 'schedule' $$,
  $$ values (2) $$,
  '30-day lead includes the schedule due in 20 days'
);

select * from finish();
rollback;
