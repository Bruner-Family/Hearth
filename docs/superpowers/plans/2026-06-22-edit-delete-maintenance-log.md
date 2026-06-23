# Edit & Delete Maintenance Log Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user tap a maintenance log entry to edit its fields or delete it, matching the create/edit/delete UX already used for items and schedules.

**Architecture:** Extract the inline log form into a shared `LogForm` component reused by a create screen and an edit screen. Restructure the flat `items/[id]/log.tsx` route into a `log/` directory (`new.tsx` + `[logId].tsx`), mirroring `schedules/new.tsx` + `schedules/[id]/edit.tsx`. Add `useLog` (single fetch) and `useUpdateLog` query hooks plus demo-mode parity. No schema or RLS changes — the existing `maintenance_logs_rw ... for all` policy already permits UPDATE/DELETE.

**Tech Stack:** Expo Router, React Native (Web), TypeScript (strict), react-hook-form + zod, TanStack Query, Supabase JS, NativeWind, Vitest.

## Global Constraints

- TypeScript strict mode; no `any`. Mirror existing typing (e.g. `as unknown as T` casts as used in `queries.ts`).
- LF line endings only.
- Dollars↔cents and date handling reuse `src/lib/format.ts` (`parseDollarsToCents`, `formatCents`, `todayISO`). Never hand-roll cents math.
- Demo mode (`useDemo()`) must work for every data path — every query/mutation branches on `demo` and calls `demoDb`.
- Delete confirmation pattern: `window.confirm` on web, `Alert.alert` on native (copy existing `LogRow` pattern verbatim).
- Query invalidation keys for logs: `["logs", item_id]`, `["household-logs"]`, and `["log", id]`.
- Follow existing screen scaffolding (the `Stack.Screen` header block with `palette.bg`/`palette.ink`, `KeyboardAvoidingView`, `ScrollView` with `contentContainerClassName="mx-auto w-full max-w-2xl p-4 pb-16"`).

---

## File Structure

- `src/components/LogForm.tsx` — **Create.** Shared, presentational log form (date/cost/performed-by/notes). Owns react-hook-form + zod; emits parsed-but-not-yet-DB-shaped values via `onSubmit`.
- `src/app/(app)/items/[id]/log/new.tsx` — **Create** (replaces `log.tsx`). Create screen; renders `LogForm` with create defaults; calls `useCreateLog`.
- `src/app/(app)/items/[id]/log/[logId].tsx` — **Create.** Edit screen; loads via `useLog`; renders `LogForm` with `initial`; calls `useUpdateLog`; has a "Delete entry" danger button using `useDeleteLog`.
- `src/app/(app)/items/[id]/log.tsx` — **Delete** (moved into `log/new.tsx`).
- `src/lib/queries.ts` — **Modify.** Add `LogUpdate` type, `useLog`, `useUpdateLog`.
- `src/lib/demo.tsx` — **Modify.** Add `LogUpdate` type, `getLog`, `updateLog`.
- `src/app/(app)/items/[id]/index.tsx` — **Modify.** `LogRow` gains `onPress` → edit screen; update "Log maintenance" button to `/log/new`.
- `src/lib/__tests__/demo-log.test.ts` — **Create.** Unit tests for demo `getLog`/`updateLog`.
- `docs/TODO.md` — **Modify.** Add the attachments-on-log-entries TODO.

---

### Task 1: Demo-mode `getLog` + `updateLog` (with tests)

Adds the in-memory demo data layer first so later UI tasks have demo parity. TDD: tests drive the two helpers.

**Files:**
- Modify: `src/lib/demo.tsx` (add `LogUpdate` type near line 374; add `getLog` + `updateLog` to the `demoDb` object near the existing `createLog`/`deleteLog` at lines 458–475)
- Test: `src/lib/__tests__/demo-log.test.ts`

**Interfaces:**
- Consumes: existing `demoDb.createLog(values: LogInsert): MaintenanceLog`, `demoDb.listLogs(itemId)`, internal `db.logs`.
- Produces:
  - `demoDb.getLog(id: string): MaintenanceLog` — throws `new Error("Log not found")` if absent.
  - `demoDb.updateLog(id: string, values: LogUpdate): MaintenanceLog` — merges `values` over the existing row, keeps `id`, returns the updated row; throws `new Error("Log not found")` if absent.
  - Type `LogUpdate = Database["public"]["Tables"]["maintenance_logs"]["Update"]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/demo-log.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { demoDb } from "@/lib/demo";

describe("demoDb log edit", () => {
  let logId: string;

  beforeEach(() => {
    const log = demoDb.createLog({
      item_id: "demo-item-1",
      performed_on: "2026-01-01",
      cost_cents: 1500,
      performed_by: "self",
      notes: "first",
    });
    logId = log.id;
  });

  it("getLog returns the created row", () => {
    expect(demoDb.getLog(logId).notes).toBe("first");
  });

  it("getLog throws for an unknown id", () => {
    expect(() => demoDb.getLog("nope")).toThrow("Log not found");
  });

  it("updateLog merges provided fields and leaves others intact", () => {
    const updated = demoDb.updateLog(logId, { notes: "edited", cost_cents: 2000 });
    expect(updated.id).toBe(logId);
    expect(updated.notes).toBe("edited");
    expect(updated.cost_cents).toBe(2000);
    expect(updated.performed_by).toBe("self");
    expect(demoDb.getLog(logId).notes).toBe("edited");
  });

  it("updateLog can null out an optional field", () => {
    const updated = demoDb.updateLog(logId, { performed_by: null });
    expect(updated.performed_by).toBeNull();
  });

  it("updateLog throws for an unknown id", () => {
    expect(() => demoDb.updateLog("nope", { notes: "x" })).toThrow("Log not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/demo-log.test.ts`
Expected: FAIL — `demoDb.getLog is not a function` / `demoDb.updateLog is not a function`.

- [ ] **Step 3: Add the `LogUpdate` type**

In `src/lib/demo.tsx`, next to the existing `type LogInsert = ...` (around line 374), add:

```ts
type LogUpdate = Database["public"]["Tables"]["maintenance_logs"]["Update"];
```

- [ ] **Step 4: Implement `getLog` and `updateLog`**

In `src/lib/demo.tsx`, inside the `demoDb` object, immediately after `deleteLog` (currently ending at line 475), add:

```ts
  getLog: (id: string): MaintenanceLog => {
    const log = db.logs.find((l) => l.id === id);
    if (!log) throw new Error("Log not found");
    return log;
  },

  updateLog: (id: string, values: LogUpdate): MaintenanceLog => {
    const current = db.logs.find((l) => l.id === id);
    if (!current) throw new Error("Log not found");
    const next: MaintenanceLog = { ...current, ...values, id };
    db.logs = db.logs.map((l) => (l.id === id ? next : l));
    return next;
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/demo-log.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo.tsx src/lib/__tests__/demo-log.test.ts
git commit -m "feat(demo): add getLog and updateLog for log editing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `useLog` + `useUpdateLog` query hooks

Adds the live (Supabase) + demo data hooks the edit screen consumes. No new tests — these are thin wrappers mirroring `useUpdateItem`/`useLogs`, covered indirectly by Task 1 (demo) and exercised in Task 4 (UI). Verified by typecheck.

**Files:**
- Modify: `src/lib/queries.ts` (add `LogUpdate` type near line 22; add `useLog` after `useLogs` ~line 194; add `useUpdateLog` after `useCreateLog` ~line 215)

**Interfaces:**
- Consumes: `demoDb.getLog`, `demoDb.updateLog` (Task 1); existing `supabase`, `useDemo`, `useQuery`, `useMutation`, `useQueryClient`, `MaintenanceLog`.
- Produces:
  - `useLog(logId: string | undefined)` — TanStack `useQuery` returning `MaintenanceLog`, `queryKey: ["log", logId]`, `enabled: !!logId`.
  - `useUpdateLog()` — TanStack `useMutation`; `mutationFn` takes `LogUpdate & { id: string; item_id: string }`, returns `MaintenanceLog`. Invalidates `["logs", item_id]`, `["household-logs"]`, `["log", id]`.
  - Type `LogUpdate = Database["public"]["Tables"]["maintenance_logs"]["Update"]`.

- [ ] **Step 1: Add the `LogUpdate` type**

In `src/lib/queries.ts`, next to `type LogInsert = ...` (line 20), add:

```ts
type LogUpdate = Database["public"]["Tables"]["maintenance_logs"]["Update"];
```

- [ ] **Step 2: Add `useLog`**

In `src/lib/queries.ts`, immediately after the `useLogs` function (ends ~line 194), add:

```ts
export function useLog(logId: string | undefined) {
  const { enabled: demo } = useDemo();
  return useQuery({
    queryKey: ["log", logId],
    enabled: !!logId,
    queryFn: async (): Promise<MaintenanceLog> => {
      if (demo) return demoDb.getLog(logId!);
      const { data, error } = await supabase
        .from("maintenance_logs")
        .select("*")
        .eq("id", logId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
```

- [ ] **Step 3: Add `useUpdateLog`**

In `src/lib/queries.ts`, immediately after the `useCreateLog` function (ends ~line 215), add:

```ts
export function useUpdateLog() {
  const { enabled: demo } = useDemo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      item_id: _item_id,
      ...values
    }: LogUpdate & { id: string; item_id: string }) => {
      if (demo) return demoDb.updateLog(id, values);
      const { data, error } = await supabase
        .from("maintenance_logs")
        .update(values)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (log) => {
      void qc.invalidateQueries({ queryKey: ["logs", log.item_id] });
      void qc.invalidateQueries({ queryKey: ["household-logs"] });
      void qc.invalidateQueries({ queryKey: ["log", log.id] });
    },
  });
}
```

Note: `item_id` is destructured out (renamed `_item_id` to satisfy no-unused-vars) so it is not sent in the `update` payload, but the caller still passes it for use in invalidation via the returned row.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(queries): add useLog and useUpdateLog hooks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Extract shared `LogForm` component + create screen at `log/new.tsx`

Pull the inline form out of `log.tsx` into a reusable component, then re-home the create screen into the `log/` directory so the edit screen can be a sibling. Behavior of creation is unchanged; only the file location and the form's reusability change.

**Files:**
- Create: `src/components/LogForm.tsx`
- Create: `src/app/(app)/items/[id]/log/new.tsx`
- Delete: `src/app/(app)/items/[id]/log.tsx`

**Interfaces:**
- Consumes: `logFormSchema`, `LogFormValues` (`@/lib/schemas`); `DateField`; `Button`, `ErrorNote`, `Field` (`@/components/ui`); `parseDollarsToCents`, `formatCents`, `todayISO` (`@/lib/format`); `MaintenanceLog` (`@/lib/database.types`); `useCreateLog` (`@/lib/queries`).
- Produces:
  - `LogForm` (default-less named export) with props:
    ```ts
    type LogFormProps = {
      initial?: Pick<MaintenanceLog, "performed_on" | "cost_cents" | "performed_by" | "notes">;
      submitLabel: string;
      pending: boolean;
      error?: string;
      onSubmit: (values: LogFormValues) => void;
    };
    ```
    `LogForm` does NOT shape values for the DB — it returns raw `LogFormValues` (strings); each screen maps to the DB payload (cents/null) itself, matching how the current `log.tsx` does the mapping at submit time.

- [ ] **Step 1: Create `LogForm.tsx`**

Create `src/components/LogForm.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { DateField } from "@/components/DateField";
import { Button, ErrorNote, Field } from "@/components/ui";
import type { MaintenanceLog } from "@/lib/database.types";
import { todayISO } from "@/lib/format";
import { logFormSchema, type LogFormValues } from "@/lib/schemas";

type LogFormProps = {
  initial?: Pick<
    MaintenanceLog,
    "performed_on" | "cost_cents" | "performed_by" | "notes"
  >;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (values: LogFormValues) => void;
};

export function LogForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: LogFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LogFormValues>({
    resolver: zodResolver(logFormSchema),
    defaultValues: {
      performed_on: initial?.performed_on ?? todayISO(),
      cost:
        initial?.cost_cents != null
          ? (initial.cost_cents / 100).toFixed(2)
          : "",
      performed_by: initial?.performed_by ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const submit = handleSubmit(onSubmit);

  return (
    <>
      <Controller
        control={control}
        name="performed_on"
        render={({ field: { onChange, onBlur, value } }) => (
          <DateField
            label="Date performed"
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            error={errors.performed_on?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="cost"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Cost (USD)"
            placeholder="e.g. 150.00"
            inputMode="decimal"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.cost?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="performed_by"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Performed by"
            placeholder='e.g. "self", "ABC Plumbing"'
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.performed_by?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Notes"
            multiline
            numberOfLines={4}
            style={{ minHeight: 96, textAlignVertical: "top" }}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.notes?.message}
          />
        )}
      />
      {error ? <ErrorNote message={error} /> : null}
      <Button title={submitLabel} loading={pending} onPress={() => submit()} />
    </>
  );
}
```

- [ ] **Step 2: Create `log/new.tsx`**

Create `src/app/(app)/items/[id]/log/new.tsx`:

```tsx
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { LogForm } from "@/components/LogForm";
import { parseDollarsToCents } from "@/lib/format";
import { useCreateLog } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function NewLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const createLog = useCreateLog();

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Log maintenance",
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-2xl p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <LogForm
          submitLabel="Save entry"
          pending={createLog.isPending}
          error={createLog.error?.message}
          onSubmit={(values) =>
            createLog.mutate(
              {
                item_id: id!,
                performed_on: values.performed_on,
                cost_cents: values.cost ? parseDollarsToCents(values.cost) : null,
                performed_by:
                  values.performed_by && values.performed_by.trim() !== ""
                    ? values.performed_by.trim()
                    : null,
                notes:
                  values.notes && values.notes.trim() !== ""
                    ? values.notes.trim()
                    : null,
              },
              { onSuccess: () => router.back() },
            )
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 3: Delete the old flat route**

```bash
git rm src/app/\(app\)/items/\[id\]/log.tsx
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (The detail page still references `/items/${item.id}/log` — that's a string, so it typechecks; it is fixed in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/components/LogForm.tsx "src/app/(app)/items/[id]/log/new.tsx"
git commit -m "refactor(log): extract LogForm and move create to log/new

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Edit screen at `log/[logId].tsx` (edit + delete)

The edit screen: loads the entry, pre-fills `LogForm`, saves via `useUpdateLog`, and offers a "Delete entry" danger button via `useDeleteLog`.

**Files:**
- Create: `src/app/(app)/items/[id]/log/[logId].tsx`

**Interfaces:**
- Consumes: `LogForm` (Task 3); `useLog`, `useUpdateLog`, `useDeleteLog` (Tasks 1–2 + existing); `parseDollarsToCents` (`@/lib/format`); `Button`, `Loading` (`@/components/ui`); `usePalette`.
- Produces: route `/items/[id]/log/[logId]` (edit screen). No exported symbols consumed elsewhere.

- [ ] **Step 1: Create `log/[logId].tsx`**

Create `src/app/(app)/items/[id]/log/[logId].tsx`:

```tsx
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";

import { LogForm } from "@/components/LogForm";
import { Button, Loading } from "@/components/ui";
import { parseDollarsToCents } from "@/lib/format";
import { useDeleteLog, useLog, useUpdateLog } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function EditLogScreen() {
  const { id, logId } = useLocalSearchParams<{ id: string; logId: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { data: log, isLoading } = useLog(logId);
  const updateLog = useUpdateLog();
  const deleteLog = useDeleteLog();

  if (isLoading || !log) return <Loading />;

  const confirmDelete = () => {
    const remove = () =>
      deleteLog.mutate(
        { id: log.id, item_id: log.item_id },
        { onSuccess: () => router.back() },
      );
    if (Platform.OS === "web") {
      if (window.confirm("Delete this maintenance entry?")) remove();
      return;
    }
    Alert.alert("Delete entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: remove },
    ]);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Edit entry",
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-2xl p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <LogForm
          initial={log}
          submitLabel="Save changes"
          pending={updateLog.isPending}
          error={updateLog.error?.message}
          onSubmit={(values) =>
            updateLog.mutate(
              {
                id: log.id,
                item_id: log.item_id,
                performed_on: values.performed_on,
                cost_cents: values.cost ? parseDollarsToCents(values.cost) : null,
                performed_by:
                  values.performed_by && values.performed_by.trim() !== ""
                    ? values.performed_by.trim()
                    : null,
                notes:
                  values.notes && values.notes.trim() !== ""
                    ? values.notes.trim()
                    : null,
              },
              { onSuccess: () => router.back() },
            )
          }
        />
        <View className="mt-10">
          <Button
            title="Delete entry"
            variant="danger"
            loading={deleteLog.isPending}
            onPress={confirmDelete}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke check (demo mode)**

Run: `npx vitest run` (full suite stays green) then verify the route compiles by typecheck above. (Full interactive verification happens after Task 5 wires the entry point.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/items/[id]/log/[logId].tsx"
git commit -m "feat(log): add edit screen with delete for log entries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire the detail page — tap-to-edit + updated create link

Make `LogRow` tappable to open the edit screen, keep the long-press delete, and point the "Log maintenance" button at the new `/log/new` route.

**Files:**
- Modify: `src/app/(app)/items/[id]/index.tsx` (the "Log maintenance" `Button` ~line 163–166; `LogRow` ~line 182–224)

**Interfaces:**
- Consumes: `useRouter` (already imported at top of file), `useDeleteLog` (already imported).
- Produces: navigation to `/items/[id]/log/new` (create) and `/items/[id]/log/[logId]` (edit).

- [ ] **Step 1: Update the "Log maintenance" button target**

In `src/app/(app)/items/[id]/index.tsx`, change:

```tsx
        onPress={() => router.push(`/items/${item.id}/log`)}
```

to:

```tsx
        onPress={() => router.push(`/items/${item.id}/log/new`)}
```

- [ ] **Step 2: Make `LogRow` open the edit screen on tap**

In the same file, `LogRow` currently destructures `{ log, first }` and renders a `Pressable` with only `onLongPress`. Add a router and an `onPress`. Replace the `LogRow` function signature + the `Pressable` opening so it reads:

```tsx
function LogRow({ log, first }: { log: MaintenanceLog; first: boolean }) {
  const router = useRouter();
  const deleteLog = useDeleteLog();
```

and update the `Pressable` props from:

```tsx
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Long-press to delete"
      onLongPress={confirmDelete}
      className={`py-2.5 ${first ? "" : "border-t border-edge"}`}
    >
```

to:

```tsx
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Tap to edit, long-press to delete"
      onPress={() => router.push(`/items/${log.item_id}/log/${log.id}`)}
      onLongPress={confirmDelete}
      className={`py-2.5 ${first ? "" : "border-t border-edge"}`}
    >
```

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; full suite passes.

- [ ] **Step 4: Lint**

Run: `npx eslint src/app/\(app\)/items/\[id\]/index.tsx src/components/LogForm.tsx src/lib/queries.ts src/lib/demo.tsx "src/app/(app)/items/[id]/log/new.tsx" "src/app/(app)/items/[id]/log/[logId].tsx"`
Expected: no errors.

- [ ] **Step 5: Manual verification (demo mode in browser)**

Run the web app (`npm run web` or the project's dev command), open an item with a maintenance log, and confirm:
1. Tapping a log row opens the "Edit entry" screen pre-filled with that row's date/cost/by/notes.
2. Changing a field + "Save changes" returns to the detail page with the row updated.
3. "Delete entry" prompts to confirm, then removes the row and returns.
4. Long-pressing a row still prompts delete.
5. "Log maintenance" opens the create screen and a new entry still saves.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/items/[id]/index.tsx"
git commit -m "feat(log): tap a log entry to edit; keep long-press delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Add the attachments-on-log-entries TODO

Out-of-scope follow-up captured per the spec.

**Files:**
- Modify: `docs/TODO.md` (under the `## Attachments` section)

- [ ] **Step 1: Add the TODO item**

In `docs/TODO.md`, under the `## Attachments` heading, add a new bullet after the existing PDF/document item:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/TODO.md
git commit -m "docs(todo): track attachments on maintenance log entries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Shared `LogForm` → Task 3. ✅
- Route restructure `log/new` + `log/[logId]` → Tasks 3 & 4. ✅
- `useLog` + `useUpdateLog` (invalidation keys) → Task 2. ✅
- Tap-to-edit + keep long-press delete + danger button on edit screen → Tasks 4 & 5. ✅
- Demo `updateLog`/`getLog` parity → Task 1. ✅
- Tests for demo update + form round-trip → Task 1 (demo) + Task 5 manual round-trip + typecheck (form mapping reuses `format.ts`). ✅
- TODO for attachments on log entries → Task 6. ✅
- No schema/RLS change → confirmed; no migration task. ✅

**Placeholder scan:** No TBD/TODO-in-code/"add error handling" placeholders; every code step shows full code. ✅

**Type consistency:** `LogUpdate` defined identically in `demo.tsx` (Task 1) and `queries.ts` (Task 2). `useUpdateLog` mutationFn takes `{ id, item_id, ...values }` and the edit screen (Task 4) passes exactly `{ id, item_id, performed_on, cost_cents, performed_by, notes }`. `LogForm` `initial` prop type (`Pick<MaintenanceLog, ...>`) is satisfied by both the full `MaintenanceLog` from `useLog` (Task 4) and omitted in create (Task 3). `useLog` returns `MaintenanceLog`; edit screen reads `log.item_id`/`log.id` — both exist on `MaintenanceLog`. ✅
