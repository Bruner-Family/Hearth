import type { ItemWithCategory, MaintenanceSchedule } from "@/lib/database.types";

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

export function makeSchedule(
  overrides: Partial<MaintenanceSchedule> = {},
): MaintenanceSchedule {
  return {
    id: "s1",
    household_id: "h1",
    item_id: null,
    name: "Test smoke detectors",
    interval_months: 6,
    anchor_month: null,
    next_due: "2026-07-01",
    last_completed_on: null,
    notes: null,
    created_by: "u1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
