-- ADR-001 §2.4 — base table privileges for PostgREST roles.
--
-- RLS policies only filter rows a role is *already* permitted to see;
-- Postgres still enforces the standard table-level GRANTs first. Hand-written
-- migrations (unlike dashboard-managed tables) don't get these for free.

grant select, insert, update, delete on
  public.households,
  public.household_members,
  public.items,
  public.maintenance_logs,
  public.attachments,
  public.household_invites
to authenticated;

grant select on public.item_categories to authenticated;
