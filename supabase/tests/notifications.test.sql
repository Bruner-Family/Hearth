-- notification_settings RLS + notifications_digest correctness (spec v1.3).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

-- 6 assertions here; Task 3 raises this to 11 when it appends the digest tests.
select plan(6);

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

select * from finish();
rollback;
