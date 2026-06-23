import { beforeEach, describe, expect, it } from "vitest";

import { demoDb } from "@/lib/demo";

describe("demoDb log edit", () => {
  let logId: string;

  beforeEach(() => {
    const log = demoDb.createLog({
      item_id: "demo-item-1",
      performed_on: "2026-01-01",
      cost_cents: 1500,
      performed_by: "self",
      notes: "first",
    });
    logId = log.id;
  });

  it("getLog returns the created row", () => {
    expect(demoDb.getLog(logId).notes).toBe("first");
  });

  it("getLog throws for an unknown id", () => {
    expect(() => demoDb.getLog("nope")).toThrow("Log not found");
  });

  it("updateLog merges provided fields and leaves others intact", () => {
    const updated = demoDb.updateLog(logId, { notes: "edited", cost_cents: 2000 });
    expect(updated.id).toBe(logId);
    expect(updated.notes).toBe("edited");
    expect(updated.cost_cents).toBe(2000);
    expect(updated.performed_by).toBe("self");
    expect(demoDb.getLog(logId).notes).toBe("edited");
  });

  it("updateLog can null out an optional field", () => {
    const updated = demoDb.updateLog(logId, { performed_by: null });
    expect(updated.performed_by).toBeNull();
  });

  it("updateLog throws for an unknown id", () => {
    expect(() => demoDb.updateLog("nope", { notes: "x" })).toThrow("Log not found");
  });
});
