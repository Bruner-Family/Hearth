import type { ItemWithCategory } from "@/lib/database.types";

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
