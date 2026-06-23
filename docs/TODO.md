# TODO — Feature Improvements

Backlog of feature-level improvements. Larger architectural changes get an
ADR in [`docs/adrs/`](adrs/) instead.

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

- [ ] **Attach a PDF or document alongside photos.** Appliances and items
  usually ship with a receipt, manual, or warranty document as a PDF; we
  should be able to associate those with an item, not just photos.
  - **Target release: v1.5 "At the Appliance"** — grouped with reference
    details and QR labels as item reference material in hand at the
    equipment (roadmap
    [spec](superpowers/specs/2026-06-11-hearth-feature-roadmap-design.md) §3
    v1.5, decided 2026-06-13).
  - Most of the stack already supports it: `attachments` stores an arbitrary
    `mime_type` + `storage_path` (no image assumption), `useUploadAttachment`
    (`src/lib/queries.ts`) uploads any `mimeType`/`body`, and
    `AttachmentThumb` (`src/components/AttachmentsSection.tsx`) already renders
    a 📄 fallback for non-image types and opens them via `Linking.openURL`.
  - The gap is the **picker**: `AttachmentsSection` only offers
    `expo-image-picker` with `mediaTypes: "images"`, so there's no way to
    select a PDF/document. Add an "Add document" button backed by
    `expo-document-picker` (the upload/render path is unchanged), and show the
    file name on non-image thumbs so a wall of 📄 icons stays distinguishable.

- [ ] **Attach files to individual maintenance log entries.** Let a maintenance
  log entry (receipt, service report, PDF, photo) carry its own attachments,
  not just the parent item. The `attachments` table and upload path are already
  type-agnostic and `AttachmentsSection` (`src/components/AttachmentsSection.tsx`)
  is built around an item; the work is parameterizing attachments to a log entry
  (new nullable `maintenance_log_id` link + a log-scoped `AttachmentsSection`
  on the log edit screen at `items/[id]/log/[logId]`). Surfaced by the
  edit/delete log work
  ([spec](superpowers/specs/2026-06-22-edit-delete-maintenance-log-design.md),
  2026-06-22).

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
