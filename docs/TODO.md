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

## Storage

- [ ] Evaluate moving photo/attachment storage off Supabase Storage to a
  blob store — see
  [ADR-002](adrs/ADR-002-photo-storage-backend.md) (proposed).
