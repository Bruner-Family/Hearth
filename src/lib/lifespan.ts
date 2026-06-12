import type { ItemWithCategory } from "@/lib/database.types";
import { parseISODate } from "@/lib/format";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export type LifespanStatus = {
  /** Effective lifespan: coalesce(item override, category default) — §2.5. */
  lifespanYears: number | null;
  /** Age in years since purchase, or null if purchase date unknown. */
  ageYears: number | null;
  /** age / lifespan, unclamped (can exceed 1 when past end-of-life). */
  ratio: number | null;
  /** Projected replacement date (purchase + lifespan). */
  replaceBy: Date | null;
};

export function lifespanStatus(
  item: ItemWithCategory,
  now: Date = new Date(),
): LifespanStatus {
  const lifespanYears =
    item.lifespan_years_override ?? item.category.default_lifespan_years;
  const purchased = item.purchase_date
    ? parseISODate(item.purchase_date)
    : null;
  const ageYears = purchased
    ? (now.getTime() - purchased.getTime()) / MS_PER_YEAR
    : null;

  let ratio: number | null = null;
  let replaceBy: Date | null = null;
  if (purchased && lifespanYears && lifespanYears > 0) {
    ratio = (ageYears ?? 0) / lifespanYears;
    replaceBy = new Date(purchased.getTime() + lifespanYears * MS_PER_YEAR);
  }

  return { lifespanYears, ageYears, ratio, replaceBy };
}

/**
 * Color band for a remaining-life ratio: green while young, shifting to
 * amber and red as the item approaches (or passes) end-of-life.
 */
export function lifespanBand(ratio: number): "ok" | "warn" | "danger" {
  if (ratio >= 0.9) return "danger";
  if (ratio >= 0.7) return "warn";
  return "ok";
}

export function formatYears(years: number | null): string {
  if (years == null) return "—";
  if (years < 1) return "<1 yr";
  return `${Math.round(years)} yr${Math.round(years) === 1 ? "" : "s"}`;
}
