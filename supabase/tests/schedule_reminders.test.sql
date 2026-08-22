-- ADR-004 reminder state, slot calculation, claims, retries, and isolation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(52);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com', '{"name":"Alice"}'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com', '{"name":"Bob"}');

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

insert into public.notification_settings (
  household_id,
  discord_webhook_url,
  telegram_bot_token,
  telegram_chat_id,
  lead_time_days,
  time_zone,
  reminder_time
)
select household_id, 'https://discord.example/webhook', 'token', 'chat',
       21, 'UTC', '00:00'
from alice_household;

insert into public.maintenance_schedules (
  id, household_id, name, interval_months, next_due, created_by
)
select '20000000-0000-0000-0000-000000000001', household_id,
       'Default reminder', 1, current_date + 30,
       '00000000-0000-0000-0000-000000000001'
from alice_household;

select results_eq(
  $$ select reminder_enabled, reminder_lead_days, reminder_frequency::text
     from public.maintenance_schedules
     where id = '20000000-0000-0000-0000-000000000001' $$,
  $$ values (true, 14, 'weekly'::text) $$,
  'new schedules preserve the enabled 14-day weekly defaults'
);

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');

select lives_ok(
  $$ insert into public.maintenance_schedules (
       household_id, name, interval_months, next_due,
       reminder_enabled, reminder_lead_days, reminder_frequency
     )
     select household_id, 'Custom reminder', 1, current_date,
            true, 0, 'hourly'
     from alice_household $$,
  'members can configure reminder fields on insert'
);

select throws_ok(
  $$ insert into public.maintenance_schedules (
       household_id, name, interval_months, next_due, reminder_lead_days
     )
     select household_id, 'Invalid lead', 1, current_date, 366
     from alice_household $$,
  '23514', null,
  'reminder lead days cannot exceed 365'
);

select results_eq(
  $$ select time_zone, reminder_time::text, weekly_digest_enabled
     from public.notification_settings $$,
  $$ values ('UTC'::text, '00:00:00'::text, true) $$,
  'notification settings store time zone, reminder time, and weekly mode'
);

select throws_ok(
  $$ update public.notification_settings set time_zone = 'Mars/Olympus' $$,
  '23514', 'Unknown IANA time zone: Mars/Olympus',
  'the database rejects an unknown IANA time zone'
);

select throws_ok(
  $$ update public.maintenance_schedules set snoozed_until = null
     where id = '20000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'authenticated clients cannot directly write snooze state'
);

select throws_ok(
  $$ select * from public.schedule_notification_deliveries $$,
  '42501', null,
  'authenticated clients cannot read the delivery ledger'
);

select throws_ok(
  $$ select * from public.claim_schedule_notification_deliveries() $$,
  '42501', null,
  'authenticated clients cannot call the claim function'
);

select lives_ok(
  $$ select public.snooze_schedule(
       '20000000-0000-0000-0000-000000000001', 1
     ) $$,
  'a household member can snooze before the first reminder'
);

select lives_ok(
  $$ select public.snooze_schedule(
       '20000000-0000-0000-0000-000000000001', null::integer
     ) $$,
  'a household member can explicitly clear a snooze'
);

select test_as('00000000-0000-0000-0000-000000000002', 'bob@example.com');

select throws_ok(
  $$ select public.snooze_schedule(
       '20000000-0000-0000-0000-000000000001', 1
     ) $$,
  'P0001', 'Schedule not found',
  'snooze does not reveal a foreign schedule'
);

reset role;

select is(
  private.schedule_reminder_slot(
    '2026-03-08', 0, 'daily', null, '02:30', 'America/Chicago',
    '2026-03-08T07:59:59Z'
  ),
  null::timestamptz,
  'a schedule is ineligible before the spring-forward lead boundary'
);

select is(
  private.schedule_reminder_slot(
    '2026-03-08', 0, 'daily', null, '02:30', 'America/Chicago',
    '2026-03-08T08:00:00Z'
  ),
  '2026-03-08T08:00:00Z'::timestamptz,
  'a nonexistent local time starts at the first valid instant after the gap'
);

select is(
  private.schedule_reminder_slot(
    '2026-11-01', 0, 'daily', null, '01:30', 'America/Chicago',
    '2026-11-01T06:30:00Z'
  ),
  '2026-11-01T06:30:00Z'::timestamptz,
  'an overlapping local time uses its earlier instant'
);

select is(
  private.schedule_reminder_slot(
    '2026-03-07', 0, 'daily', null, '09:00', 'America/Chicago',
    '2026-03-08T14:00:00Z'
  ),
  '2026-03-08T14:00:00Z'::timestamptz,
  'daily slots stay at local reminder time across daylight saving'
);

select is(
  private.schedule_reminder_slot(
    '2026-08-01', 0, 'hourly', null, '09:00', 'Asia/Tokyo',
    '2026-08-01T02:59:00Z'
  ),
  '2026-08-01T02:00:00Z'::timestamptz,
  'hourly slots advance on a 60-minute UTC grid from the local anchor'
);

select is(
  private.schedule_reminder_slot(
    '2026-08-01', 0, 'weekly', null, '09:00', 'Asia/Tokyo',
    '2026-08-08T00:00:00Z'
  ),
  '2026-08-08T00:00:00Z'::timestamptz,
  'weekly slots advance by seven local calendar days'
);

select is(
  private.schedule_reminder_slot(
    '2026-08-21', 7, 'daily', null, '09:00', 'UTC',
    '2026-08-14T08:59:59Z'
  ),
  null::timestamptz,
  'initial eligibility is absent immediately before the lead boundary'
);

select is(
  private.schedule_reminder_slot(
    '2026-08-21', 7, 'daily', null, '09:00', 'UTC',
    '2026-08-14T09:00:00Z'
  ),
  '2026-08-14T09:00:00Z'::timestamptz,
  'initial eligibility begins exactly at the lead boundary'
);

select is(
  private.schedule_reminder_slot(
    '2026-12-01', 14, 'weekly', '2026-08-22T09:00:00Z', '09:00', 'UTC',
    '2026-08-22T09:00:00Z'
  ),
  null::timestamptz,
  'a snooze expiring before the lead window does not start reminders early'
);

select is(
  private.schedule_reminder_slot(
    '2026-12-01', 14, 'weekly', '2026-08-22T09:00:00Z', '09:00', 'UTC',
    '2026-11-17T09:00:00Z'
  ),
  '2026-11-17T09:00:00Z'::timestamptz,
  'an early snooze still yields the lead boundary as the first slot'
);

delete from public.maintenance_schedules;
insert into public.maintenance_schedules (
  id, household_id, name, interval_months, next_due,
  reminder_lead_days, reminder_frequency
)
select '20000000-0000-0000-0000-000000000101', household_id,
       'Claim task', 1, current_date, 0, 'daily'
from alice_household;

select results_eq(
  $$ select count(*)::int
     from public.claim_schedule_notification_deliveries(
       10, date_trunc('day', now()) + interval '12 hours'
     ) $$,
  $$ values (2) $$,
  'one eligible occurrence claims independently for both channels'
);

select results_eq(
  $$ select count(*)::int
     from public.claim_schedule_notification_deliveries(
       10, date_trunc('day', now()) + interval '12 hours'
     ) $$,
  $$ values (0) $$,
  'a competing claim invocation wins no duplicate slots'
);

select throws_ok(
  $$ insert into public.schedule_notification_deliveries (
       id, schedule_id, occurrence_due_on, channel, slot_at
     )
     select '30000000-0000-0000-0000-000000000001', schedule_id,
            occurrence_due_on, channel, slot_at
     from public.schedule_notification_deliveries limit 1 $$,
  '23505', null,
  'the slot uniqueness constraint rejects a duplicate claim'
);

do $$ begin
  perform public.record_schedule_notification_result(
    (select id from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000101'
       and channel = 'discord'),
    true, null, null, 204, false,
    date_trunc('day', now()) + interval '12 hours'
  );
end $$;

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
select lives_ok(
  $$ select public.snooze_schedule(
       '20000000-0000-0000-0000-000000000101', 1
     ) $$,
  'snoozing after a claim succeeds'
);
reset role;

select results_eq(
  $$ select status::text from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000101'
     order by status $$,
  $$ values ('cancelled'::text), ('delivered'::text) $$,
  'snoozing after delivery preserves history and cancels outstanding claims'
);

select results_eq(
  $$ select count(*)::int
     from public.claim_schedule_notification_deliveries(
       10,
       (select snoozed_until - interval '1 second'
        from public.maintenance_schedules
        where id = '20000000-0000-0000-0000-000000000101')
     ) $$,
  $$ values (0) $$,
  'a snoozed occurrence remains ineligible before expiry'
);

select results_eq(
  $$ select count(*)::int
     from public.claim_schedule_notification_deliveries(
       10,
       (select snoozed_until
        from public.maintenance_schedules
        where id = '20000000-0000-0000-0000-000000000101')
     ) $$,
  $$ values (2) $$,
  'a snoozed occurrence is immediately eligible at expiry'
);

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
select lives_ok(
  $$ select public.snooze_schedule(
       '20000000-0000-0000-0000-000000000101', null::integer
     ) $$,
  'un-snoozing an occurrence succeeds'
);
reset role;

select results_eq(
  $$ select count(*)::int
     from public.claim_schedule_notification_deliveries(
       10, date_trunc('day', now()) + interval '12 hours'
     ) $$,
  $$ values (1) $$,
  'un-snoozing reclaims the cancelled original slot'
);

create temporary table claimed_before_completion as
select id from public.schedule_notification_deliveries
where schedule_id = '20000000-0000-0000-0000-000000000101'
  and status = 'claimed'
limit 1;

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
select lives_ok(
  $$ select public.complete_schedule(
       '20000000-0000-0000-0000-000000000101', current_date,
       current_date + 30, null, null, null
     ) $$,
  'completion can race after a claim without losing the schedule update'
);
reset role;

select results_eq(
  $$ select next_due, snoozed_until from public.maintenance_schedules
     where id = '20000000-0000-0000-0000-000000000101' $$,
  $$ values ((current_date + 30)::date, null::timestamptz) $$,
  'completion advances the occurrence and clears snooze state'
);

select results_eq(
  $$ select count(*)::int from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000101'
       and occurrence_due_on = current_date and status = 'cancelled' $$,
  $$ values (3) $$,
  'completion cancels all outstanding undelivered claims for the old occurrence'
);

select is(
  public.revalidate_schedule_notification_claim(
    (select id from claimed_before_completion)
  ),
  false,
  'a sender revalidation rejects a claim completed before provider contact'
);

delete from public.maintenance_schedules;
insert into public.maintenance_schedules (
  id, household_id, name, interval_months, next_due,
  reminder_lead_days, reminder_frequency, snoozed_until
)
select '20000000-0000-0000-0000-000000000102', household_id,
       'Due edit task', 1, current_date, 0, 'daily', now() - interval '1 hour'
from alice_household;

select results_eq(
  $$ select count(*)::int
     from public.claim_schedule_notification_deliveries(10, now()) $$,
  $$ values (2) $$,
  'an expired snooze anchors an immediately eligible claim'
);

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
update public.maintenance_schedules set next_due = current_date + 10
where id = '20000000-0000-0000-0000-000000000102';
reset role;

select results_eq(
  $$ select snoozed_until,
            (select count(*)::int
             from public.schedule_notification_deliveries d
             where d.schedule_id = s.id and d.status = 'cancelled')
     from public.maintenance_schedules s
     where id = '20000000-0000-0000-0000-000000000102' $$,
  $$ values (null::timestamptz, 2) $$,
  'a direct due-date edit clears snooze state and cancels old claims'
);

delete from public.maintenance_schedules;
insert into public.maintenance_schedules (
  id, household_id, name, interval_months, next_due,
  reminder_lead_days, reminder_frequency
)
select '20000000-0000-0000-0000-000000000103', household_id,
       'Disabled task', 1, current_date, 0, 'daily'
from alice_household;
do $$ begin
  perform * from public.claim_schedule_notification_deliveries(10, now());
end $$;

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
update public.maintenance_schedules set reminder_enabled = false
where id = '20000000-0000-0000-0000-000000000103';
reset role;

select results_eq(
  $$ select count(*)::int from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000103'
       and status = 'cancelled' $$,
  $$ values (2) $$,
  'disabling a schedule cancels its outstanding claims'
);

insert into public.maintenance_schedules (
  id, household_id, name, interval_months, next_due,
  reminder_lead_days, reminder_frequency
)
select '20000000-0000-0000-0000-000000000104', household_id,
       'Master switch task', 1, current_date, 0, 'daily'
from alice_household;

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
update public.notification_settings set enabled = false;
reset role;

select results_eq(
  $$ select count(*)::int from public.claim_schedule_notification_deliveries(10, now()) $$,
  $$ values (0) $$,
  'the household master switch suppresses schedule claims'
);

update public.notification_settings set enabled = true;
do $$ begin
  perform * from public.claim_schedule_notification_deliveries(10, now());
end $$;
delete from public.maintenance_schedules
where id = '20000000-0000-0000-0000-000000000104';

select is_empty(
  $$ select id from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000104' $$,
  'deleting a schedule cascades its delivery history'
);

delete from public.maintenance_schedules;
update public.notification_settings
set telegram_bot_token = null, telegram_chat_id = null;
insert into public.maintenance_schedules (
  id, household_id, name, interval_months, next_due,
  reminder_lead_days, reminder_frequency
)
select '20000000-0000-0000-0000-000000000106', household_id,
       'Retry task', 1, current_date, 0, 'daily'
from alice_household;
do $$ begin
  perform * from public.claim_schedule_notification_deliveries(
    10, date_trunc('day', now()) + interval '12 hours'
  );
end $$;

do $$ begin
  perform public.record_schedule_notification_result(
    (select id from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000106'),
    false, 'rate_limited', 'Provider rate limit reached', 429, true,
    date_trunc('day', now()) + interval '12 hours'
  );
end $$;

select results_eq(
  $$ select status::text, retryable, attempt_count, next_attempt_at
     from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000106' $$,
  $$ values (
       'failed'::text, true, 1,
       date_trunc('day', now()) + interval '12 hours 5 minutes'
     ) $$,
  'rate limiting records a retryable failure and bounded backoff'
);

select results_eq(
  $$ select count(*)::int from public.claim_schedule_notification_deliveries(
       10, date_trunc('day', now()) + interval '12 hours 4 minutes'
     ) $$,
  $$ values (0) $$,
  'a failed claim is not retried before its backoff expires'
);

select results_eq(
  $$ select attempt_count from public.claim_schedule_notification_deliveries(
       10, date_trunc('day', now()) + interval '12 hours 5 minutes'
     ) $$,
  $$ values (2) $$,
  'a failed slot is reclaimed when its backoff expires'
);

select results_eq(
  $$ select attempt_count from public.claim_schedule_notification_deliveries(
       10, date_trunc('day', now()) + interval '12 hours 15 minutes'
     ) $$,
  $$ values (3) $$,
  'an expired delivery lease is reclaimed and may rarely duplicate externally'
);

do $$ begin
  perform public.record_schedule_notification_result(
    (select id from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000106'),
    false, 'authorization', 'Provider rejected authorization with HTTP 401',
    401, false, date_trunc('day', now()) + interval '12 hours 16 minutes'
  );
end $$;

select results_eq(
  $$ select discord_error from public.notification_settings $$,
  $$ values ('Provider rejected authorization with HTTP 401'::text) $$,
  'a permanent authorization failure surfaces a channel configuration error'
);

delete from public.maintenance_schedules;
update public.notification_settings
set telegram_bot_token = 'token', telegram_chat_id = 'chat';
insert into public.maintenance_schedules (
  id, household_id, name, interval_months, next_due,
  reminder_lead_days, reminder_frequency
)
select '20000000-0000-0000-0000-000000000107', household_id,
       'Healthy channel task', 1, current_date, 0, 'daily'
from alice_household;

select results_eq(
  $$ select channel::text from public.claim_schedule_notification_deliveries(10, now()) $$,
  $$ values ('telegram'::text) $$,
  'a permanent channel error does not stop an independent healthy channel'
);

select results_eq(
  $$ select discord_error is not null from public.notification_settings $$,
  $$ values (true) $$,
  'a telegram credential write leaves an unrelated discord error in place'
);

select test_as('00000000-0000-0000-0000-000000000001', 'alice@example.com');
insert into public.notification_settings as settings (
  household_id, enabled, discord_webhook_url, telegram_bot_token,
  telegram_chat_id, lead_time_days, time_zone, reminder_time,
  weekly_digest_enabled
)
select household_id, true, 'https://discord.example/webhook', 'token', 'chat',
       21, 'UTC', '00:00', true
from alice_household
on conflict (household_id) do update set
  household_id = excluded.household_id,
  enabled = excluded.enabled,
  discord_webhook_url = excluded.discord_webhook_url,
  telegram_bot_token = excluded.telegram_bot_token,
  telegram_chat_id = excluded.telegram_chat_id,
  lead_time_days = excluded.lead_time_days,
  time_zone = excluded.time_zone,
  reminder_time = excluded.reminder_time,
  weekly_digest_enabled = excluded.weekly_digest_enabled;
reset role;

select results_eq(
  $$ select discord_error from public.notification_settings $$,
  $$ values (null::text) $$,
  're-saving an unchanged webhook re-enables a channel a failure disabled'
);

do $$ begin
  perform public.record_schedule_notification_result(
    (select id from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000107'),
    true, null, null, 200, false, now()
  );
end $$;

-- A worker that dies between claiming and recording leaves a claimed row with
-- an expired lease. It must still leave the outstanding-claim index even when
-- its channel no longer appears in the claim query.
insert into public.maintenance_schedules (
  id, household_id, name, interval_months, next_due,
  reminder_lead_days, reminder_frequency
)
select '20000000-0000-0000-0000-000000000108', household_id,
       'Stranded task', 1, current_date, 0, 'daily'
from alice_household;
insert into public.schedule_notification_deliveries (
  schedule_id, occurrence_due_on, channel, slot_at, status,
  claimed_at, lease_expires_at, attempt_count
) values (
  '20000000-0000-0000-0000-000000000108', current_date, 'discord',
  date_trunc('day', now()), 'claimed',
  now() - interval '1 hour', now() - interval '50 minutes', 5
);
update public.notification_settings
set discord_error = 'disabled by an earlier failure';

do $$ begin
  perform * from public.claim_schedule_notification_deliveries(10, now());
end $$;

select results_eq(
  $$ select status::text from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000108'
       and channel = 'discord' $$,
  $$ values ('claimed'::text) $$,
  'the hourly claim cannot reach a stranded row on a disabled channel'
);

select is(
  public.cleanup_schedule_notification_deliveries(),
  0::bigint,
  'the daily job retires that stranded lease without deleting it yet'
);

select results_eq(
  $$ select status::text, retryable from public.schedule_notification_deliveries
     where schedule_id = '20000000-0000-0000-0000-000000000108'
       and channel = 'discord' $$,
  $$ values ('failed'::text, false) $$,
  'an expired lease with no retry budget is retired even on a disabled channel'
);

update public.schedule_notification_deliveries
set claimed_at = now() - interval '91 days'
where schedule_id = '20000000-0000-0000-0000-000000000108'
  and channel = 'telegram'
  and status = 'claimed';

select is(
  public.cleanup_schedule_notification_deliveries(),
  1::bigint,
  'a row stranded in claimed is removed after 90 days'
);

update public.schedule_notification_deliveries
set claimed_at = now() - interval '91 days',
    delivered_at = now() - interval '91 days'
where schedule_id = '20000000-0000-0000-0000-000000000107';

select is(
  public.cleanup_schedule_notification_deliveries(),
  1::bigint,
  'delivery diagnostics are removed after 90 days'
);

select * from finish();
rollback;
