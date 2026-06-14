import { describe, expect, it } from "vitest";

import { itemsToCsv } from "@/lib/csv";
import { makeItem } from "./fixtures";

const now = new Date(2026, 5, 15);

describe("itemsToCsv", () => {
  it("emits a header row even with no items", () => {
    const csv = itemsToCsv([], now);
    expect(csv).toBe(
      "Name,Category,Location,Purchase date,Price,Brand,Model,Serial,Warranty until,Age (years),Notes",
    );
  });

  it("serializes one item with blanks for nulls", () => {
    const item = makeItem({
      name: "Water heater",
      location: "Basement",
      purchase_date: "2015-06-15",
      price_cents: 135_000,
      brand: "Rheem",
      model: "XG50T",
      serial_number: "RH-90021",
      warranty_until: null,
      notes: null,
    });
    const lines = itemsToCsv([item], now).split("\r\n");
    // category name comes from the fixture default
    expect(lines[1]).toBe(
      "Water heater,Water heater (tank),Basement,2015-06-15,1350.00,Rheem,XG50T,RH-90021,,11,",
    );
  });

  it("quotes and escapes fields with commas, quotes, or newlines", () => {
    const item = makeItem({
      name: 'Sofa, "big"',
      location: "Living\nroom",
      purchase_date: null,
      price_cents: null,
    });
    const line = itemsToCsv([item], now).split("\r\n")[1];
    expect(line).toContain('"Sofa, ""big"""'); // comma + escaped quotes
    expect(line).toContain('"Living\nroom"'); // embedded newline
  });

  it("neutralizes formula-injection leading characters", () => {
    const item = makeItem({
      name: "=1+1",
      brand: "+danger",
      model: "-cmd",
      serial_number: "@SUM(A1)",
    });
    const line = itemsToCsv([item], now).split("\r\n")[1];
    // Each formula-triggering field is prefixed with a single quote.
    expect(line).toContain("'=1+1");
    expect(line).toContain("'+danger");
    expect(line).toContain("'-cmd");
    expect(line).toContain("'@SUM(A1)");
  });
});
