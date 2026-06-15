-- items.reference_details: default, array check, member round-trip (spec v1.5).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000001', 'alice@example.com', '{"name":"Alice"}');

create temporary table alice_household as
select household_id from public.household_members
where user_id = '00000000-0000-0000-0000-000000000001';
grant select on alice_household to authenticated;

create or replace function test_as(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'email', email)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');

create temporary table a_cat as select id from public.item_categories order by sort_order limit 1;
grant select on a_cat to authenticated;

select lives_ok(
  $$ insert into public.items (household_id, category_id, name)
     select household_id, (select id from a_cat), 'Furnace' from alice_household $$,
  'member can insert an item without reference_details'
);

select is(
  (select reference_details from public.items where name = 'Furnace'),
  '[]'::jsonb,
  'reference_details defaults to an empty array'
);

select lives_ok(
  $$ update public.items
       set reference_details = '[{"label":"Filter","value":"16x25x1"}]'::jsonb
     where name = 'Furnace' $$,
  'member can write reference_details pairs'
);

select throws_ok(
  $$ update public.items set reference_details = '{"not":"an array"}'::jsonb
     where name = 'Furnace' $$,
  23514,
  null,
  'reference_details rejects a non-array value'
);

select * from finish();
rollback;
