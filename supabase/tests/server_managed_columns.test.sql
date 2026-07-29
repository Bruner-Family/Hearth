-- Server-managed columns: authenticated clients may edit product fields, but
-- cannot forge creator/timestamp values or move rows between parents.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com', '{"name":"Alice"}'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com',   '{"name":"Bob"}');

create temporary table alice_household as
select household_id from public.household_members
where user_id = '00000000-0000-0000-0000-000000000001';
grant select on alice_household to authenticated;

create temporary table a_cat as
select id from public.item_categories order by sort_order limit 1;
grant select on a_cat to authenticated;

create or replace function test_as(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'email', email)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');

-- Ordinary client inserts remain available and server-managed values default.
select lives_ok(
  $$ insert into public.items (household_id, category_id, name)
     select household_id, (select id from a_cat), 'Furnace'
     from alice_household $$,
  'member can create an item with client-managed columns'
);

select lives_ok(
  $$ insert into public.maintenance_logs (item_id, performed_on)
     select id, '2026-07-01' from public.items where name = 'Furnace' $$,
  'member can create a maintenance log with client-managed columns'
);

select lives_ok(
  $$ insert into public.maintenance_schedules
       (household_id, item_id, name, interval_months, next_due)
     select household_id, (select id from public.items where name = 'Furnace'),
            'Replace filter', 3, '2026-10-01'
     from alice_household $$,
  'member can create a schedule with client-managed columns'
);

-- Ordinary product edits still work.
select lives_ok(
  $$ update public.items set notes = 'Basement' where name = 'Furnace' $$,
  'member can edit an allowed item column'
);

select lives_ok(
  $$ update public.maintenance_logs set notes = 'Changed filter' $$,
  'member can edit an allowed maintenance log column'
);

select lives_ok(
  $$ update public.maintenance_schedules set next_due = '2026-11-01' $$,
  'member can edit an allowed schedule column'
);

-- Creator and creation timestamp cannot be rewritten after creation.
select throws_ok(
  $$ update public.items
     set created_by = '00000000-0000-0000-0000-000000000002'
     where name = 'Furnace' $$,
  '42501', null,
  'member cannot rewrite an item creator'
);

select throws_ok(
  $$ update public.items set created_at = '2000-01-01' where name = 'Furnace' $$,
  '42501', null,
  'member cannot rewrite an item creation timestamp'
);

select throws_ok(
  $$ update public.maintenance_logs
     set created_by = '00000000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'member cannot rewrite a maintenance log creator'
);

select throws_ok(
  $$ update public.maintenance_logs set created_at = '2000-01-01' $$,
  '42501', null,
  'member cannot rewrite a maintenance log creation timestamp'
);

select throws_ok(
  $$ update public.maintenance_schedules
     set created_by = '00000000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'member cannot rewrite a schedule creator'
);

select throws_ok(
  $$ update public.maintenance_schedules set created_at = '2000-01-01' $$,
  '42501', null,
  'member cannot rewrite a schedule creation timestamp'
);

-- The same fields cannot be forged at creation time.
select throws_ok(
  $$ insert into public.items (household_id, category_id, name, created_by)
     select household_id, (select id from a_cat), 'Forged item',
            '00000000-0000-0000-0000-000000000002'
     from alice_household $$,
  '42501', null,
  'member cannot forge an item creator'
);

select throws_ok(
  $$ insert into public.items (household_id, category_id, name, created_at)
     select household_id, (select id from a_cat), 'Backdated item', '2000-01-01'
     from alice_household $$,
  '42501', null,
  'member cannot forge an item creation timestamp'
);

select throws_ok(
  $$ insert into public.maintenance_logs (item_id, performed_on, created_by)
     select id, '2026-07-02', '00000000-0000-0000-0000-000000000002'
     from public.items where name = 'Furnace' $$,
  '42501', null,
  'member cannot forge a maintenance log creator'
);

select throws_ok(
  $$ insert into public.maintenance_logs (item_id, performed_on, created_at)
     select id, '2026-07-02', '2000-01-01'
     from public.items where name = 'Furnace' $$,
  '42501', null,
  'member cannot forge a maintenance log creation timestamp'
);

select throws_ok(
  $$ insert into public.maintenance_schedules
       (household_id, name, anchor_month, next_due, created_by)
     select household_id, 'Forged schedule', 1, '2027-01-01',
            '00000000-0000-0000-0000-000000000002'
     from alice_household $$,
  '42501', null,
  'member cannot forge a schedule creator'
);

select throws_ok(
  $$ insert into public.maintenance_schedules
       (household_id, name, anchor_month, next_due, created_at)
     select household_id, 'Backdated schedule', 1, '2027-01-01', '2000-01-01'
     from alice_household $$,
  '42501', null,
  'member cannot forge a schedule creation timestamp'
);

-- Parent/tenant links are selected at creation and immutable afterward.
select throws_ok(
  $$ update public.items set household_id = household_id where name = 'Furnace' $$,
  '42501', null,
  'member cannot rewrite an item household'
);

select throws_ok(
  $$ update public.maintenance_logs set item_id = item_id $$,
  '42501', null,
  'member cannot rewrite a maintenance log item'
);

select throws_ok(
  $$ update public.maintenance_schedules set item_id = item_id $$,
  '42501', null,
  'member cannot rewrite a schedule item'
);

select * from finish();
rollback;
