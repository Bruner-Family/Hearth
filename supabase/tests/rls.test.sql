-- RLS policy tests (ADR-001 §3: "a policy bug is a data-exposure bug").
-- Run locally or in CI with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- Two users in two different households ------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com', '{"name":"Alice"}'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com',   '{"name":"Bob"}');

-- handle_new_user trigger should have created a default household + owner
-- membership for each.
select results_eq(
  $$ select count(*)::int from public.household_members $$,
  $$ values (2) $$,
  'first sign-in auto-creates a household with owner membership'
);

-- Seed an item in Alice's household.
insert into public.items (household_id, category_id, name, created_by)
select m.household_id, c.id, 'Roof', m.user_id
from public.household_members m, public.item_categories c
where m.user_id = '00000000-0000-0000-0000-000000000001'
  and c.name = 'Roof (asphalt shingle)';

-- Helper to impersonate a user the way PostgREST does.
create or replace function test_as(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'email', email)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Alice sees her item; Bob does not -----------------------------------------

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
select results_eq(
  $$ select count(*)::int from public.items $$,
  $$ values (1) $$,
  'member can read items in own household'
);
select results_eq(
  $$ select count(*)::int from public.households $$,
  $$ values (1) $$,
  'member sees only own household'
);

select test_as('00000000-0000-0000-0000-000000000002', 'bob@example.com');
select is_empty(
  $$ select id from public.items $$,
  'non-member cannot read items of another household'
);
select is_empty(
  $$ select id from public.household_invites $$,
  'no invites visible when none addressed to user'
);

-- Bob cannot write into Alice's household ------------------------------------

select throws_ok(
  $$ insert into public.items (household_id, category_id, name)
     select h.household_id, c.id, 'Sneaky item'
     from public.household_members h, public.item_categories c
     where h.user_id = '00000000-0000-0000-0000-000000000001'
       and c.name = 'Other' $$,
  '42501',
  'new row violates row-level security policy for table "items"',
  'non-member cannot insert items into another household'
);

-- Invite flow ----------------------------------------------------------------

-- Alice (owner) invites Bob.
select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
insert into public.household_invites (household_id, email, invited_by)
select household_id, 'bob@example.com', user_id
from public.household_members
where user_id = '00000000-0000-0000-0000-000000000001';

-- Bob sees the invite addressed to his email and accepts it.
select test_as('00000000-0000-0000-0000-000000000002', 'bob@example.com');
select results_eq(
  $$ select count(*)::int from public.household_invites $$,
  $$ values (1) $$,
  'invitee can see invite addressed to their email'
);

select lives_ok(
  $$ select public.accept_invite(id) from public.household_invites limit 1 $$,
  'invitee can accept a pending invite'
);

select results_eq(
  $$ select count(*)::int from public.items $$,
  $$ values (1) $$,
  'after accepting, new member can read household items'
);

-- A second acceptance must fail (no longer pending).
select throws_ok(
  $$ select public.accept_invite(id) from public.household_invites limit 1 $$,
  'P0001',
  'Invite is no longer pending',
  'accepted invite cannot be accepted twice'
);

select * from finish();
rollback;
