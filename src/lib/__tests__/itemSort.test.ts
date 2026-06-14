import { describe, expect, it } from "vitest";

import { sortItems } from "@/lib/itemSort";
import { makeItem } from "./fixtures";

const now = new Date(2026, 5, 15);

const a = makeItem({
  id: "a",
  name: "Furnace",
  location: "Basement",
  price_cents: 580_000,
  purchase_date: "2014-06-15", // ~12 yrs old
  category: {
    id: "c-h",
    name: "HVAC",
    icon: "🔥",
    default_lifespan_years: 18,
    sort_order: 1,
  },
});
const b = makeItem({
  id: "b",
  name: "Dishwasher",
  location: "Kitchen",
  price_cents: 84_900,
  purchase_date: "2022-06-15", // ~4 yrs old
  category: {
    id: "c-a",
    name: "Appliance",
    icon: "🍽️",
    default_lifespan_years: 10,
    sort_order: 2,
  },
});
const noData = makeItem({
  id: "z",
  name: "Mystery box",
  location: null,
  price_cents: null,
  purchase_date: null,
});
const items = [a, b, noData];

describe("sortItems", () => {
  it("sorts by name ascending and descending", () => {
    expect(sortItems(items, "name", "asc", now).map((i) => i.id)).toEqual([
      "b",
      "a",
      "z",
    ]);
    expect(sortItems(items, "name", "desc", now).map((i) => i.id)).toEqual([
      "z",
      "a",
      "b",
    ]);
  });

  it("sorts by category name", () => {
    expect(sortItems(items, "category", "asc", now).map((i) => i.id)).toEqual([
      "b", // Appliance
      "a", // HVAC
      "z", // Water heater (tank) — fixture default
    ]);
  });

  it("sorts by price with nulls last in both directions", () => {
    expect(sortItems(items, "price", "asc", now).map((i) => i.id)).toEqual([
      "b",
      "a",
      "z",
    ]);
    expect(sortItems(items, "price", "desc", now).map((i) => i.id)).toEqual([
      "a",
      "b",
      "z",
    ]);
  });

  it("sorts by age (oldest first when descending), nulls last", () => {
    expect(sortItems(items, "age", "desc", now).map((i) => i.id)).toEqual([
      "a", // ~12 yrs
      "b", // ~4 yrs
      "z", // unknown
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [...items];
    sortItems(input, "name", "asc", now);
    expect(input).toEqual(items);
  });
});
