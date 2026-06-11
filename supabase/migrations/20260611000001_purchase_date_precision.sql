-- Purchase dates are often only known to the month ("June 2019"). When the
-- day is unknown the client stores the 1st of the month and records the
-- precision here so the UI can render "Jun 2019" rather than "Jun 1, 2019".
alter table public.items
  add column purchase_date_precision text not null default 'day'
    check (purchase_date_precision in ('day', 'month'));
