import { describe, expect, it } from "vitest";

import {
  discordBody,
  formatDigest,
  telegramBody,
  type DigestRow,
} from "../../../supabase/functions/notify/format";

const rows: DigestRow[] = [
  { kind: "schedule", title: "Furnace — Replace filter", detail: "every 3 months", due_on: "2026-06-11" },
  { kind: "warranty", title: "🍽️ Dishwasher", detail: "warranty ends Jun 18, 2026", due_on: "2026-06-18" },
  { kind: "end_of_life", title: "🔥 Furnace", detail: "16 of 18 expected years", due_on: "2028-01-01" },
];

describe("formatDigest", () => {
  it("returns empty string when there is nothing to report", () => {
    expect(formatDigest("The Demo House", [])).toBe("");
  });

  it("groups rows into ordered sections with the household name", () => {
    const text = formatDigest("The Demo House", rows);
    expect(text).toContain("The Demo House");
    // schedule section comes before warranty before end-of-life
    expect(text.indexOf("Maintenance due")).toBeLessThan(text.indexOf("Warranties expiring"));
    expect(text.indexOf("Warranties expiring")).toBeLessThan(text.indexOf("Reaching end of life"));
    expect(text).toContain("• Furnace — Replace filter — every 3 months");
  });

  it("omits a section that has no rows", () => {
    const text = formatDigest("Home", [rows[0]]);
    expect(text).toContain("Maintenance due");
    expect(text).not.toContain("Warranties expiring");
  });
});

describe("channel payloads", () => {
  it("discordBody is valid JSON with a content field", () => {
    expect(JSON.parse(discordBody("hi"))).toEqual({ content: "hi" });
  });
  it("telegramBody carries chat_id and text", () => {
    expect(JSON.parse(telegramBody("123", "hi"))).toMatchObject({ chat_id: "123", text: "hi" });
  });
});
