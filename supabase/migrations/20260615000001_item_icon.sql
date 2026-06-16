alter table public.items add column icon text check (char_length(icon) <= 32);  -- null = use category icon
comment on column public.items.icon is
  'Optional per-item emoji override; null falls back to the category icon.';
