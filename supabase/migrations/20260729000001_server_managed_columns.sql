-- The authenticated role previously had table-wide INSERT and UPDATE grants
-- on these tables. RLS constrained which household rows a user could reach,
-- but it did not stop that user from forging creator/timestamp values or
-- moving an existing row to a different parent.
--
-- Replace the broad write grants with explicit client-managed column lists.
-- Creator/timestamp fields, ownership links on existing rows, and completion
-- metadata remain server-managed. Clients may still supply UUID primary keys
-- on insert for compatibility, but cannot update them afterward.

revoke insert, update on public.items from authenticated;
grant insert (
  id,
  household_id,
  category_id,
  name,
  location,
  purchase_date,
  purchase_date_precision,
  price_cents,
  vendor,
  brand,
  model,
  serial_number,
  warranty_until,
  lifespan_years_override,
  notes,
  reference_details,
  icon
) on public.items to authenticated;
grant update (
  category_id,
  name,
  location,
  purchase_date,
  purchase_date_precision,
  price_cents,
  vendor,
  brand,
  model,
  serial_number,
  warranty_until,
  lifespan_years_override,
  notes,
  reference_details,
  icon
) on public.items to authenticated;

revoke insert, update on public.maintenance_logs from authenticated;
grant insert (
  id,
  item_id,
  performed_on,
  cost_cents,
  performed_by,
  notes
) on public.maintenance_logs to authenticated;
grant update (
  performed_on,
  cost_cents,
  performed_by,
  notes
) on public.maintenance_logs to authenticated;

revoke insert, update on public.maintenance_schedules from authenticated;
grant insert (
  id,
  household_id,
  item_id,
  name,
  interval_months,
  anchor_month,
  next_due,
  notes
) on public.maintenance_schedules to authenticated;
grant update (
  name,
  interval_months,
  anchor_month,
  next_due,
  notes
) on public.maintenance_schedules to authenticated;
