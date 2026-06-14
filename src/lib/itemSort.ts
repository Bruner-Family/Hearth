import type { ItemWithCategory } from "@/lib/database.types";
import { lifespanStatus } from "@/lib/lifespan";

export type SortKey = "name" | "category" | "location" | "age" | "price";
export type SortDir = "asc" | "desc";

/** Comparable value for a column; null sorts last regardless of direction. */
function sortValue(
  item: ItemWithCategory,
  key: SortKey,
  now: Date,
): string | number | null {
  switch (key) {
    case "name":
      return item.name;
    case "category":
      return item.category.name;
    case "location":
      return item.location?.trim() || null;
    case "age":
      return lifespanStatus(item, now).ageYears;
    case "price":
      return item.price_cents;
  }
}

/**
 * Stable-ish sort for the table view. Returns a new array (never mutates the
 * input). Missing values (no location/age/price) always sort to the bottom,
 * whichever direction is active, so toggling direction doesn't bury real rows
 * under blanks.
 */
export function sortItems(
  items: ItemWithCategory[],
  key: SortKey,
  dir: SortDir,
  now: Date = new Date(),
): ItemWithCategory[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = sortValue(a, key, now);
    const vb = sortValue(b, key, now);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // nulls last
    if (vb == null) return -1;
    const base =
      typeof va === "string"
        ? va.localeCompare(vb as string)
        : va - (vb as number);
    return base * factor;
  });
}
