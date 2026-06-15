-- Roadmap spec v1.5 "At the Appliance" — per-item reference details: an ordered
-- list of {label, value} pairs ("Filter: 16×25×1"). A handful of pairs per item
-- doesn't justify a separate table + RLS, so it lives as JSONB on items. RLS and
-- table grants on public.items already cover this column.

alter table public.items
  add column reference_details jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reference_details) = 'array');

comment on column public.items.reference_details is
  'Ordered array of {label, value} reference pairs; app-validated element shape.';
