# Spend This Year — Split Maintenance vs New Purchases

**Status:** Approved (design)
**Date:** 2026-06-16

## Problem

The Home dashboard's "💵 Spend this year" card (`SpendCard` in
`src/components/DashboardCards.tsx`) sums **only maintenance-log costs**
(`maintenance_logs.cost_cents` for the current year, via `spendThisYear` in
`src/lib/dashboard.ts`).

Money spent buying items this year — `items.price_cents` for items whose
`purchase_date` is in the current year — is **not counted anywhere** on the
dashboard. The result is a card that silently ignores one of the two natural
kinds of household spend, and gives no way to tell maintenance spend apart from
acquisition spend.

## Goal

Surface both spend streams on the card, **kept visually separate** as two
co-equal numbers, so a glance answers "how much did I spend keeping things
running vs buying new things this year?"

This is a UI + client-side derivation change only. No schema changes — both
data sources (`items`, `maintenance_logs`) are already loaded by the dashboard.

## Definitions

- **New purchases (acquisition spend):** sum of `items.price_cents` for items
  whose `purchase_date` falls in the current calendar year. Count = number of
  such items.
  - Uses `purchase_date`, **not** `created_at`, so backfilling old items into
    the catalog does not inflate the current year.
  - Items with no `price_cents` or no `purchase_date` simply do not contribute.
    No error, they are absent from the totals.
- **Maintenance spend:** sum of `maintenance_logs.cost_cents` for logs whose
  `performed_on` is in the current calendar year. Count = number of such logs.
  Unchanged from today's behavior.

## UI Design

One card titled **💵 Spend this year**, containing two co-equal columns
(layout "Option A"):

| Column | Color | Headline | Sub-line |
| --- | --- | --- | --- |
| 🛒 New purchases (left) | **blue** | `$X.XX` | `N` items in `<year>` |
| 🔧 Maintenance (right) | **green** | `$X.XX` | `N` logs in `<year>` |

- Column order: New purchases left, Maintenance right.
- The sub-line pluralizes correctly (`1 item` / `2 items`, `1 log` / `2 logs`).
- `<year>` is the current calendar year, as today.

### Monthly chart (laptop width only)

Preserve today's behavior of showing the monthly bar chart only at `md` and
wider (`hidden ... md:flex`). With two streams the chart becomes **stacked**:

- One bar per month (12 bars, index 0 = January of the current year).
- Each bar stacks a **blue** purchases segment and a **green** maintenance
  segment.
- Bar heights scale to the largest **combined** monthly total
  (`max(...combinedByMonth, 1)`), so the tallest stacked bar fills the track.
- A small legend below the chart maps blue → purchases, green → maintenance.
- Months with no spend render as the existing muted/empty track.

### Empty state

The card only renders once the household has items (existing dashboard
behavior). When a stream has no qualifying spend it shows `$0.00` with a `0`
count (e.g. "$0.00 / 0 items"). No special empty copy.

## Data Layer

`spendThisYear` in `src/lib/dashboard.ts` changes signature from
`(logs, now)` to `(logs, items, now)` and returns both streams:

```ts
export type SpendStream = {
  totalCents: number;
  count: number;
  /** Index 0 = January of the current year. */
  byMonthCents: number[]; // length 12
};

export type YearSpend = {
  purchase: SpendStream;
  maintenance: SpendStream;
};
```

- `maintenance` is computed exactly as today (iterate `logs`, filter by
  `performed_on` year, bucket by month).
- `purchase` is computed by iterating `items`, filtering by `purchase_date`
  year, skipping items without `purchase_date` or `price_cents`, and bucketing
  `price_cents` by the purchase month.

The dashboard screen (`src/app/(app)/(tabs)/index.tsx`) already loads `items`
via `useItems`, so the call site just passes them:
`spendThisYear(logs, items, now)`.

`SpendCard` in `src/components/DashboardCards.tsx` is rewritten to consume the
new `YearSpend` shape and render the two-column layout + stacked chart + legend.

## Color Tokens

Two dedicated chart colors are added, kept **separate from the orange UI
`accent`** so a data-series color is never mistaken for a tappable element.
They are added in all three places the theme is defined, for both light and
dark schemes:

- `src/global.css` — CSS variables (e.g. `--c-spend-buy`, `--c-spend-fix`).
- `tailwind.config.js` — semantic color tokens mapping to those variables.
- `src/lib/theme.tsx` — `Palette` type + light/dark values (raw hex for any
  non-class consumers).

Target values: purchases **blue** (`#60A5FA` dark) and maintenance **green**
(`#4ADE80` dark), with appropriately-darkened light-theme equivalents
(`#2563EB` / `#16A34A`). Exact light values to be finalized during
implementation against the existing palette.

## Testing

Update `src/lib/__tests__/dashboard.test.ts` and
`src/lib/__tests__/fixtures.ts`:

- Purchase total/count aggregates `price_cents` over items purchased this year.
- Items purchased in a **prior** year are excluded.
- Items with **no `purchase_date`** are excluded.
- Items with **no `price_cents`** are excluded (and do not crash).
- Maintenance aggregation still filters by `performed_on` year (regression).
- Both streams empty → all zeros, 12-length zero `byMonthCents` arrays.
- Monthly bucketing puts spend in the correct month index for both streams.

## Out of Scope

- No schema or migration changes.
- No new tap targets / navigation from the card (it stays non-interactive).
- No currency beyond USD cents (consistent with the rest of the app).
- No change to the "Recent activity" or "Next 5 years" cards.

## Files Touched

- `src/lib/dashboard.ts` — new `YearSpend`/`SpendStream` types, updated
  `spendThisYear`.
- `src/components/DashboardCards.tsx` — rewritten `SpendCard`.
- `src/app/(app)/(tabs)/index.tsx` — pass `items` into `spendThisYear`.
- `src/global.css`, `tailwind.config.js`, `src/lib/theme.tsx` — two new chart
  color tokens.
- `src/lib/__tests__/dashboard.test.ts`, `src/lib/__tests__/fixtures.ts` —
  tests + fixtures.
