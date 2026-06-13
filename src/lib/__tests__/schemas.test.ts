import { describe, expect, it } from "vitest";

import { scheduleFormSchema } from "@/lib/schemas";

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
