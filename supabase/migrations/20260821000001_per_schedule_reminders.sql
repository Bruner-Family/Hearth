-- ADR-004: configurable per-schedule reminders, snoozing, and delivery state.

create type public.reminder_frequency as enum ('hourly', 'daily', 'weekly');
create type public.schedule_notification_channel as enum ('discord', 'telegram');
create type public.schedule_notification_delivery_status as enum
  ('claimed', 'delivered', 'failed', 'cancelled');

grant usage on type public.reminder_frequency to authenticated, service_role;
grant usage on type public.schedule_notification_channel to service_role;
grant usage on type public.schedule_notification_delivery_status to service_role;

alter table public.notification_settings
  add column time_zone text not null default 'UTC',
  add column reminder_time time without time zone not null default '09:00',
  add column weekly_digest_enabled boolean not null default true,
  add column discord_error text,
  add column telegram_error text;

create function private.validate_notification_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = new.time_zone
  ) then
    raise exception 'Unknown IANA time zone: %', new.time_zone
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger notification_settings_validate_time_zone
  before insert or update of time_zone on public.notification_settings
  for each row execute function private.validate_notification_time_zone();

create function private.clear_notification_channel_errors()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.discord_webhook_url is distinct from old.discord_webhook_url then
    new.discord_error := null;
  end if;
  if new.telegram_bot_token is distinct from old.telegram_bot_token
     or new.telegram_chat_id is distinct from old.telegram_chat_id then
    new.telegram_error := null;
  end if;
  return new;
end;
$$;

create trigger notification_settings_clear_channel_errors
  before update on public.notification_settings
  for each row execute function private.clear_notification_channel_errors();

alter table public.maintenance_schedules
  add column reminder_enabled boolean not null default true,
  add column reminder_lead_days integer not null default 14
    check (reminder_lead_days between 0 and 365),
  add column reminder_frequency public.reminder_frequency not null default 'weekly',
  add column snoozed_until timestamptz;

update public.maintenance_schedules as schedule
set reminder_lead_days = coalesce(settings.lead_time_days, 14)
from public.notification_settings as settings
where settings.household_id = schedule.household_id;

create table public.schedule_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.maintenance_schedules (id) on delete cascade,
  occurrence_due_on date not null,
  channel public.schedule_notification_channel not null,
  slot_at timestamptz not null,
  status public.schedule_notification_delivery_status not null default 'claimed',
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  retryable boolean not null default true,
  next_attempt_at timestamptz,
  last_error_code text check (
    last_error_code is null or last_error_code in (
      'network', 'timeout', 'rate_limited', 'client', 'server',
      'authorization', 'configuration'
    )
  ),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  last_http_status integer check (
    last_http_status is null or last_http_status between 100 and 599
  ),
  unique (schedule_id, occurrence_due_on, channel, slot_at)
);

create unique index schedule_notification_deliveries_one_outstanding_idx
  on public.schedule_notification_deliveries
    (schedule_id, occurrence_due_on, channel)
  where status = 'claimed'
     or (status = 'failed' and retryable and attempt_count < 5);

create index schedule_notification_deliveries_cleanup_idx
  on public.schedule_notification_deliveries (claimed_at)
  where status in ('delivered', 'failed', 'cancelled');

alter table public.schedule_notification_deliveries enable row level security;
revoke all on public.schedule_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete
  on public.schedule_notification_deliveries to service_role;

-- PostgreSQL resolves spring-forward gaps by moving a local timestamp forward,
-- but chooses the later instant during a fall-back overlap. ADR-004 requires
-- the first valid instant after a gap and the earlier instant in an overlap.
create function private.reminder_local_instant(
  p_day date,
  p_time time without time zone,
  p_time_zone text
) returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  local_value timestamp without time zone := p_day + p_time;
  guess timestamptz;
  matched timestamptz;
  minute_offset integer;
begin
  guess := local_value at time zone p_time_zone;

  select min(candidate.instant)
  into matched
  from pg_catalog.generate_series(
    guess - interval '3 hours',
    guess + interval '3 hours',
    interval '1 minute'
  ) as candidate(instant)
  where candidate.instant at time zone p_time_zone = local_value;

  if matched is not null then
    return matched;
  end if;

  -- A DST gap has no matching UTC instant. Walk to its first valid minute.
  for minute_offset in 1..180 loop
    local_value := p_day + p_time + minute_offset * interval '1 minute';
    guess := local_value at time zone p_time_zone;
    if guess at time zone p_time_zone = local_value then
      return guess;
    end if;
  end loop;

  raise exception 'Could not resolve reminder time in time zone %', p_time_zone;
end;
$$;

create function private.schedule_reminder_slot(
  p_next_due date,
  p_lead_days integer,
  p_frequency public.reminder_frequency,
  p_snoozed_until timestamptz,
  p_reminder_time time without time zone,
  p_time_zone text,
  p_now timestamptz
) returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  first_eligible timestamptz;
  anchor_at timestamptz;
  anchor_day date;
  now_day date;
  step_days integer;
  elapsed_steps integer;
  slot_at timestamptz;
begin
  first_eligible := private.reminder_local_instant(
    p_next_due - p_lead_days,
    p_reminder_time,
    p_time_zone
  );

  if p_snoozed_until is not null and p_snoozed_until > p_now then
    return null;
  end if;

  anchor_at := coalesce(p_snoozed_until, first_eligible);
  if p_now < anchor_at then
    return null;
  end if;

  if p_frequency = 'hourly' then
    return anchor_at
      + floor(extract(epoch from p_now - anchor_at) / 3600) * interval '1 hour';
  end if;

  step_days := case when p_frequency = 'daily' then 1 else 7 end;
  anchor_day := (anchor_at at time zone p_time_zone)::date;
  now_day := (p_now at time zone p_time_zone)::date;
  elapsed_steps := greatest(0, (now_day - anchor_day) / step_days);
  slot_at := private.reminder_local_instant(
    anchor_day + elapsed_steps * step_days,
    p_reminder_time,
    p_time_zone
  );

  if slot_at > p_now and elapsed_steps > 0 then
    elapsed_steps := elapsed_steps - 1;
    slot_at := private.reminder_local_instant(
      anchor_day + elapsed_steps * step_days,
      p_reminder_time,
      p_time_zone
    );
  end if;

  if slot_at > p_now or slot_at < anchor_at then
    return anchor_at;
  end if;
  return slot_at;
end;
$$;

create function private.cancel_schedule_notification_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.next_due is distinct from new.next_due
     or old.reminder_lead_days is distinct from new.reminder_lead_days
     or old.reminder_frequency is distinct from new.reminder_frequency
     or (old.reminder_enabled and not new.reminder_enabled) then
    update public.schedule_notification_deliveries
    set status = 'cancelled',
        lease_expires_at = null,
        next_attempt_at = null,
        retryable = false
    where schedule_id = old.id
      and occurrence_due_on = old.next_due
      and (
        status = 'claimed'
        or (status = 'failed' and retryable and attempt_count < 5)
      );
  end if;
  return new;
end;
$$;

create function private.clear_schedule_snooze_on_due_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.next_due is distinct from new.next_due then
    new.snoozed_until := null;
  end if;
  return new;
end;
$$;

create trigger maintenance_schedules_clear_snooze_on_due_change
  before update of next_due on public.maintenance_schedules
  for each row execute function private.clear_schedule_snooze_on_due_change();

create trigger maintenance_schedules_cancel_notification_claims
  after update of next_due, reminder_enabled, reminder_lead_days,
    reminder_frequency on public.maintenance_schedules
  for each row execute function private.cancel_schedule_notification_claims();

create function private.cancel_household_notification_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.enabled is distinct from new.enabled
     or old.time_zone is distinct from new.time_zone
     or old.reminder_time is distinct from new.reminder_time
     or old.discord_webhook_url is distinct from new.discord_webhook_url
     or old.telegram_bot_token is distinct from new.telegram_bot_token
     or old.telegram_chat_id is distinct from new.telegram_chat_id then
    update public.schedule_notification_deliveries as delivery
    set status = 'cancelled',
        lease_expires_at = null,
        next_attempt_at = null,
        retryable = false
    from public.maintenance_schedules as schedule
    where schedule.household_id = new.household_id
      and delivery.schedule_id = schedule.id
      and (
        delivery.status = 'claimed'
        or (
          delivery.status = 'failed'
          and delivery.retryable
          and delivery.attempt_count < 5
        )
      );
  end if;
  return new;
end;
$$;

create trigger notification_settings_cancel_schedule_claims
  after update on public.notification_settings
  for each row execute function private.cancel_household_notification_claims();

create function public.snooze_schedule(
  schedule_id uuid,
  snoozed_until timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule public.maintenance_schedules%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into schedule
  from public.maintenance_schedules
  where id = schedule_id
  for update;

  if not found or not private.is_household_member(schedule.household_id) then
    raise exception 'Schedule not found';
  end if;

  if snoozed_until is not null and (
    snoozed_until <= v_now
    or snoozed_until > v_now + interval '365 days'
  ) then
    raise exception 'Snooze must be in the future and no more than 365 days away';
  end if;

  update public.maintenance_schedules
  set snoozed_until = snooze_schedule.snoozed_until
  where id = schedule_id;

  update public.schedule_notification_deliveries as delivery
  set status = 'cancelled',
      lease_expires_at = null,
      next_attempt_at = null,
      retryable = false
  where delivery.schedule_id = schedule.id
    and delivery.occurrence_due_on = schedule.next_due
    and (
      delivery.status = 'claimed'
      or (
        delivery.status = 'failed'
        and delivery.retryable
        and delivery.attempt_count < 5
      )
    );
end;
$$;

revoke all on function public.snooze_schedule(uuid, timestamptz)
  from public, anon;
grant execute on function public.snooze_schedule(uuid, timestamptz)
  to authenticated;

create function public.claim_schedule_notification_deliveries(
  p_batch_size integer default 100,
  p_now timestamptz default now()
) returns table (
  delivery_id uuid,
  household_id uuid,
  household_name text,
  schedule_id uuid,
  schedule_name text,
  item_name text,
  occurrence_due_on date,
  channel public.schedule_notification_channel,
  slot_at timestamptz,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule record;
  channel_row record;
  delivery public.schedule_notification_deliveries%rowtype;
  won integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'Batch size must be between 1 and 500';
  end if;

  for schedule in
    select
      s.id,
      s.household_id,
      h.name as household_name,
      s.name,
      i.name as item_name,
      s.next_due,
      settings.discord_webhook_url,
      settings.telegram_bot_token,
      settings.telegram_chat_id,
      settings.discord_error,
      settings.telegram_error,
      slot.value as slot_at
    from public.maintenance_schedules as s
    join public.notification_settings as settings
      on settings.household_id = s.household_id
    join public.households as h on h.id = s.household_id
    left join public.items as i on i.id = s.item_id
    cross join lateral (
      select private.schedule_reminder_slot(
        s.next_due,
        s.reminder_lead_days,
        s.reminder_frequency,
        s.snoozed_until,
        settings.reminder_time,
        settings.time_zone,
        p_now
      ) as value
    ) as slot
    where settings.enabled
      and s.reminder_enabled
      and (s.snoozed_until is null or s.snoozed_until <= p_now)
      and slot.value is not null
      and (
        (
          settings.discord_webhook_url is not null
          and settings.discord_error is null
        )
        or (
          settings.telegram_bot_token is not null
          and settings.telegram_chat_id is not null
          and settings.telegram_error is null
        )
      )
    order by slot.value, s.id
    limit p_batch_size * 2
    for update of s skip locked
  loop
    for channel_row in
      select candidate.value::public.schedule_notification_channel as value
      from (values ('discord'), ('telegram')) as candidate(value)
      where (
        candidate.value = 'discord'
        and schedule.discord_webhook_url is not null
        and schedule.discord_error is null
      ) or (
        candidate.value = 'telegram'
        and schedule.telegram_bot_token is not null
        and schedule.telegram_chat_id is not null
        and schedule.telegram_error is null
      )
    loop
      update public.schedule_notification_deliveries as expired
      set status = 'failed',
          retryable = false,
          lease_expires_at = null,
          last_error_code = 'timeout',
          last_error = 'Retry budget exhausted after delivery lease expiry'
      where expired.schedule_id = schedule.id
        and expired.occurrence_due_on = schedule.next_due
        and expired.channel = channel_row.value
        and expired.status = 'claimed'
        and expired.lease_expires_at <= p_now
        and expired.attempt_count >= 5;

      select existing.* into delivery
      from public.schedule_notification_deliveries as existing
      where existing.schedule_id = schedule.id
        and existing.occurrence_due_on = schedule.next_due
        and existing.channel = channel_row.value
        and (
          (
            existing.status = 'claimed'
            and existing.lease_expires_at <= p_now
            and existing.attempt_count < 5
          )
          or (
            existing.status = 'failed'
            and existing.retryable
            and existing.next_attempt_at <= p_now
            and existing.attempt_count < 5
          )
          or (
            existing.status = 'cancelled'
            and existing.slot_at = schedule.slot_at
          )
        )
      order by existing.slot_at
      limit 1
      for update skip locked;

      if found then
        update public.schedule_notification_deliveries
        set status = 'claimed',
            claimed_at = p_now,
            lease_expires_at = p_now + interval '10 minutes',
            delivered_at = null,
            attempt_count = case
              when delivery.status = 'cancelled' then 1
              else delivery.attempt_count + 1
            end,
            retryable = true,
            next_attempt_at = null,
            last_error_code = null,
            last_error = null,
            last_http_status = null
        where id = delivery.id
        returning * into delivery;
      else
        delivery := null;
        insert into public.schedule_notification_deliveries (
          schedule_id,
          occurrence_due_on,
          channel,
          slot_at,
          claimed_at,
          lease_expires_at
        ) values (
          schedule.id,
          schedule.next_due,
          channel_row.value,
          schedule.slot_at,
          p_now,
          p_now + interval '10 minutes'
        )
        on conflict do nothing
        returning * into delivery;
      end if;

      if delivery.id is not null then
        delivery_id := delivery.id;
        household_id := schedule.household_id;
        household_name := schedule.household_name;
        schedule_id := schedule.id;
        schedule_name := schedule.name;
        item_name := schedule.item_name;
        occurrence_due_on := schedule.next_due;
        channel := channel_row.value;
        slot_at := delivery.slot_at;
        attempt_count := delivery.attempt_count;
        return next;
        won := won + 1;
        if won >= p_batch_size then
          return;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function
  public.claim_schedule_notification_deliveries(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.claim_schedule_notification_deliveries(integer, timestamptz)
  to service_role;

create function public.revalidate_schedule_notification_claim(
  p_delivery_id uuid,
  p_now timestamptz default now()
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.schedule_notification_deliveries%rowtype;
  valid_claim boolean;
begin
  select d.* into delivery
  from public.schedule_notification_deliveries as d
  where d.id = p_delivery_id
  for update;

  if not found then
    return false;
  end if;

  select
    delivery.status = 'claimed'
    and delivery.lease_expires_at > p_now
    and schedule.next_due = delivery.occurrence_due_on
    and schedule.reminder_enabled
    and (schedule.snoozed_until is null or schedule.snoozed_until <= p_now)
    and settings.enabled
    and case delivery.channel
      when 'discord' then
        settings.discord_webhook_url is not null and settings.discord_error is null
      when 'telegram' then
        settings.telegram_bot_token is not null
        and settings.telegram_chat_id is not null
        and settings.telegram_error is null
    end
  into valid_claim
  from public.maintenance_schedules as schedule
  join public.notification_settings as settings
    on settings.household_id = schedule.household_id
  where schedule.id = delivery.schedule_id
  for update of schedule;

  if coalesce(valid_claim, false) then
    return true;
  end if;

  update public.schedule_notification_deliveries
  set status = 'cancelled',
      lease_expires_at = null,
      next_attempt_at = null,
      retryable = false
  where id = p_delivery_id and status = 'claimed';
  return false;
end;
$$;

revoke all on function
  public.revalidate_schedule_notification_claim(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.revalidate_schedule_notification_claim(uuid, timestamptz)
  to service_role;

create function public.record_schedule_notification_result(
  p_delivery_id uuid,
  p_delivered boolean,
  p_error_code text default null,
  p_error text default null,
  p_http_status integer default null,
  p_retryable boolean default true,
  p_now timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.schedule_notification_deliveries%rowtype;
  household uuid;
  should_retry boolean;
begin
  select * into delivery
  from public.schedule_notification_deliveries
  where id = p_delivery_id
  for update;

  if not found or delivery.status <> 'claimed' then
    return;
  end if;

  select household_id into household
  from public.maintenance_schedules
  where id = delivery.schedule_id;

  if p_delivered then
    update public.schedule_notification_deliveries
    set status = 'delivered',
        delivered_at = p_now,
        lease_expires_at = null,
        retryable = false,
        next_attempt_at = null,
        last_error_code = null,
        last_error = null,
        last_http_status = p_http_status
    where id = p_delivery_id;

    if delivery.channel = 'discord' then
      update public.notification_settings set discord_error = null
      where household_id = household;
    else
      update public.notification_settings set telegram_error = null
      where household_id = household;
    end if;
    return;
  end if;

  should_retry := p_retryable and delivery.attempt_count < 5;
  update public.schedule_notification_deliveries
  set status = 'failed',
      lease_expires_at = null,
      retryable = should_retry,
      next_attempt_at = case
        when not should_retry then null
        when delivery.attempt_count = 1 then p_now + interval '5 minutes'
        when delivery.attempt_count = 2 then p_now + interval '15 minutes'
        when delivery.attempt_count = 3 then p_now + interval '1 hour'
        else p_now + interval '6 hours'
      end,
      last_error_code = p_error_code,
      last_error = left(p_error, 500),
      last_http_status = p_http_status
  where id = p_delivery_id;

  if not p_retryable and household is not null then
    if delivery.channel = 'discord' then
      update public.notification_settings
      set discord_error = left(p_error, 500)
      where household_id = household;
    else
      update public.notification_settings
      set telegram_error = left(p_error, 500)
      where household_id = household;
    end if;
  end if;
end;
$$;

revoke all on function public.record_schedule_notification_result(
  uuid, boolean, text, text, integer, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_schedule_notification_result(
  uuid, boolean, text, text, integer, boolean, timestamptz
) to service_role;

create function public.cleanup_schedule_notification_deliveries(
  p_now timestamptz default now()
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed bigint;
begin
  delete from public.schedule_notification_deliveries
  where status in ('delivered', 'failed', 'cancelled')
    and claimed_at < p_now - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.cleanup_schedule_notification_deliveries(timestamptz)
  from public, anon, authenticated;
grant execute on function public.cleanup_schedule_notification_deliveries(timestamptz)
  to service_role;

-- Completion advances to a new occurrence, clears snooze state, and lets the
-- due-date trigger cancel claims for the completed occurrence atomically.
create or replace function public.complete_schedule(
  schedule_id uuid,
  performed_on date,
  new_next_due date,
  cost_cents bigint default null,
  performed_by text default null,
  notes text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  sched public.maintenance_schedules%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into sched
  from public.maintenance_schedules
  where id = schedule_id
  for update;

  if not found or not private.is_household_member(sched.household_id) then
    raise exception 'Schedule not found';
  end if;

  if new_next_due <= complete_schedule.performed_on then
    raise exception 'Next due must be after the completion date';
  end if;

  if sched.item_id is not null then
    insert into public.maintenance_logs
      (item_id, performed_on, cost_cents, performed_by, notes, created_by)
    values (
      sched.item_id,
      complete_schedule.performed_on,
      complete_schedule.cost_cents,
      complete_schedule.performed_by,
      coalesce(nullif(trim(complete_schedule.notes), ''), sched.name),
      auth.uid()
    );
  end if;

  update public.maintenance_schedules
  set next_due = new_next_due,
      last_completed_on = complete_schedule.performed_on,
      snoozed_until = null
  where id = schedule_id;
end;
$$;

-- The weekly digest now contains only warranties and end-of-life notices.
create or replace function public.notifications_digest(
  p_household uuid,
  p_lead_days integer
) returns table (kind text, title text, detail text, due_on date)
language sql
security definer
set search_path = ''
as $$
  select
    'warranty'::text,
    coalesce(coalesce(i.icon, c.icon) || ' ', '') || i.name,
    'warranty ends ' || to_char(i.warranty_until, 'Mon FMDD, YYYY'),
    i.warranty_until
  from public.items i
  join public.item_categories c on c.id = i.category_id
  where i.household_id = p_household
    and i.warranty_until is not null
    and i.warranty_until between current_date and current_date + p_lead_days

  union all

  select
    'end_of_life'::text,
    coalesce(coalesce(i.icon, c.icon) || ' ', '') || i.name,
    round((current_date - i.purchase_date)::numeric / 365.25)::text
      || ' of ' || coalesce(i.lifespan_years_override, c.default_lifespan_years)::text
      || ' expected years',
    (i.purchase_date
       + (coalesce(i.lifespan_years_override, c.default_lifespan_years)
          * interval '1 year'))::date
  from public.items i
  join public.item_categories c on c.id = i.category_id
  where i.household_id = p_household
    and i.purchase_date is not null
    and coalesce(i.lifespan_years_override, c.default_lifespan_years) > 0
    and ((current_date - i.purchase_date)::numeric / 365.25)
        / coalesce(i.lifespan_years_override, c.default_lifespan_years) >= 0.9

  order by 4 nulls last;
$$;

revoke all on function public.notifications_digest(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.notifications_digest(uuid, integer)
  to service_role;

-- Existing eligible weekly schedules get a delivered baseline at cutover, so
-- enabling the hourly worker does not immediately repeat the legacy digest.
insert into public.schedule_notification_deliveries (
  schedule_id,
  occurrence_due_on,
  channel,
  slot_at,
  status,
  claimed_at,
  delivered_at,
  retryable
)
select
  schedule.id,
  schedule.next_due,
  channels.value::public.schedule_notification_channel,
  slot.value,
  'delivered',
  statement_timestamp(),
  statement_timestamp(),
  false
from public.maintenance_schedules as schedule
join public.notification_settings as settings
  on settings.household_id = schedule.household_id
cross join lateral (
  select candidate.value
  from (values ('discord'), ('telegram')) as candidate(value)
  where (candidate.value = 'discord' and settings.discord_webhook_url is not null)
     or (
       candidate.value = 'telegram'
       and settings.telegram_bot_token is not null
       and settings.telegram_chat_id is not null
     )
) as channels
cross join lateral (
  select private.schedule_reminder_slot(
    schedule.next_due,
    schedule.reminder_lead_days,
    schedule.reminder_frequency,
    schedule.snoozed_until,
    settings.reminder_time,
    settings.time_zone,
    statement_timestamp()
  ) as value
) as slot
where settings.enabled
  and schedule.reminder_enabled
  and slot.value is not null
on conflict do nothing;

revoke insert, update on public.maintenance_schedules from authenticated;
grant insert (
  id,
  household_id,
  item_id,
  name,
  interval_months,
  anchor_month,
  next_due,
  notes,
  reminder_enabled,
  reminder_lead_days,
  reminder_frequency
) on public.maintenance_schedules to authenticated;
grant update (
  name,
  interval_months,
  anchor_month,
  next_due,
  notes,
  reminder_enabled,
  reminder_lead_days,
  reminder_frequency
) on public.maintenance_schedules to authenticated;

revoke insert, update on public.notification_settings from authenticated;
grant insert (
  household_id,
  enabled,
  discord_webhook_url,
  telegram_bot_token,
  telegram_chat_id,
  lead_time_days,
  time_zone,
  reminder_time,
  weekly_digest_enabled
) on public.notification_settings to authenticated;
grant update (
  enabled,
  discord_webhook_url,
  telegram_bot_token,
  telegram_chat_id,
  lead_time_days,
  time_zone,
  reminder_time,
  weekly_digest_enabled
) on public.notification_settings to authenticated;
