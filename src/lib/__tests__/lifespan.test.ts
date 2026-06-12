import { describe, expect, it } from "vitest";

import { formatYears, lifespanBand } from "@/lib/lifespan";

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
