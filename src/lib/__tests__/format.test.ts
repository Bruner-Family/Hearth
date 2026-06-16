import { describe, expect, it } from "vitest";

import { itemIcon } from "@/lib/format";
import { makeItem } from "@/lib/__tests__/fixtures";

describe("itemIcon", () => {
  it("returns the item's own icon when set", () => {
    const item = makeItem({ icon: "🧯" });
    expect(itemIcon(item)).toBe("🧯");
  });

  it("falls back to category icon when item icon is null", () => {
    const item = makeItem({ icon: null });
    expect(itemIcon(item)).toBe(item.category.icon);
  });

  it("falls back to category icon when item icon is empty string", () => {
    const item = makeItem({ icon: "" });
    expect(itemIcon(item)).toBe(item.category.icon);
  });

  it("falls back to category icon when item icon is whitespace only", () => {
    const item = makeItem({ icon: "   " });
    expect(itemIcon(item)).toBe(item.category.icon);
  });
});
