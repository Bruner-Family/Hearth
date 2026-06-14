import { describe, expect, it } from "vitest";

import { searchItems } from "@/lib/search";
import { makeItem } from "./fixtures";

const heater = makeItem({
  id: "heater",
  name: "Water heater",
  brand: "Rheem",
  model: "XG50T",
  serial_number: "RH-90021",
  location: "Basement",
  notes: "50-gallon natural gas",
});
const fridge = makeItem({
  id: "fridge",
  name: "Refrigerator",
  brand: "LG",
  model: "LFXS26973S",
  location: "Kitchen",
});
const items = [heater, fridge];

describe("searchItems", () => {
  it("returns all items unchanged for an empty or 1-char query", () => {
    expect(searchItems(items, "")).toEqual(items);
    expect(searchItems(items, "   ")).toEqual(items);
    expect(searchItems(items, "a")).toEqual(items);
  });

  it("matches on name", () => {
    expect(searchItems(items, "water").map((i) => i.id)).toEqual(["heater"]);
  });

  it("matches on brand and model across fields", () => {
    expect(searchItems(items, "rheem").map((i) => i.id)).toEqual(["heater"]);
    expect(searchItems(items, "lfxs").map((i) => i.id)).toEqual(["fridge"]);
  });

  it("matches on serial, location, and notes", () => {
    expect(searchItems(items, "90021").map((i) => i.id)).toEqual(["heater"]);
    expect(searchItems(items, "kitchen").map((i) => i.id)).toEqual(["fridge"]);
    expect(searchItems(items, "gallon").map((i) => i.id)).toEqual(["heater"]);
  });

  it("is typo-tolerant", () => {
    expect(searchItems(items, "watr").map((i) => i.id)).toEqual(["heater"]);
  });

  it("ANDs multiple terms across different fields", () => {
    // "rheem" (brand) AND "basement" (location) both only on the heater
    expect(searchItems(items, "rheem basement").map((i) => i.id)).toEqual([
      "heater",
    ]);
    // a term that matches nothing eliminates the item
    expect(searchItems(items, "rheem kitchen")).toEqual([]);
  });
});
