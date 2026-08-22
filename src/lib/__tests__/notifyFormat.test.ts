import { describe, expect, it } from "vitest";

import {
  discordBody,
  formatDigest,
  formatScheduleReminders,
  telegramBody,
  type DigestRow,
} from "../../../supabase/functions/notify/format";

const rows: DigestRow[] = [
  {
    kind: "warranty",
    title: "Dishwasher",
    detail: "warranty ends Jun 18, 2026",
    due_on: "2026-06-18",
  },
  {
    kind: "end_of_life",
    title: "Furnace",
    detail: "16 of 18 expected years",
    due_on: "2028-01-01",
  },
];

describe("formatDigest", () => {
  it("returns empty string when there is nothing to report", () => {
    expect(formatDigest("The Demo House", [])).toBe("");
  });

  it("groups warranty and end-of-life rows without schedules", () => {
    const text = formatDigest("The Demo House", rows);
    expect(text).toContain("The Demo House - Hearth weekly digest");
    expect(text.indexOf("Warranties expiring")).toBeLessThan(
      text.indexOf("Reaching end of life"),
    );
    expect(text).not.toContain("Maintenance due");
  });

  it("omits an empty section", () => {
    const text = formatDigest("Home", [rows[0]]);
    expect(text).toContain("Warranties expiring");
    expect(text).not.toContain("Reaching end of life");
  });
});

describe("formatScheduleReminders", () => {
  it("uses cadence-neutral wording and authenticated schedule links", () => {
    const text = formatScheduleReminders(
      "Home",
      [
        {
          schedule_id: "schedule-1",
          schedule_name: "Replace filter",
          item_name: "Furnace",
          occurrence_due_on: "2026-06-11",
        },
      ],
      "https://home.example/",
    );
    expect(text).toContain("Home - Hearth reminders");
    expect(text).toContain("Furnace - Replace filter - due 2026-06-11");
    expect(text).toContain("https://home.example/schedules/schedule-1/edit");
    expect(text).not.toContain("this week");
  });
});

describe("channel payloads", () => {
  it("discordBody is valid JSON with a content field", () => {
    expect(JSON.parse(discordBody("hi"))).toEqual({ content: "hi" });
  });

  it("telegramBody carries chat_id and text", () => {
    expect(JSON.parse(telegramBody("123", "hi"))).toMatchObject({
      chat_id: "123",
      text: "hi",
    });
  });
});
