-- ADR-001 §2.4 — attachments (receipts, manuals, photos) in Supabase Storage.
-- Private bucket with a per-household path prefix: {household_id}/{item_id}/...
-- Storage RLS mirrors the table policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  10485760, -- 10 MiB per object
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

create policy attachments_storage_select on storage.objects
  for select using (
    bucket_id = 'attachments'
    and private.is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy attachments_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and private.is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy attachments_storage_update on storage.objects
  for update using (
    bucket_id = 'attachments'
    and private.is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy attachments_storage_delete on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and private.is_household_member((string_to_array(name, '/'))[1]::uuid)
  );
