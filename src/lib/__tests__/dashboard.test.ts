import { describe, expect, it } from "vitest";

import {
  needsAttention,
  nextFiveYears,
  spendThisYear,
} from "@/lib/dashboard";
import type { MaintenanceLog } from "@/lib/database.types";
import { makeItem } from "./fixtures";

const now = new Date(2026, 5, 15); // 2026-06-15

function makeLog(overrides: Partial<MaintenanceLog> = {}): MaintenanceLog {
  return {
    id: "l1",
    item_id: "i1",
    performed_on: "2026-03-01",
    cost_cents: null,
    performed_by: null,
    notes: null,
    created_by: "u1",
    created_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

describe("needsAttention", () => {
  it("flags items at >=90% of expected lifespan", () => {
    const old = makeItem({ id: "old", purchase_date: "2016-06-15" }); // 10/11 yrs
    const young = makeItem({ id: "young", purchase_date: "2024-01-01" });
    const entries = needsAttention([old, young], now);
    expect(entries.map((e) => e.item.id)).toEqual(["old"]);
    expect(entries[0].reason).toBe("end-of-life");
    expect(entries[0].detail).toBe("10 of 11 expected years");
  });

  it("flags warranties expiring within 90 days, not already-expired ones", () => {
    const soon = makeItem({ id: "soon", warranty_until: "2026-08-01" });
    const far = makeItem({ id: "far", warranty_until: "2027-06-01" });
    const past = makeItem({ id: "past", warranty_until: "2026-06-01" });
    const entries = needsAttention([soon, far, past], now);
    expect(entries.map((e) => e.item.id)).toEqual(["soon"]);
    expect(entries[0].reason).toBe("warranty");
    expect(entries[0].detail).toBe("Warranty ends Aug 1, 2026");
  });

  it("puts end-of-life entries (worst first) ahead of warranty entries", () => {
    const overdue = makeItem({ id: "overdue", purchase_date: "2010-01-01" });
    const aging = makeItem({ id: "aging", purchase_date: "2016-06-15" });
    const warranty = makeItem({ id: "w", warranty_until: "2026-07-01" });
    const entries = needsAttention([warranty, aging, overdue], now);
    expect(entries.map((e) => e.item.id)).toEqual(["overdue", "aging", "w"]);
  });

  it("includes warranties expiring today and exactly 90 days out, regardless of time of day", () => {
    const afternoon = new Date(2026, 5, 15, 14, 30);
    const today = makeItem({ id: "today", warranty_until: "2026-06-15" });
    const edge = makeItem({ id: "edge", warranty_until: "2026-09-13" });
    const entries = needsAttention([today, edge], afternoon);
    expect(entries.map((e) => e.item.id)).toEqual(["today", "edge"]);
  });
});

describe("nextFiveYears", () => {
  it("groups projected replacements by year with last-known cost", () => {
    const heater = makeItem({
      id: "a",
      purchase_date: "2016-06-15",
      price_cents: 140000,
    }); // replaceBy 2027
    const fridge = makeItem({
      id: "b",
      purchase_date: "2016-06-15",
      price_cents: 250000,
      lifespan_years_override: 13,
    }); // replaceBy 2029
    const years = nextFiveYears([heater, fridge], now);
    expect(years).toHaveLength(2);
    expect(years[0]).toMatchObject({ year: 2027, totalCents: 140000 });
    expect(years[1]).toMatchObject({ year: 2029, totalCents: 250000 });
  });

  it("clamps overdue items into the current year and excludes beyond-horizon items", () => {
    const overdue = makeItem({ id: "o", purchase_date: "2010-01-01" }); // replaceBy 2021
    const distant = makeItem({ id: "d", purchase_date: "2025-01-01" }); // replaceBy 2036
    const years = nextFiveYears([overdue, distant], now);
    expect(years).toHaveLength(1);
    expect(years[0].year).toBe(2026);
    expect(years[0].items.map((i) => i.id)).toEqual(["o"]);
  });
});

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
