# Spend This Year — Split Maintenance vs New Purchases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the dashboard's "💵 Spend this year" card into two co-equal, color-coded streams — new-purchase spend (item purchase prices this year) and maintenance spend (logged costs this year) — kept visually separate.

**Architecture:** Pure client-side change, no schema. The data layer function `spendThisYear` in `src/lib/dashboard.ts` is widened to take the household's `items` (already loaded by the dashboard) alongside `logs`, and returns two `SpendStream`s. `SpendCard` in `src/components/DashboardCards.tsx` renders them as two columns plus a stacked monthly bar chart (laptop width only). Two dedicated chart color tokens (blue/green) are added to the theme, kept separate from the orange UI accent.

**Tech Stack:** TypeScript, React Native + Expo Router, NativeWind (Tailwind), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-spend-this-year-split-design.md`

---

## File Structure

- `src/global.css` — CSS variables for the two chart colors (light + dark).
- `tailwind.config.js` — semantic Tailwind tokens mapping to those variables.
- `src/lib/dashboard.ts` — new `SpendStream`/`YearSpend` types; `spendThisYear` reworked to compute both streams from `logs` + `items`.
- `src/lib/__tests__/dashboard.test.ts` — rewritten `spendThisYear` test suite.
- `src/app/(app)/(tabs)/index.tsx` — pass `items` into `spendThisYear`.
- `src/components/DashboardCards.tsx` — rewritten `SpendCard` + two small local helpers.

**Note on `src/lib/theme.tsx` (YAGNI deviation from spec):** The spec listed `theme.tsx` as a third place to add the colors. We deliberately skip it. The raw-hex `Palette` is only read by consumers that can't use Tailwind classes (e.g. SVG fills in `TimelineChart`). `SpendCard` is built from NativeWind `View`/`Text` and uses the `bg-*`/`text-*` classes directly, so no raw-hex value is consumed. Adding unused palette fields would violate YAGNI.

---

## Task 1: Add chart color tokens

Two new color tokens — `spend-buy` (blue, new purchases) and `spend-fix` (green, maintenance) — kept separate from the orange UI `accent`. CSS variables hold the values (space-separated RGB triples, matching the existing convention) and Tailwind exposes them as classes. There is no unit test for static design tokens; the gate is that the type-check still passes (nothing breaks) and the classes become available.

**Files:**
- Modify: `src/global.css:6-18` (light `:root`) and `src/global.css:26-37` (`.dark:root`)
- Modify: `tailwind.config.js:8-21` (colors map)

- [ ] **Step 1: Add CSS variables to the light theme**

In `src/global.css`, the light `:root` block currently ends with `--c-danger: 220 38 38;`. Add the two tokens right after it so the block reads:

```css
  :root {
    /* Warm "hearth" light theme */
    --c-bg: 250 247 242;
    --c-card: 255 255 255;
    --c-edge: 231 225 216;
    --c-ink: 28 25 23;
    --c-ink-dim: 120 113 108;
    --c-accent: 194 65 12;
    --c-on-accent: 255 251 247;
    --c-ok: 22 163 74;
    --c-warn: 217 119 6;
    --c-danger: 220 38 38;
    --c-spend-buy: 37 99 235; /* blue #2563EB — new purchases */
    --c-spend-fix: 22 163 74; /* green #16A34A — maintenance */
  }
```

- [ ] **Step 2: Add CSS variables to the dark theme**

In `src/global.css`, the `.dark:root` block currently ends with `--c-danger: 248 113 113;`. Add the two tokens right after it so the block reads:

```css
  .dark:root {
    --c-bg: 19 17 16;
    --c-card: 32 29 27;
    --c-edge: 54 49 45;
    --c-ink: 245 240 234;
    --c-ink-dim: 168 162 158;
    --c-accent: 251 146 60;
    --c-on-accent: 33 20 10;
    --c-ok: 74 222 128;
    --c-warn: 251 191 36;
    --c-danger: 248 113 113;
    --c-spend-buy: 96 165 250; /* blue #60A5FA — new purchases */
    --c-spend-fix: 74 222 128; /* green #4ADE80 — maintenance */
  }
```

- [ ] **Step 3: Expose the tokens in Tailwind**

In `tailwind.config.js`, the `colors` map currently ends with the `danger` line. Add the two tokens after it so the map reads:

```js
      colors: {
        // Semantic tokens — values live in src/global.css as CSS variables so
        // light and dark are both first-class themes.
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        card: "rgb(var(--c-card) / <alpha-value>)",
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        "ink-dim": "rgb(var(--c-ink-dim) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "on-accent": "rgb(var(--c-on-accent) / <alpha-value>)",
        ok: "rgb(var(--c-ok) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
        "spend-buy": "rgb(var(--c-spend-buy) / <alpha-value>)",
        "spend-fix": "rgb(var(--c-spend-fix) / <alpha-value>)",
      },
```

- [ ] **Step 4: Verify the project still type-checks**

Run: `npm run typecheck`
Expected: exits 0, no output (the token additions don't change any types; this just confirms nothing was broken syntactically).

- [ ] **Step 5: Commit**

```bash
git add src/global.css tailwind.config.js
git commit -m "feat: add spend-buy/spend-fix chart color tokens"
```

---

## Task 2: Split spend into purchases + maintenance

Rework the data derivation and the card together so the repo stays compiling and the test suite stays green in one commit. The data layer is built test-first; the card and call site are wired immediately after so `spendThisYear`'s new return shape has no stale consumers.

**Files:**
- Modify: `src/lib/dashboard.ts:97-120` (types + `spendThisYear`)
- Test: `src/lib/__tests__/dashboard.test.ts:93-108` (rewrite `spendThisYear` suite)
- Modify: `src/app/(app)/(tabs)/index.tsx:48`
- Modify: `src/components/DashboardCards.tsx:136-160` (`SpendCard`)

- [ ] **Step 1: Rewrite the failing test suite**

In `src/lib/__tests__/dashboard.test.ts`, replace the entire existing `describe("spendThisYear", ...)` block (lines 93-108) with the following. `makeItem` is already imported at the top of the file; `now` is `new Date(2026, 5, 15)`.

```ts
describe("spendThisYear", () => {
  it("sums only the current year's maintenance logs into total and month buckets", () => {
    const logs = [
      makeLog({ performed_on: "2026-03-10", cost_cents: 5000 }),
      makeLog({ id: "l2", performed_on: "2026-03-20", cost_cents: 2500 }),
      makeLog({ id: "l3", performed_on: "2026-05-01", cost_cents: null }),
      makeLog({ id: "l4", performed_on: "2025-12-31", cost_cents: 99900 }),
    ];
    const { maintenance } = spendThisYear(logs, [], now);
    expect(maintenance.totalCents).toBe(7500);
    expect(maintenance.count).toBe(3);
    expect(maintenance.byMonthCents[2]).toBe(7500); // March
    expect(maintenance.byMonthCents[4]).toBe(0); // May log had no cost
    expect(maintenance.byMonthCents).toHaveLength(12);
  });

  it("sums this year's purchases by price and month, excluding prior-year items", () => {
    const items = [
      makeItem({ id: "a", purchase_date: "2026-02-10", price_cents: 120000 }),
      makeItem({ id: "b", purchase_date: "2026-02-25", price_cents: 30000 }),
      makeItem({ id: "c", purchase_date: "2025-11-01", price_cents: 999900 }),
    ];
    const { purchase } = spendThisYear([], items, now);
    expect(purchase.totalCents).toBe(150000);
    expect(purchase.count).toBe(2);
    expect(purchase.byMonthCents[1]).toBe(150000); // February
    expect(purchase.byMonthCents).toHaveLength(12);
  });

  it("excludes items with no purchase_date or no price from purchase totals", () => {
    const items = [
      makeItem({ id: "a", purchase_date: null, price_cents: 50000 }),
      makeItem({ id: "b", purchase_date: "2026-04-01", price_cents: null }),
      makeItem({ id: "c", purchase_date: "2026-04-02", price_cents: 8000 }),
    ];
    const { purchase } = spendThisYear([], items, now);
    expect(purchase.totalCents).toBe(8000);
    expect(purchase.count).toBe(1);
    expect(purchase.byMonthCents[3]).toBe(8000); // April
  });

  it("returns zeroed streams when there is no spend", () => {
    const { purchase, maintenance } = spendThisYear([], [], now);
    const zero = { totalCents: 0, count: 0, byMonthCents: Array(12).fill(0) };
    expect(purchase).toEqual(zero);
    expect(maintenance).toEqual(zero);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/dashboard.test.ts`
Expected: FAIL — the new tests call `spendThisYear(logs, [], now)` / `spendThisYear([], items, now)` and destructure `.purchase` / `.maintenance`, but the current function takes `(logs, now)` and returns `{ totalCents, count, byMonthCents }`. Failures will reference `purchase`/`maintenance` being `undefined` and/or a TS arity error.

- [ ] **Step 3: Rework the types and function in `dashboard.ts`**

In `src/lib/dashboard.ts`, replace the existing `YearSpend` type and `spendThisYear` function (lines 97-120) with the following. The file already imports `ItemWithCategory` and `MaintenanceLog` at the top (line 1).

```ts
export type SpendStream = {
  totalCents: number;
  count: number;
  /** Index 0 = January of the current year. */
  byMonthCents: number[];
};

export type YearSpend = {
  purchase: SpendStream;
  maintenance: SpendStream;
};

function emptyStream(): SpendStream {
  return {
    totalCents: 0,
    count: 0,
    byMonthCents: Array.from({ length: 12 }, () => 0),
  };
}

export function spendThisYear(
  logs: MaintenanceLog[],
  items: ItemWithCategory[],
  now: Date,
): YearSpend {
  const year = now.getFullYear();

  const maintenance = emptyStream();
  for (const log of logs) {
    if (Number(log.performed_on.slice(0, 4)) !== year) continue;
    maintenance.count += 1;
    const cents = log.cost_cents ?? 0;
    maintenance.totalCents += cents;
    maintenance.byMonthCents[Number(log.performed_on.slice(5, 7)) - 1] += cents;
  }

  // Acquisition spend: an item counts only when it was both purchased this
  // year and has a price. Items missing either are absent from the totals
  // (and the count), so backfilling old or price-less items never inflates
  // the year.
  const purchase = emptyStream();
  for (const item of items) {
    if (!item.purchase_date) continue;
    if (Number(item.purchase_date.slice(0, 4)) !== year) continue;
    if (item.price_cents == null) continue;
    purchase.count += 1;
    purchase.totalCents += item.price_cents;
    purchase.byMonthCents[Number(item.purchase_date.slice(5, 7)) - 1] +=
      item.price_cents;
  }

  return { purchase, maintenance };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/dashboard.test.ts`
Expected: PASS — all four `spendThisYear` tests green, plus the unchanged `needsAttention` and `nextFiveYears` suites.

- [ ] **Step 5: Pass `items` into `spendThisYear` at the call site**

In `src/app/(app)/(tabs)/index.tsx`, line 48 currently reads:

```tsx
  const spend = spendThisYear(logs, now);
```

Change it to (the `items` variable is already in scope from line 22):

```tsx
  const spend = spendThisYear(logs, items, now);
```

- [ ] **Step 6: Rewrite `SpendCard` to render both streams**

In `src/components/DashboardCards.tsx`, replace the entire existing `SpendCard` function (lines 136-160) with the following. `formatCents` is already imported (line 10) and `YearSpend` is already imported from `@/lib/dashboard` (lines 5-9); `View`, `Text` are imported (line 2); `Card`, `CardTitle` are defined in the file.

```tsx
export function SpendCard({ spend }: { spend: YearSpend }) {
  const year = new Date().getFullYear();
  // Bars scale to the tallest *combined* month so the stacked total fits.
  const max = Math.max(
    ...spend.purchase.byMonthCents.map(
      (cents, month) => cents + spend.maintenance.byMonthCents[month],
    ),
    1,
  );
  return (
    <Card className="flex-1">
      <CardTitle>💵 Spend this year</CardTitle>
      <View className="flex-row gap-6">
        <SpendColumn
          label="🛒 New purchases"
          valueClassName="text-spend-buy"
          totalCents={spend.purchase.totalCents}
          count={spend.purchase.count}
          noun="item"
          year={year}
        />
        <SpendColumn
          label="🔧 Maintenance"
          valueClassName="text-spend-fix"
          totalCents={spend.maintenance.totalCents}
          count={spend.maintenance.count}
          noun="log"
          year={year}
        />
      </View>
      {/* Stacked monthly bars earn their space on laptop only (spec v1.1). */}
      <View className="mt-3 hidden h-16 flex-row items-end gap-1 md:flex">
        {spend.purchase.byMonthCents.map((buyCents, month) => {
          const fixCents = spend.maintenance.byMonthCents[month];
          const total = buyCents + fixCents;
          if (total === 0) {
            return (
              <View key={month} className="h-1.5 flex-1 self-end rounded-t bg-edge" />
            );
          }
          return (
            <View
              key={month}
              className="flex-1 self-end overflow-hidden rounded-t"
              style={{ height: `${Math.max(6, (total / max) * 100)}%` }}
            >
              {/* Default RN flex direction is column: blue purchases on top,
                  green maintenance below. flexGrow is a unitless ratio. */}
              <View
                className="bg-spend-buy"
                style={{ flexGrow: buyCents, flexBasis: 0 }}
              />
              <View
                className="bg-spend-fix"
                style={{ flexGrow: fixCents, flexBasis: 0 }}
              />
            </View>
          );
        })}
      </View>
      <View className="mt-2 hidden flex-row gap-4 md:flex">
        <LegendChip colorClassName="bg-spend-buy" label="purchases" />
        <LegendChip colorClassName="bg-spend-fix" label="maintenance" />
      </View>
    </Card>
  );
}

function SpendColumn({
  label,
  valueClassName,
  totalCents,
  count,
  noun,
  year,
}: {
  label: string;
  valueClassName: string;
  totalCents: number;
  count: number;
  noun: string;
  year: number;
}) {
  return (
    <View>
      <Text className="text-xs text-ink-dim">{label}</Text>
      <Text className={`text-2xl font-bold ${valueClassName}`}>
        {formatCents(totalCents)}
      </Text>
      <Text className="mt-1 text-xs text-ink-dim">
        {count} {noun}
        {count === 1 ? "" : "s"} in {year}
      </Text>
    </View>
  );
}

function LegendChip({
  colorClassName,
  label,
}: {
  colorClassName: string;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`h-2 w-2 rounded-sm ${colorClassName}`} />
      <Text className="text-xs text-ink-dim">{label}</Text>
    </View>
  );
}
```

- [ ] **Step 7: Verify the whole project is green**

Run: `npm test`
Expected: PASS — full Vitest suite green.

Run: `npm run typecheck`
Expected: exits 0, no output — `spendThisYear`'s new shape now has matching consumers in `index.tsx` and `SpendCard`.

Run: `npm run lint`
Expected: exits 0, no warnings (CI runs lint with `--max-warnings 0`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/dashboard.ts src/lib/__tests__/dashboard.test.ts "src/app/(app)/(tabs)/index.tsx" src/components/DashboardCards.tsx
git commit -m "feat: split Spend this year into new purchases vs maintenance"
```

---

## Task 3: Manual verification in the browser

Static tokens and pure functions are covered by automated checks; the visual card is not. Confirm it renders correctly in demo mode, which seeds items with purchase dates/prices and maintenance logs.

**Files:** none (verification only).

- [ ] **Step 1: Start the web app**

Run: `npm run web`
Expected: Expo dev server starts and prints a localhost URL.

- [ ] **Step 2: Open the dashboard in demo mode and check the card**

Open the printed URL, enter the app's demo mode, and find the "💵 Spend this year" card on the Home dashboard. Verify:
- Two columns: "🛒 New purchases" in blue and "🔧 Maintenance" in green, each with a dollar amount and a "`N` item(s)/log(s) in 2026" sub-line.
- Singular/plural reads correctly (e.g. "1 item in 2026", "2 logs in 2026").
- At laptop width (window ≥ `md`, ~768px+), the stacked monthly bars and the blue/green legend appear; each non-empty bar shows blue stacked above green.
- Narrow the window below `md`: the chart and legend hide, the two columns remain.

- [ ] **Step 3: Stop the dev server**

Press `Ctrl+C` in the terminal running `npm run web`.

---

## Self-Review

**Spec coverage:**
- New-purchase definition (purchase_date this year + price, exclude missing/prior-year) → Task 2 Step 3 + tests in Step 1. ✅
- Maintenance unchanged (performed_on this year) → Task 2 Step 3 + regression test. ✅
- Two co-equal columns, blue/green, order purchases-left → Task 2 Step 6. ✅
- Sub-line pluralization → Task 2 Step 6 (`SpendColumn`). ✅
- Stacked monthly chart, laptop-only, scale to combined max, legend → Task 2 Step 6. ✅
- Empty state shows $0.00 / 0 (no special copy) → `formatCents(0)` returns "$0.00"; tested zeroed streams in Step 1. ✅
- Two dedicated chart tokens, separate from accent, light+dark → Task 1. ✅
- `YearSpend`/`SpendStream` types → Task 2 Step 3. ✅
- Call site passes items → Task 2 Step 5. ✅
- Tests updated (purchase agg, prior-year exclusion, missing price/date, both-empty, monthly bucketing) → Task 2 Step 1. ✅
- Out of scope (no schema, no nav, USD only, other cards untouched) → respected. ✅
- `theme.tsx` omission → documented as deliberate YAGNI deviation in File Structure note.

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code; every run step has an exact command + expected result.

**Type consistency:** `YearSpend` = `{ purchase: SpendStream; maintenance: SpendStream }` and `SpendStream` = `{ totalCents; count; byMonthCents }` are used identically in `dashboard.ts`, the tests (`.purchase`/`.maintenance` destructuring), and `SpendCard`. `spendThisYear(logs, items, now)` signature matches the call site and all test calls. Tailwind classes `text-spend-buy`/`bg-spend-buy`/`text-spend-fix`/`bg-spend-fix` match the tokens added in Task 1.
