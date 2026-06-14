import Fuse, { type IFuseOptions } from "fuse.js";

import type { ItemWithCategory } from "@/lib/database.types";

// Fields searched, by descending importance. Weights bias ranking when a term
// could match in more than one place (a name hit beats a notes hit).
const FUSE_OPTIONS: IFuseOptions<ItemWithCategory> = {
  keys: [
    { name: "name", weight: 3 },
    { name: "brand", weight: 2 },
    { name: "model", weight: 2 },
    { name: "serial_number", weight: 2 },
    { name: "location", weight: 1 },
    { name: "notes", weight: 1 },
  ],
  // 0 = exact, 1 = match anything. 0.3 tolerates typos ("watr"→"Water heater")
  // without short-query false positives ("water"→"Refrigerator", which slips in
  // at 0.4 — Fuse gates matching on threshold internally). Verified empirically.
  threshold: 0.3,
  ignoreLocation: true, // match anywhere in a field, not just the start
  minMatchCharLength: 2,
  includeScore: true,
};

const MIN_QUERY_LEN = 2;

/**
 * Fuzzy-search the household's items. An empty/short query returns the list
 * unchanged (preserving its newest-first order). A multi-word query ANDs its
 * terms: each term is fuzzy-matched independently across the searched fields,
 * an item survives only if every term matches it somewhere, and survivors are
 * ranked by summed match score (lower Fuse score = better).
 */
export function searchItems(
  items: ItemWithCategory[],
  query: string,
): ItemWithCategory[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= MIN_QUERY_LEN);
  if (terms.length === 0) return items;

  const fuse = new Fuse(items, FUSE_OPTIONS);
  const summedScore = new Map<string, number>();
  const termHits = new Map<string, number>();

  for (const term of terms) {
    for (const { item, score } of fuse.search(term)) {
      summedScore.set(item.id, (summedScore.get(item.id) ?? 0) + (score ?? 0));
      termHits.set(item.id, (termHits.get(item.id) ?? 0) + 1);
    }
  }

  return items
    .filter((item) => termHits.get(item.id) === terms.length)
    .sort((a, b) => summedScore.get(a.id)! - summedScore.get(b.id)!);
}
