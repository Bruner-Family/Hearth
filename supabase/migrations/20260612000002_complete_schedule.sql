-- Roadmap spec v1.2 — one-tap completion: write the same maintenance_logs row
-- a manual entry would AND advance the schedule, atomically. Security definer
-- (bypasses RLS), so it must re-check household membership itself, like
-- accept_invite. The client computes new_next_due (src/lib/schedule.ts is the
-- single source of cadence truth); this function only validates it advances.

create function public.complete_schedule(
  schedule_id   uuid,
  performed_on  date,
  new_next_due  date,
  cost_cents    bigint default null,
  performed_by  text default null,
  notes         text default null
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

  -- One error for missing and foreign rows: don't leak existence.
  if not found or not private.is_household_member(sched.household_id) then
    raise exception 'Schedule not found';
  end if;

  if new_next_due <= complete_schedule.performed_on then
    raise exception 'Next due must be after the completion date';
  end if;

  -- House-level schedules (item_id null) have nothing to log against;
  -- maintenance_logs.item_id stays NOT NULL.
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
  set next_due = new_next_due, last_completed_on = complete_schedule.performed_on
  where id = schedule_id;
end;
$$;

revoke all on function
  public.complete_schedule(uuid, date, date, bigint, text, text)
  from public, anon;
grant execute on function
  public.complete_schedule(uuid, date, date, bigint, text, text)
  to authenticated;
