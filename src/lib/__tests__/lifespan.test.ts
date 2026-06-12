import { describe, expect, it } from "vitest";

import { formatYears, lifespanBand, lifespanStatus } from "@/lib/lifespan";
import { makeItem } from "./fixtures";

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
