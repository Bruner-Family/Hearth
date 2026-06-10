-- ADR-001 §2.4 — core schema for Hearth.
-- Multi-tenancy is by household; money is integer cents (USD only, §5);
-- all timestamps are timestamptz.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

-- ---------------------------------------------------------------------------
-- Catalog (global, seeded, read-only to users)
-- ---------------------------------------------------------------------------

create table public.item_categories (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  icon                   text not null default '📦',
  default_lifespan_years numeric(4, 1),
  sort_order             integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Assets & maintenance
-- ---------------------------------------------------------------------------

create table public.items (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references public.households (id) on delete cascade,
  category_id             uuid not null references public.item_categories (id),
  name                    text not null check (char_length(name) between 1 and 200),
  location                text,                              -- e.g. "Kitchen", "Attic"
  purchase_date           date,
  price_cents             bigint check (price_cents >= 0),   -- integer cents, USD
  vendor                  text,
  brand                   text,
  model                   text,
  serial_number           text,
  warranty_until          date,
  lifespan_years_override numeric(4, 1) check (lifespan_years_override > 0),
  notes                   text,
  created_by              uuid not null default auth.uid() references auth.users (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index items_household_idx on public.items (household_id);

create table public.maintenance_logs (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  performed_on date not null,
  cost_cents   bigint check (cost_cents >= 0),
  performed_by text,                                          -- "self", "ABC Plumbing"
  notes        text,
  created_by   uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now(),
  -- lets attachments FK-verify that a log belongs to the item it claims
  unique (id, item_id)
);

create index maintenance_logs_item_idx on public.maintenance_logs (item_id);

create table public.attachments (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null references public.items (id) on delete cascade,
  maintenance_log_id uuid,
  storage_path       text not null unique,
  mime_type          text not null,
  created_by         uuid not null default auth.uid() references auth.users (id),
  created_at         timestamptz not null default now(),
  -- composite FK guarantees the referenced log belongs to the same item
  foreign key (maintenance_log_id, item_id)
    references public.maintenance_logs (id, item_id) on delete cascade
);

create index attachments_item_idx on public.attachments (item_id);

-- ---------------------------------------------------------------------------
-- Invites (no server, no email sending — §2.4)
-- ---------------------------------------------------------------------------

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by   uuid not null default auth.uid() references auth.users (id),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at   timestamptz not null default now() + interval '14 days',
  created_at   timestamptz not null default now()
);

create index household_invites_email_idx on public.household_invites (lower(email));
create index household_invites_household_idx on public.household_invites (household_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row execute function private.set_updated_at();

-- Owner membership for a freshly created household.
create function private.add_household_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger households_add_owner
  after insert on public.households
  for each row execute function private.add_household_owner();

-- Zero-touch onboarding (§2.4): first sign-in via Pocket-ID auto-creates the
-- user (Supabase custom OIDC provider), and this trigger gives them a default
-- household with owner membership.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, 'home'), '@', 1)
  );
  insert into public.households (name, created_by)
  values (display_name || '''s home', new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
