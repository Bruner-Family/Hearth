# Edit & Delete Maintenance Log Entries — Design

**Status:** Approved (design)
**Date:** 2026-06-22

## Problem

A maintenance log entry (a "maintenance window": date performed, cost,
performed-by, notes) can be created but never changed afterward. There is no
way to fix an accidental entry or go back and add detail. Deletion technically
exists, but only behind an undiscoverable long-press on the row — most users
won't find it.

This diverges from the rest of the app: **items** and **schedules** both have a
shared form component reused by a create screen and an edit screen, plus a
discoverable delete affordance. Maintenance logs should match.

## Goal

Let a user open any maintenance log entry to **edit** its fields or **delete**
it, using the same interaction model already established for items and
schedules. No schema or RLS changes.

## Current state

- `src/app/(app)/items/[id]/log.tsx` — a flat create screen with the form
  inlined (not extracted to a component).
- `src/lib/queries.ts` — has `useCreateLog`, `useDeleteLog`, `useLogs`,
  `useHouseholdLogs`. **No** `useLog` (single fetch) or `useUpdateLog`.
- `src/app/(app)/items/[id]/index.tsx` — `LogRow` renders each entry;
  tapping does nothing; long-press confirms delete via `useDeleteLog`.
- `src/lib/demo.tsx` — has `createLog` and `deleteLog`; **no** `updateLog`.
- RLS: policy `maintenance_logs_rw ... for all` already permits UPDATE and
  DELETE (`supabase/migrations/*_rls_policies.sql`). No DB change needed.

Convention reference: `schedules/new.tsx` + `schedules/[id]/edit.tsx` both
render a shared `ScheduleForm`; the item detail page uses a "Delete item"
danger button. We mirror these.

## Decisions (from brainstorming)

- **Edit entry point:** tap a log row → pre-filled edit screen. (Not an inline
  expand, not a per-row pencil icon.)
- **Delete affordance:** a "Delete entry" danger button on the edit screen
  **and** keep the existing long-press-to-delete shortcut on the row.
- **Routing:** restructure the flat `log.tsx` into a `log/` directory with
  `new` + `[logId]` segments (matches the schedule convention). The create URL
  changes from `/items/[id]/log` to `/items/[id]/log/new`.

## Architecture

### 1. Shared form component — `src/components/LogForm.tsx`

Extract the inline form from the current `log.tsx` into a reusable component,
following the shape of `ItemForm` / `ScheduleForm`:

- Props: `initial?` (a `MaintenanceLog` or partial), `submitLabel`, `pending`,
  `error`, `onSubmit(values: LogFormValues)`.
- Owns the `react-hook-form` + `zodResolver(logFormSchema)` setup, the four
  `Controller` fields (date / cost / performed-by / notes), the `ErrorNote`,
  and the submit `Button`.
- Default values come from `initial` when present (cost rendered back from
  `cost_cents` via the existing `format.ts` helpers), else the create defaults
  (`performed_on: todayISO()`, empty strings).

### 2. Routes — `src/app/(app)/items/[id]/log/`

- `new.tsx` — create. Same behavior as today's `log.tsx`: renders `LogForm`
  with create defaults, calls `useCreateLog`, `router.back()` on success.
- `[logId].tsx` — edit. Loads the entry via `useLog(logId)` (shows `Loading`
  until ready), renders `LogForm` with `initial`, calls `useUpdateLog`. Below
  the form, a "Delete entry" danger `Button` calls `useDeleteLog` behind a
  confirm (web `window.confirm` / native `Alert.alert`, matching `LogRow` and
  the item detail delete), then `router.back()`.

Delete the old flat `log.tsx`.

### 3. Query hooks — `src/lib/queries.ts`

- `useLog(logId)` — single-row query, `queryKey: ["log", logId]`,
  `enabled: !!logId`. Demo mode reads from `demoDb`; live mode
  `from("maintenance_logs").select("*").eq("id", logId).single()`.
- `useUpdateLog()` — mutation taking `{ id, item_id, ...fields }`. Demo mode
  calls `demoDb.updateLog`; live mode
  `from("maintenance_logs").update(values).eq("id", id)`. On success invalidate
  `["logs", item_id]`, `["household-logs"]`, and `["log", id]` — consistent
  with `useCreateLog` / `useDeleteLog`.

### 4. Detail page — `src/app/(app)/items/[id]/index.tsx`

- `LogRow` gains an `onPress` that navigates to
  `/items/${item.id}/log/${log.id}`. The existing `onLongPress` delete shortcut
  stays. Update the "Log maintenance" button target to `/log/new`.

### 5. Demo parity — `src/lib/demo.tsx`

Add `updateLog(id, values)` mirroring `updateItem`: find the log, merge the
provided fields, return the updated row. `getLog(id)` helper (or reuse list +
find) to back `useLog` in demo mode.

## Data flow

```
detail LogRow tap
  → /items/[id]/log/[logId]
  → useLog(logId) loads entry
  → edit fields → useUpdateLog → invalidate → router.back()

detail LogRow long-press → confirm → useDeleteLog (unchanged)
edit "Delete entry" button → confirm → useDeleteLog → router.back()
```

No new tables, columns, RLS policies, or storage. Value mapping
(dollars↔cents, empty→null) reuses `src/lib/format.ts`, identical to create.

## Testing

- Demo `updateLog` / `getLog`: unit tests in `src/lib/__tests__` alongside the
  existing demo coverage — update merges fields and leaves others intact;
  `getLog` returns the right row.
- Form value round-trip: editing an entry pre-fills `cost` from `cost_cents`
  and maps back correctly (cents, `null` for blanks). Cover via the existing
  `format.ts` helpers / fixtures pattern.
- Existing `useCreateLog` / `useDeleteLog` behavior unchanged.

## Out of scope — TODO only

Add a TODO under `docs/TODO.md` → **Attachments**: allow attachments
(receipts, reports, PDFs) on individual maintenance log entries. The
`AttachmentsSection` infrastructure already exists at the item level and the
`attachments` table/upload path is type-agnostic; the work is parameterizing
attachments to a log entry rather than only an item. Not built in this feature.
