-- maintenance_schedules: RLS, cadence constraints, and complete_schedule RPC
-- (roadmap spec v1.2). Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- Two users in two different households (handle_new_user trigger creates the
-- household + owner membership for each).
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com', '{"name":"Alice"}'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com',   '{"name":"Bob"}');

-- Stash household ids while RLS-exempt.
create temporary table alice_household as
select household_id from public.household_members
where user_id = '00000000-0000-0000-0000-000000000001';
grant select on alice_household to authenticated;

create temporary table bob_household as
select household_id from public.household_members
where user_id = '00000000-0000-0000-0000-000000000002';
grant select on bob_household to authenticated;

-- An item in Alice's household with a fixed id for later references.
insert into public.items (id, household_id, category_id, name, created_by)
select '10000000-0000-0000-0000-000000000001', a.household_id, c.id, 'Furnace',
       '00000000-0000-0000-0000-000000000001'
from alice_household a, public.item_categories c
where c.name = 'HVAC – furnace';

-- Impersonate a user the way PostgREST does.
create or replace function test_as(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'email', email)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Members can create schedules; cadence is exactly-one-of ---------------------

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');

select lives_ok(
  $$ insert into public.maintenance_schedules (id, household_id, name, anchor_month, next_due)
     select '20000000-0000-0000-0000-000000000001', household_id, 'Clean gutters', 10, '2026-10-01'
     from alice_household $$,
  'member can create a house-level (standalone) schedule'
);

select lives_ok(
  $$ insert into public.maintenance_schedules (id, household_id, item_id, name, interval_months, next_due)
     select '20000000-0000-0000-0000-000000000002', household_id,
            '10000000-0000-0000-0000-000000000001', 'Replace filter', 3, '2026-06-01'
     from alice_household $$,
  'member can create a schedule attached to an item in the household'
);

select throws_ok(
  $$ insert into public.maintenance_schedules (household_id, name, interval_months, anchor_month, next_due)
     select household_id, 'Both cadences', 3, 10, '2026-06-01' from alice_household $$,
  '23514', null,
  'a schedule cannot have both an interval and a season anchor'
);

select throws_ok(
  $$ insert into public.maintenance_schedules (household_id, name, next_due)
     select household_id, 'No cadence', '2026-06-01' from alice_household $$,
  '23514', null,
  'a schedule must have an interval or a season anchor'
);

-- Tenant isolation -------------------------------------------------------------

select test_as('00000000-0000-0000-0000-000000000002', 'bob@example.com');

select is_empty(
  $$ select id from public.maintenance_schedules $$,
  'non-member cannot read another household''s schedules'
);

select throws_ok(
  $$ insert into public.maintenance_schedules (household_id, name, interval_months, next_due)
     select household_id, 'Sneaky schedule', 1, '2026-06-01' from alice_household $$,
  '42501',
  'new row violates row-level security policy for table "maintenance_schedules"',
  'non-member cannot insert schedules into another household'
);

-- Bob's own household_id passes RLS, but the composite FK must reject
-- Alice's item.
select throws_ok(
  $$ insert into public.maintenance_schedules (household_id, item_id, name, interval_months, next_due)
     select household_id, '10000000-0000-0000-0000-000000000001', 'Cross-tenant', 1, '2026-06-01'
     from bob_household $$,
  '23503', null,
  'schedule item must belong to the schedule''s household'
);

select * from finish();
rollback;
