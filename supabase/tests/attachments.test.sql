-- attachments: item-scoped vs log-scoped filing, and the composite FK that
-- keeps a log-scoped attachment on the log's own item (docs/TODO.md
-- "Attachments"). Run with: supabase test db
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

-- Two items, one maintenance entry on the first.
insert into public.items (household_id, category_id, name)
select household_id, (select id from a_cat), 'Furnace' from alice_household;

insert into public.items (household_id, category_id, name)
select household_id, (select id from a_cat), 'Water heater' from alice_household;

insert into public.maintenance_logs (item_id, performed_on)
select id, current_date from public.items where name = 'Furnace';

select lives_ok(
  $$ insert into public.attachments (item_id, storage_path, mime_type, file_name)
     select id, 'hh/furnace/1-a1b2c3-Manual-2019-LG.pdf', 'application/pdf',
            'Manual (2019) — LG.pdf'
     from public.items where name = 'Furnace' $$,
  'member can attach a document to their item'
);

select lives_ok(
  $$ insert into public.attachments
       (item_id, maintenance_log_id, storage_path, mime_type, file_name)
     select item_id, id, 'hh/furnace/2-d4e5f6-receipt.pdf', 'application/pdf',
            'receipt.pdf'
     from public.maintenance_logs $$,
  'member can attach a receipt to one maintenance log entry'
);

-- The log belongs to the furnace, so claiming it from the water heater must
-- fail: that is what the composite FK is for.
select throws_ok(
  $$ insert into public.attachments
       (item_id, maintenance_log_id, storage_path, mime_type)
     select i.id, l.id, 'hh/water-heater/3-g7h8i9-wrong.pdf', 'application/pdf'
     from public.items i, public.maintenance_logs l
     where i.name = 'Water heater' $$,
  23503,
  null,
  'a log-scoped attachment cannot claim a log from another item'
);

delete from public.maintenance_logs;

select results_eq(
  $$ select file_name from public.attachments $$,
  $$ values ('Manual (2019) — LG.pdf'::text) $$,
  'deleting a log cascades its attachments and leaves the item''s own'
);

select * from finish();
rollback;
