import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  activeFilterCount,
  ageBand,
  distinctLocations,
  filterItems,
} from "@/lib/itemFilters";
import { makeItem } from "./fixtures";

const now = new Date(2026, 5, 15); // 2026-06-15; default lifespan = 11 yrs

describe("ageBand", () => {
  it("is unknown without a purchase date", () => {
    expect(ageBand(makeItem({ purchase_date: null }), now)).toBe("unknown");
  });
  it("is unknown without a lifespan", () => {
    const item = makeItem({
      purchase_date: "2020-06-15",
      lifespan_years_override: null,
      category: {
        id: "c0",
        name: "Other",
        icon: "📦",
        default_lifespan_years: null,
        sort_order: 1,
      },
    });
    expect(ageBand(item, now)).toBe("unknown");
  });
  it("is healthy below 0.7 of lifespan", () => {
    // 3/11 ≈ 0.27
    expect(ageBand(makeItem({ purchase_date: "2023-06-15" }), now)).toBe(
      "healthy",
    );
  });
  it("is aging from 0.7 to under 0.9", () => {
    // 8.5/11 ≈ 0.77
    expect(ageBand(makeItem({ purchase_date: "2017-12-15" }), now)).toBe(
      "aging",
    );
  });
  it("is eol at 0.9 and above", () => {
    // 10.5/11 ≈ 0.95
    expect(ageBand(makeItem({ purchase_date: "2015-12-15" }), now)).toBe("eol");
  });
});

describe("distinctLocations", () => {
  it("returns sorted, trimmed, de-duplicated non-empty locations", () => {
    const items = [
      makeItem({ id: "a", location: "Kitchen" }),
      makeItem({ id: "b", location: " Basement " }),
      makeItem({ id: "c", location: "Kitchen" }),
      makeItem({ id: "d", location: null }),
      makeItem({ id: "e", location: "  " }),
    ];
    expect(distinctLocations(items)).toEqual(["Basement", "Kitchen"]);
  });
});

describe("filterItems", () => {
  const kitchenNew = makeItem({
    id: "kn",
    category_id: "cat-appliance",
    location: "Kitchen",
    purchase_date: "2024-06-15",
  });
  const basementOld = makeItem({
    id: "bo",
    category_id: "cat-hvac",
    location: "Basement",
    purchase_date: "2015-12-15",
  });
  const items = [kitchenNew, basementOld];

  it("returns everything with EMPTY_FILTERS", () => {
    expect(filterItems(items, EMPTY_FILTERS, now)).toEqual(items);
  });
  it("filters by category (OR within the facet)", () => {
    expect(
      filterItems(items, { ...EMPTY_FILTERS, categoryIds: ["cat-hvac"] }, now).map(
        (i) => i.id,
      ),
    ).toEqual(["bo"]);
  });
  it("filters by location", () => {
    expect(
      filterItems(items, { ...EMPTY_FILTERS, locations: ["Kitchen"] }, now).map(
        (i) => i.id,
      ),
    ).toEqual(["kn"]);
  });
  it("filters by age band", () => {
    expect(
      filterItems(items, { ...EMPTY_FILTERS, ageBands: ["eol"] }, now).map(
        (i) => i.id,
      ),
    ).toEqual(["bo"]);
  });
  it("ANDs across facets", () => {
    expect(
      filterItems(
        items,
        { categoryIds: ["cat-hvac"], locations: ["Kitchen"], ageBands: [] },
        now,
      ),
    ).toEqual([]);
  });
});

describe("activeFilterCount", () => {
  it("counts selected values across all facets", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        categoryIds: ["a", "b"],
        locations: ["Kitchen"],
        ageBands: ["eol"],
      }),
    ).toBe(4);
  });
});
