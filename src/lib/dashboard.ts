import type { ItemWithCategory, MaintenanceLog } from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { lifespanStatus } from "@/lib/lifespan";

// Pure derivations behind the Home dashboard (roadmap spec v1.1) — no schema,
// everything computed from items and logs the client already loads.

const DAY_MS = 24 * 60 * 60 * 1000;
const WARRANTY_WINDOW_DAYS = 90;
const HORIZON_YEARS = 5;

export type AttentionEntry = {
  item: ItemWithCategory;
  reason: "end-of-life" | "warranty";
  detail: string;
};

export function needsAttention(
  items: ItemWithCategory[],
  now: Date,
): AttentionEntry[] {
  const eol: (AttentionEntry & { ratio: number })[] = [];
  const warranty: AttentionEntry[] = [];

  // Compare whole days: a warranty expiring today must still count this
  // afternoon, so anchor "now" at local midnight.
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  for (const item of items) {
    const status = lifespanStatus(item, now);
    if (status.ratio != null && status.ratio >= 0.9) {
      eol.push({
        item,
        reason: "end-of-life",
        detail: `${Math.round(status.ageYears!)} of ${status.lifespanYears} expected years`,
        ratio: status.ratio,
      });
    }
    if (item.warranty_until) {
      const days =
        (Date.parse(`${item.warranty_until}T00:00:00`) - startOfToday) /
        DAY_MS;
      if (days >= 0 && days <= WARRANTY_WINDOW_DAYS) {
        warranty.push({
          item,
          reason: "warranty",
          detail: `Warranty ends ${formatDate(item.warranty_until)}`,
        });
      }
    }
  }

  eol.sort((a, b) => b.ratio - a.ratio);
  warranty.sort((a, b) =>
    a.item.warranty_until!.localeCompare(b.item.warranty_until!),
  );
  // Strip the sort key without an unused-var destructure (lint runs with
  // --max-warnings 0 in CI).
  return [
    ...eol.map(({ item, reason, detail }) => ({ item, reason, detail })),
    ...warranty,
  ];
}

export type ReplacementYear = {
  year: number;
  items: ItemWithCategory[];
  /** Sum of last-known prices; 0 when no item in the year has a price. */
  totalCents: number;
};

export function nextFiveYears(
  items: ItemWithCategory[],
  now: Date,
): ReplacementYear[] {
  const horizon = new Date(now);
  horizon.setFullYear(horizon.getFullYear() + HORIZON_YEARS);

  const byYear = new Map<number, ReplacementYear>();
  for (const item of items) {
    const { replaceBy } = lifespanStatus(item, now);
    if (!replaceBy || replaceBy > horizon) continue;
    // Overdue replacements belong to "now", not a misleading past year.
    const year = Math.max(replaceBy.getFullYear(), now.getFullYear());
    const entry = byYear.get(year) ?? { year, items: [], totalCents: 0 };
    entry.items.push(item);
    entry.totalCents += item.price_cents ?? 0;
    byYear.set(year, entry);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

export type YearSpend = {
  totalCents: number;
  count: number;
  /** Index 0 = January of the current year. */
  byMonthCents: number[];
};

export function spendThisYear(
  logs: MaintenanceLog[],
  now: Date,
): YearSpend {
  const year = now.getFullYear();
  const byMonthCents = Array.from({ length: 12 }, () => 0);
  let totalCents = 0;
  let count = 0;
  for (const log of logs) {
    if (Number(log.performed_on.slice(0, 4)) !== year) continue;
    count += 1;
    const cents = log.cost_cents ?? 0;
    totalCents += cents;
    byMonthCents[Number(log.performed_on.slice(5, 7)) - 1] += cents;
  }
  return { totalCents, count, byMonthCents };
}
