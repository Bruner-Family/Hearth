-- Updates notifications_digest so a per-item `icon` override (items.icon) is
-- preferred over the category icon in the 'warranty' and 'end_of_life' branches.

create or replace function public.notifications_digest(p_household uuid, p_lead_days integer)
returns table (
  kind   text,   -- 'schedule' | 'warranty' | 'end_of_life'
  title  text,
  detail text,
  due_on date
)
language sql
security definer
set search_path = ''
as $$
  -- Due or upcoming maintenance schedules (overdue included).
  select
    'schedule'::text,
    coalesce(i.name || ' — ', '') || s.name,
    case
      when s.interval_months = 1 then 'every month'
      when s.interval_months = 12 then 'every year'
      when s.interval_months is not null then 'every ' || s.interval_months || ' months'
      else 'every ' || to_char(to_date(lpad(s.anchor_month::text, 2, '0'), 'MM'), 'FMMonth')
    end,
    s.next_due
  from public.maintenance_schedules s
  left join public.items i on i.id = s.item_id
  where s.household_id = p_household
    and s.next_due <= current_date + p_lead_days

  union all

  -- Warranties expiring within the lead window.
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

  -- Items at or past 90% of expected lifespan (standing condition).
  select
    'end_of_life'::text,
    coalesce(coalesce(i.icon, c.icon) || ' ', '') || i.name,
    round((current_date - i.purchase_date)::numeric / 365.25)::text
      || ' of ' || coalesce(i.lifespan_years_override, c.default_lifespan_years)::text
      || ' expected years',
    (i.purchase_date
       + (coalesce(i.lifespan_years_override, c.default_lifespan_years) * interval '1 year'))::date
  from public.items i
  join public.item_categories c on c.id = i.category_id
  where i.household_id = p_household
    and i.purchase_date is not null
    and coalesce(i.lifespan_years_override, c.default_lifespan_years) > 0
    and ((current_date - i.purchase_date)::numeric / 365.25)
        / coalesce(i.lifespan_years_override, c.default_lifespan_years) >= 0.9

  order by 4 nulls last;
$$;

-- Internal: only the service role (the Edge Function) calls this.
revoke all on function public.notifications_digest(uuid, integer) from public, anon, authenticated;
grant execute on function public.notifications_digest(uuid, integer) to service_role;
