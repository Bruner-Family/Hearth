import { describe, expect, it } from "vitest";

import { cleanReferenceDetails } from "@/lib/referenceDetails";

describe("cleanReferenceDetails", () => {
  it("trims labels and values", () => {
    expect(
      cleanReferenceDetails([{ label: "  Filter ", value: " 16×25×1 " }]),
    ).toEqual([{ label: "Filter", value: "16×25×1" }]);
  });

  it("drops rows missing a label or a value", () => {
    expect(
      cleanReferenceDetails([
        { label: "Filter", value: "16×25×1" },
        { label: "", value: "orphan value" },
        { label: "orphan label", value: "" },
        { label: "   ", value: "   " },
      ]),
    ).toEqual([{ label: "Filter", value: "16×25×1" }]);
  });

  it("preserves order and an empty list", () => {
    expect(
      cleanReferenceDetails([
        { label: "Bulb", value: "A19 60W" },
        { label: "Paint", value: "SW 7029" },
      ]),
    ).toEqual([
      { label: "Bulb", value: "A19 60W" },
      { label: "Paint", value: "SW 7029" },
    ]);
    expect(cleanReferenceDetails([])).toEqual([]);
  });
});
