import type { ItemWithCategory } from "@/lib/database.types";
import { lifespanStatus } from "@/lib/lifespan";

// Age bands reuse the dashboard's lifespan thresholds (lifespanBand): an item
// the Home tab would flag "needs attention" is exactly an "eol" item here.
export type AgeBand = "healthy" | "aging" | "eol" | "unknown";

export type ItemFilters = {
  categoryIds: string[];
  locations: string[];
  ageBands: AgeBand[];
};

export const EMPTY_FILTERS: ItemFilters = {
  categoryIds: [],
  locations: [],
  ageBands: [],
};

export function ageBand(item: ItemWithCategory, now: Date = new Date()): AgeBand {
  const { ratio } = lifespanStatus(item, now);
  if (ratio == null) return "unknown";
  if (ratio >= 0.9) return "eol";
  if (ratio >= 0.7) return "aging";
  return "healthy";
}

/** Sorted, trimmed, de-duplicated non-empty locations for the filter chips. */
export function distinctLocations(items: ItemWithCategory[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const loc = item.location?.trim();
    if (loc) set.add(loc);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Keep items matching every active facet (AND across facets); within a facet,
 * any selected value matches (OR). An empty facet imposes no constraint.
 */
export function filterItems(
  items: ItemWithCategory[],
  filters: ItemFilters,
  now: Date = new Date(),
): ItemWithCategory[] {
  return items.filter((item) => {
    if (
      filters.categoryIds.length > 0 &&
      !filters.categoryIds.includes(item.category_id)
    ) {
      return false;
    }
    if (filters.locations.length > 0) {
      const loc = item.location?.trim() ?? "";
      if (!filters.locations.includes(loc)) return false;
    }
    if (
      filters.ageBands.length > 0 &&
      !filters.ageBands.includes(ageBand(item, now))
    ) {
      return false;
    }
    return true;
  });
}

export function activeFilterCount(filters: ItemFilters): number {
  return (
    filters.categoryIds.length +
    filters.locations.length +
    filters.ageBands.length
  );
}
