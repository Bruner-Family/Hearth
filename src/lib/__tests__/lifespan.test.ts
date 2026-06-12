import { describe, expect, it } from "vitest";

import type { ItemWithCategory } from "@/lib/database.types";
import { formatYears, lifespanBand, lifespanStatus } from "@/lib/lifespan";

describe("lifespanBand", () => {
  it("is ok below 0.7", () => expect(lifespanBand(0.5)).toBe("ok"));
  it("is warn from 0.7", () => expect(lifespanBand(0.7)).toBe("warn"));
  it("is danger from 0.9", () => expect(lifespanBand(0.9)).toBe("danger"));
  it("is danger past end-of-life", () => expect(lifespanBand(1.4)).toBe("danger"));
});

describe("formatYears", () => {
  it("formats null as em dash", () => expect(formatYears(null)).toBe("—"));
  it("formats under a year", () => expect(formatYears(0.4)).toBe("<1 yr"));
  it("rounds and pluralizes", () => expect(formatYears(11.6)).toBe("12 yrs"));
  it("singular for one year", () => expect(formatYears(1.2)).toBe("1 yr"));
});

export function makeItem(overrides: Partial<ItemWithCategory> = {}): ItemWithCategory {
  return {
    id: "i1",
    household_id: "h1",
    category_id: "c1",
    name: "Water heater",
    location: null,
    purchase_date: null,
    purchase_date_precision: "day",
    price_cents: null,
    vendor: null,
    brand: null,
    model: null,
    serial_number: null,
    warranty_until: null,
    lifespan_years_override: null,
    notes: null,
    created_by: "u1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    category: {
      id: "c1",
      name: "Water heater (tank)",
      icon: "🔥",
      default_lifespan_years: 11,
      sort_order: 1,
    },
    ...overrides,
  };
}

describe("lifespanStatus with explicit now", () => {
  const now = new Date(2026, 5, 15); // 2026-06-15 local time

  it("computes age and ratio from the given now", () => {
    const status = lifespanStatus(makeItem({ purchase_date: "2016-06-15" }), now);
    expect(status.ageYears).toBeCloseTo(10, 1);
    expect(status.ratio).toBeCloseTo(10 / 11, 2);
    expect(status.replaceBy!.getFullYear()).toBe(2027);
  });

  it("returns nulls without a purchase date", () => {
    const status = lifespanStatus(makeItem(), now);
    expect(status.ratio).toBeNull();
    expect(status.replaceBy).toBeNull();
  });
});
