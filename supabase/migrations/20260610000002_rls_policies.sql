-- ADR-001 §2.4 — Row Level Security. RLS is the *only* authorization layer
-- (no API tier), so every tenant table gets a policy gated on household
-- membership, resolved through security-definer helpers to avoid recursive
-- policy evaluation.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.is_household_member(hid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create function private.is_household_owner(hid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- maintenance_logs and attachments derive household membership through their
-- parent item.
create function private.can_access_item(iid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.items i
    join public.household_members m on m.household_id = i.household_id
    where i.id = iid and m.user_id = auth.uid()
  );
$$;

create function private.jwt_email()
returns text language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.item_categories   enable row level security;
alter table public.items             enable row level security;
alter table public.maintenance_logs  enable row level security;
alter table public.attachments       enable row level security;
alter table public.household_invites enable row level security;

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------

create policy households_select on public.households
  for select using (private.is_household_member(id));

create policy households_insert on public.households
  for insert with check (created_by = auth.uid());

create policy households_update on public.households
  for update using (private.is_household_owner(id))
  with check (private.is_household_owner(id));

create policy households_delete on public.households
  for delete using (private.is_household_owner(id));

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------

create policy household_members_select on public.household_members
  for select using (private.is_household_member(household_id));

-- New memberships are created by the owner-membership trigger and the
-- accept_invite() RPC (both security definer); owners may also add rows
-- directly (e.g. future admin tooling).
create policy household_members_insert on public.household_members
  for insert with check (private.is_household_owner(household_id));

create policy household_members_update on public.household_members
  for update using (private.is_household_owner(household_id))
  with check (private.is_household_owner(household_id));

-- Owners can remove anyone; members can remove themselves (leave).
create policy household_members_delete on public.household_members
  for delete using (
    private.is_household_owner(household_id) or user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- item_categories — global, read-only to users (seeded by migrations)
-- ---------------------------------------------------------------------------

create policy item_categories_select on public.item_categories
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

create policy items_rw on public.items
  for all using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- maintenance_logs / attachments — household resolved via parent item
-- ---------------------------------------------------------------------------

create policy maintenance_logs_rw on public.maintenance_logs
  for all using (private.can_access_item(item_id))
  with check (private.can_access_item(item_id));

create policy attachments_rw on public.attachments
  for all using (private.can_access_item(item_id))
  with check (private.can_access_item(item_id));

-- ---------------------------------------------------------------------------
-- household_invites
-- ---------------------------------------------------------------------------

-- Owners manage their household's invites; a signed-in user can see invites
-- addressed to their verified email (Pocket-ID supplies the email claim).
create policy household_invites_select on public.household_invites
  for select using (
    private.is_household_owner(household_id)
    or lower(email) = private.jwt_email()
  );

create policy household_invites_insert on public.household_invites
  for insert with check (
    private.is_household_owner(household_id) and invited_by = auth.uid()
  );

-- Owners can revoke; acceptance goes through the RPC below.
create policy household_invites_update on public.household_invites
  for update using (private.is_household_owner(household_id))
  with check (private.is_household_owner(household_id));

create policy household_invites_delete on public.household_invites
  for delete using (private.is_household_owner(household_id));

-- ---------------------------------------------------------------------------
-- accept_invite — security definer RPC (§2.4): re-validates the email match
-- and expiry, inserts the membership, and flips the invite to accepted.
-- ---------------------------------------------------------------------------

create function public.accept_invite(invite_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.household_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into inv
  from public.household_invites
  where id = invite_id
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;
  if inv.status <> 'pending' then
    raise exception 'Invite is no longer pending';
  end if;
  if inv.expires_at < now() then
    raise exception 'Invite has expired';
  end if;
  if lower(inv.email) <> private.jwt_email() then
    raise exception 'Invite was issued to a different email address';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member')
  on conflict do nothing;

  update public.household_invites
  set status = 'accepted'
  where id = invite_id;
end;
$$;

revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;
