import { describe, expect, it } from "vitest";

import { itemFormSchema, scheduleFormSchema } from "@/lib/schemas";

const base = {
  name: "Replace filter",
  cadence: "interval" as const,
  interval_months: "3",
  anchor_month: null,
  next_due: "2026-07-01",
  notes: "",
};

describe("scheduleFormSchema", () => {
  it("accepts an interval schedule", () => {
    expect(scheduleFormSchema.safeParse(base).success).toBe(true);
  });

  it("accepts an anchor schedule without an interval", () => {
    const result = scheduleFormSchema.safeParse({
      ...base,
      cadence: "anchor",
      interval_months: "",
      anchor_month: 10,
    });
    expect(result.success).toBe(true);
  });

  it("requires interval months for interval cadence", () => {
    const result = scheduleFormSchema.safeParse({ ...base, interval_months: "" });
    expect(result.success).toBe(false);
  });

  it("rejects intervals beyond 120 months", () => {
    const result = scheduleFormSchema.safeParse({ ...base, interval_months: "121" });
    expect(result.success).toBe(false);
  });

  it("requires a month for anchor cadence", () => {
    const result = scheduleFormSchema.safeParse({
      ...base,
      cadence: "anchor",
      interval_months: "",
      anchor_month: null,
    });
    expect(result.success).toBe(false);
  });

  it("requires a name", () => {
    expect(scheduleFormSchema.safeParse({ ...base, name: " " }).success).toBe(false);
  });
});

const baseItem = {
  name: "Furnace",
  category_id: "00000000-0000-4000-8000-000000000000",
  location: "",
  purchase_month: "",
  purchase_day: "",
  price: "",
  vendor: "",
  brand: "",
  model: "",
  serial_number: "",
  warranty_until: "",
  lifespan_years_override: "",
  notes: "",
  reference_details: [] as { label: string; value: string }[],
};

describe("itemFormSchema reference_details", () => {
  it("accepts an empty list", () => {
    expect(itemFormSchema.safeParse(baseItem).success).toBe(true);
  });

  it("accepts valid pairs", () => {
    const result = itemFormSchema.safeParse({
      ...baseItem,
      reference_details: [{ label: "Filter", value: "16×25×1" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a label over 100 characters", () => {
    const result = itemFormSchema.safeParse({
      ...baseItem,
      reference_details: [{ label: "x".repeat(101), value: "v" }],
    });
    expect(result.success).toBe(false);
  });
});
