# Hearth — Custom emoji for "Other" items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When adding or editing an item, if the user picks the **"Other"** category they can choose a custom emoji for that item — a curated grid of common household emojis for quick taps, plus a free-entry field to type/paste *any* emoji via the OS keyboard. The chosen emoji becomes the item's icon, overriding the category default (📦). Choosing nothing keeps 📦.

**Architecture:** A new nullable `icon text` column on `items` (null = fall back to the category icon). A pure helper `itemIcon(item) = item.icon?.trim() || item.category.icon` centralizes the fallback and is used everywhere an item's icon is shown (list avatar, detail title, weekly digest). The item form mounts a new `EmojiPickerField` — rendered only when the selected category is "Other" — inside the existing category `Controller` so it reads the selected category without `watch()`. Switching to a non-"Other" category clears the override via `setValue`. Everything else (RLS, grants, `select *` reads, the `Insert` type) rides on the existing `items` machinery.

**Tech Stack:** Supabase Postgres (migration), hand-maintained TS types, react-hook-form + zod, Expo/React Native Web + NativeWind, vitest.

**Decisions baked in (from brainstorming):**
- **Only the "Other" category** shows the picker (matched by category `name === "Other"`). No per-category overrides for the catalog categories.
- **Curated grid + free entry** — the grid gives fast common choices; the free-entry text field (OS emoji keyboard / paste) satisfies "any emoji". No in-app emoji *search* (YAGNI; no new dependency).
- **Storage: `items.icon text` nullable**, null = use category icon. Mirrors the existing override pattern (`lifespan_years_override`). `select *` and the generated `Insert` type pick it up automatically.
- **Consistency (option a):** the override also shows in the **item-detail screen title** and the **weekly notification digest**, so the chosen emoji is consistent across every surface that shows an item's icon.

**Branch:** already on `worktree-claude+v1.5-reference-details` (isolated worktree). Do NOT switch to main.

---

## Codebase orientation (read once before starting)

- **Commands:** `npm run typecheck` (tsc), `npm run lint` (expo lint — **CI is zero-warnings strict, `--max-warnings 0`**), `npm test` (vitest, runs once). SQL migrations apply with `supabase db reset`; if Docker/Supabase isn't available, write the SQL correctly and rely on review + the JS gates, noting it wasn't applied. No pgTAP is required for this feature (a plain nullable column + a function rewrite are covered by review).
- **Test scope:** vitest covers **pure `src/lib/*.ts`** only (`include: src/**/*.test.ts`); tested modules must not import `react-native`. Components (`.tsx`) are verified by typecheck + lint (+ manual), not unit tests. Fixtures live in `src/lib/__tests__/`; `makeItem(overrides?)` builds an `ItemWithCategory`.
- **Types:** `src/lib/database.types.ts` is hand-maintained; keep it in lockstep with migrations. `TableOf<Row, Required, Generated>` builds Row/Insert/Update — a nullable column with no DB default belongs in neither `Required` nor `Generated`, so it lands in the `Partial` (optional on Insert). `items` Required is `household_id | category_id | name`.
- **Forms:** react-hook-form + `zodResolver`; schemas in `src/lib/schemas.ts`. Use `Controller` for inputs. **Never** call `watch()` or `useWatch()` (trips `react-hooks/incompatible-library` under `--max-warnings 0`). To make the picker depend on the selected category, render its `Controller` **nested inside the category field's `Controller` render** (the category `value` is in scope there). `setValue` is fine to use for clearing the icon.
- **Item form** (`src/components/ItemForm.tsx`): `useForm<ItemFormValues>` with `Controller`-wrapped fields; on submit maps form values → `Omit<ItemInsert, "household_id">` and calls `onSubmit`. The category picker is a row of **chip** `Pressable`s (`rounded-full border px-3 py-2`), selected chip `border-accent bg-accent` + `text-on-accent`. `empty(v)` returns trimmed string or null. `selectedCategory(id)` looks up the category.
- **Item detail** (`src/app/(app)/items/[id]/index.tsx`): a `ScrollView` of `Card`s. `Stack.Screen` `title: item.name`. A `facts` array drives a label/value `Card`; `["Category", \`${item.category.icon} ${item.category.name}\`]` stays as the **category** label (do not change it — the override surfaces in the screen title instead).
- **Items list** (`src/app/(app)/(tabs)/items.tsx`): each row renders `<Text className="text-3xl">{item.category.icon}</Text>` as the avatar (~line 171).
- **UI kit** (`src/components/ui.tsx`): `Card`, `SectionTitle`, `Button`, `Field` (labeled `TextInput`), `ErrorNote`. Raw colors via `usePalette()` (`@/lib/theme`) for `placeholderTextColor` etc.
- **Demo mode** (`src/lib/demo.tsx`): `seedItem(index, categoryId, name, monthsOld, extra)` builds demo items (must default the new column); `demoDb.createItem`/`updateItem` map form values → row and must carry `icon` so the form round-trips offline. `DEMO_CATEGORIES` mirrors the seed catalog (includes "Other").
- **Notification digest** (`supabase/migrations/20260613000002_notifications_digest.sql`): `public.notifications_digest(uuid, integer)` is a `security definer` SQL function; two of its `union all` branches build a title with `coalesce(c.icon || ' ', '') || i.name` (warranty + end_of_life branches). Migrations are immutable — update via a new migration that `create or replace`s the function and re-applies the `revoke`/`grant`.

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260615000001_item_icon.sql` | create | add nullable `icon text` to `items` + column comment |
| `src/lib/database.types.ts` | modify | `icon: string \| null` on `Item` |
| `src/lib/__tests__/fixtures.ts` | modify | `icon: null` in `makeItem` |
| `src/lib/format.ts` | modify | `itemIcon(item)` fallback helper |
| `src/lib/__tests__/format.test.ts` | create | vitest for `itemIcon` |
| `src/lib/schemas.ts` | modify | optional `icon` in `itemFormSchema` |
| `src/lib/__tests__/schemas.test.ts` | modify | itemFormSchema `icon` cases |
| `src/components/EmojiPickerField.tsx` | create | curated grid + free-entry emoji editor |
| `src/components/ItemForm.tsx` | modify | mount picker (gated on "Other"); clear on category change; submit `icon` |
| `src/lib/demo.tsx` | modify | seed `icon`; carry in create/update; showcase one "Other" item |
| `src/app/(app)/(tabs)/items.tsx` | modify | list avatar uses `itemIcon(item)` |
| `src/app/(app)/items/[id]/index.tsx` | modify | screen title prefixed with `itemIcon(item)` |
| `supabase/migrations/20260615000002_digest_item_icon.sql` | create | `create or replace` digest using `coalesce(i.icon, c.icon)` |
| `docs/superpowers/specs/2026-06-11-hearth-feature-roadmap-design.md` | modify | decision row |
| `README.md` | modify | feature note |

---

### Task 1: Migration + `Item` type + fixture

- [ ] Create `supabase/migrations/20260615000001_item_icon.sql`:
  ```sql
  alter table public.items add column icon text;  -- null = use category icon
  comment on column public.items.icon is
    'Optional per-item emoji override; null falls back to the category icon.';
  ```
- [ ] `src/lib/database.types.ts`: add `icon: string | null;` to the `Item` type (place near `lifespan_years_override` / `notes`). No `TableOf` change needed — nullable, no default → optional on `Insert`.
- [ ] `src/lib/__tests__/fixtures.ts`: add `icon: null` to the `makeItem` base object.

**Acceptance:** `npm run typecheck` passes. RLS/grants untouched (table-level grants already cover the column).

---

### Task 2: `itemIcon` helper + schema field (pure lib + tests)

- [ ] `src/lib/format.ts`: add and export
  ```ts
  export function itemIcon(item: { icon: string | null; category: { icon: string } }): string {
    return item.icon?.trim() || item.category.icon;
  }
  ```
- [ ] `src/lib/__tests__/format.test.ts` (create): cover (a) returns `item.icon` when set, (b) falls back to `category.icon` when `icon` is null, (c) falls back when `icon` is `""`/whitespace. Use `makeItem` from fixtures.
- [ ] `src/lib/schemas.ts`: add `icon` to `itemFormSchema`:
  ```ts
  icon: z.string().trim().max(32).optional().or(z.literal("")),
  ```
  (32 chars comfortably holds ZWJ sequences like 👨‍👩‍👧‍👦; we keep validation lenient — no strict single-emoji regex.)
- [ ] `src/lib/__tests__/schemas.test.ts`: add cases — valid single emoji passes, blank `""` passes, an over-length string fails. Follow the existing test style in that file.

**Acceptance:** `npm test` green; `npm run typecheck` passes. `itemIcon` is pure (no react-native import).

---

### Task 3: `EmojiPickerField` component

- [ ] Create `src/components/EmojiPickerField.tsx`. Controlled component:
  ```ts
  export function EmojiPickerField({
    value, onChange,
  }: { value: string; onChange: (v: string) => void }) { ... }
  ```
- [ ] Render a labeled section ("Icon") containing:
  - A **curated grid** of chip `Pressable`s, one per emoji from a module-level `EMOJI_CHOICES` constant. Reuse the chip styling from `ItemForm`'s category picker (`flex-row flex-wrap gap-2`; chip `rounded-full border px-3 py-2`; selected = `border-accent bg-accent`). A chip is "selected" when its emoji `=== value`. Tapping a chip calls `onChange(emoji)`.
  - A **"Default (📦)"** / clear chip that calls `onChange("")` (selected when `value === ""`).
  - A free-entry `Field` (from `ui.tsx`) labeled e.g. "Or type any emoji", bound to `value`/`onChange`, `maxLength={32}`, with a hint. Typing/pasting any emoji sets the value; the grid highlight updates to match if it's one of the curated ones.
  - `EMOJI_CHOICES` starter set (~36, household-relevant): 🔧 🔨 🪛 🔩 🪚 🪜 🧰 🔌 🔋 💡 🚿 🛁 🚽 🚪 🪟 🪑 🛋️ 🛏️ 🚰 🧯 🧹 🧺 🧴 🌡️ ❄️ 🔥 💧 🌳 🪴 🌱 🚗 🚲 🛞 📡 🖥️ 🖨️
- [ ] Match existing label/spacing conventions (compare to the category block and `ReferenceDetailsField.tsx`). No `watch()`.

**Acceptance:** `npm run typecheck` + `npm run lint` pass (zero warnings). Component is self-contained and controlled.

---

### Task 4: Wire into `ItemForm` + demo round-trip

- [ ] `src/components/ItemForm.tsx`:
  - Destructure `setValue` from `useForm`.
  - Add `icon: initial?.icon ?? ""` to `defaultValues`.
  - Inside the **existing category `Controller` render**, after the chips block, conditionally render a **nested `Controller` name="icon"** that mounts `EmojiPickerField`, shown only when `selectedCategory(value)?.name === "Other"`.
  - In each category chip's `onPress`: keep `onChange(cat.id)`, and when the chosen category is not "Other", also `setValue("icon", "")` so a stale override can't persist.
  - In `submit`, add `icon: empty(values.icon)` to the payload object.
- [ ] `src/lib/demo.tsx`:
  - `seedItem`: add `icon: null` to the base object (before `...extra`).
  - `demoDb.createItem` and `updateItem`: carry `icon: values.icon ?? null` (match how other nullable fields are mapped).
  - Give one existing demo item in the **"Other"** category a custom emoji via the `extra` arg (e.g. a "Patio heater" or similar with `icon: "🔥"`), so the feature is visible in the offline demo. If no "Other" demo item exists, add a small one.

**Acceptance:** `npm run typecheck` + `npm run lint` pass. Picker appears only for "Other"; switching away clears it. Demo create/edit round-trips the icon.

---

### Task 5: Display surfaces (list, detail title, digest)

- [ ] `src/app/(app)/(tabs)/items.tsx`: import `itemIcon` and replace the avatar `{item.category.icon}` (~line 171) with `{itemIcon(item)}`.
- [ ] `src/app/(app)/items/[id]/index.tsx`: import `itemIcon`; set `Stack.Screen` `title: \`${itemIcon(item)} ${item.name}\``. Leave the `["Category", ...]` facts row unchanged (it labels the category).
- [ ] Create `supabase/migrations/20260615000002_digest_item_icon.sql`: `create or replace function public.notifications_digest(uuid, integer)` with the **exact body** from `20260613000002`, changing the two `coalesce(c.icon || ' ', '')` occurrences (warranty + end_of_life branches) to `coalesce(coalesce(i.icon, c.icon) || ' ', '')`. Re-apply the trailing `revoke all ... from public, anon, authenticated;` and `grant execute ... to service_role;` (replacing a function resets privileges). Copy the function body verbatim otherwise.

**Acceptance:** `npm run typecheck` passes. Existing items (null icon) render exactly as before; an item with an override shows its emoji in the list, detail title, and digest. SQL reviewed for an exact match to the original aside from the two icon expressions.

---

### Task 6: Docs

- [ ] `docs/superpowers/specs/2026-06-11-hearth-feature-roadmap-design.md`: add a decision row/note recording the custom-emoji-for-Other feature (match the format used for the v1.5 reference-details note).
- [ ] `README.md`: add a short feature bullet near the existing v1.4/v1.5 notes (e.g. an "Incremental improvements" item) describing the custom emoji for "Other" items.

**Acceptance:** docs read cleanly and match surrounding style.

---

## Final review

After all tasks: dispatch a final code review over the whole diff (base → HEAD), then use superpowers:finishing-a-development-branch.
