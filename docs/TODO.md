# TODO — Feature Improvements

Backlog of feature-level improvements. Larger architectural changes get an
ADR in [`docs/adrs/`](adrs/) instead.

For the cross-cutting plan to make Hearth a production iOS application, see
the [iOS readiness TODO](IOS-READINESS-TODO.md). This file remains the backlog
for individual product improvements.

## Forms & date entry

- [x] **Purchase date: require only year/month, day optional.** Done: the
  item form now has a "Purchase month" picker plus an optional "Day" input.
  When the day is omitted, the date is stored as the 1st of the month and
  `items.purchase_date_precision` (migration
  `20260611000001_purchase_date_precision.sql`) records `'month'` so the
  detail view renders "Jun 2019" instead of "Jun 1, 2019"
  (`formatPurchaseDate` in `src/lib/format.ts`).

- [x] **Popup calendar picker on all date fields.** Done: `DateField`
  (`src/components/DateField.tsx`) renders a native `<input type="date">`
  (or `type="month"`) on web — browser popup calendar, themed via
  `color-scheme` — and falls back to the plain text Field on native. Used by
  purchase month and `warranty_until` (`src/components/ItemForm.tsx`) and
  `performed_on` (`src/app/(app)/items/[id]/log.tsx`).
  - Known degradation: desktop Firefox/Safari don't implement
    `<input type="month">` and fall back to a text input accepting
    `YYYY-MM`; the zod schema still validates it. Mobile browsers (the
    primary target) support both input types.
  - When the iOS target becomes real, swap the native branch of `DateField`
    for `@react-native-community/datetimepicker` or similar.

## Attachments

- [x] **Attach a PDF or document alongside photos.** Done:
  `AttachmentsSection` (`src/components/AttachmentsSection.tsx`) has an "Add
  document (PDF)" button backed by `expo-document-picker`. PDF only — the
  `attachments` bucket's `allowed_mime_types` (migration
  `20260610000004_storage.sql`) rejects anything else, so the picker filters
  rather than letting the upload fail after the fact.
  - Non-image thumbs now show the file name under the 📄 so a wall of icons
    stays distinguishable. The name is stored in `attachments.file_name`
    (migration `20260728000001_attachment_file_name.sql`) because
    `storage_path` is sanitized (`storageSafeName` in `src/lib/attachments.ts`)
    and can't round-trip something like "Manual (2019) — LG.pdf". The migration
    backfills names for existing rows while the old key format is unambiguous.
  - Files over the bucket's 10 MiB limit are rejected client-side with a named
    error instead of an opaque storage failure.

- [x] **Attach files to individual maintenance log entries.** Done: the log
  edit screen (`items/[id]/log/[logId]`) renders a log-scoped
  `AttachmentsSection`, using the `attachments.maintenance_log_id` link the
  initial schema already carried. Item-level attachments (`useAttachments`)
  now filter to `maintenance_log_id is null`, so a file appears — and is
  deleted from — exactly one place.
  - Attaching needs the log row to exist (composite FK), so it is the edit
    screen only; "Log maintenance" still saves and returns to the item.
  - Deleting a log or item captures its attachment paths, deletes the database
    parent and cascading rows, then removes the objects from storage. A failed
    database delete therefore leaves every attachment intact; a later storage
    failure can only leave a recoverable orphan.

## Security

- [ ] **Server-enforce immutability of server-managed columns.** `created_by`
  and `created_at` on `maintenance_logs` (and `items` / `maintenance_schedules`)
  are only protected from client tampering by convention — the client ships the
  Supabase anon key, so RLS is the real boundary, and the current
  `*_rw ... for all` policies allow a household member to rewrite these columns
  via a direct API call. Tighten with an RLS `with check` guard or a
  column-level `REVOKE UPDATE` so the server enforces the invariant. The
  `useUpdate*` hooks already allow-list editable fields client-side, but that is
  defense against our own bugs, not authorization. Surfaced by the commit
  security review during the edit/delete log work (2026-06-22).

## Storage

- [ ] Evaluate moving photo/attachment storage off Supabase Storage to a
  blob store — see
  [ADR-002](adrs/ADR-002-photo-storage-backend.md) (proposed).
