import { describe, expect, it } from "vitest";

import {
  discordBody,
  telegramBody,
} from "../../../supabase/functions/notify/delivery";
import {
  formatDigest,
  formatScheduleReminderMessages,
  MAX_MESSAGE_CHARS,
  type DigestRow,
  type ScheduleReminderRow,
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

const reminderRow = (n: number): ScheduleReminderRow => ({
  schedule_id: `schedule-${n}`,
  schedule_name: `Replace filter ${n}`,
  item_name: "Furnace",
  occurrence_due_on: "2026-06-11",
});

describe("formatScheduleReminderMessages", () => {
  it("uses cadence-neutral wording and authenticated schedule links", () => {
    const messages = formatScheduleReminderMessages(
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
    expect(messages).toHaveLength(1);
    const { text } = messages[0];
    expect(text).toContain("Home - Hearth reminders");
    expect(text).toContain("Furnace - Replace filter - due 2026-06-11");
    expect(text).toContain("https://home.example/schedules/schedule-1/edit");
    expect(text).not.toContain("this week");
  });

  it("splits a long household batch into provider-sized messages", () => {
    const rows = Array.from({ length: 60 }, (_, i) => reminderRow(i));
    const messages = formatScheduleReminderMessages(
      "Home",
      rows,
      "https://home.example",
    );
    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
      expect(message.text).toContain("Home - Hearth reminders");
      expect(message.rows.length).toBeGreaterThan(0);
    }
    expect(messages.flatMap((m) => m.rows)).toEqual(rows);
  });

  it("keeps a single oversized reminder in its own message", () => {
    const rows = [reminderRow(1)];
    const messages = formatScheduleReminderMessages("Home", rows, undefined, 10);
    expect(messages).toHaveLength(1);
    expect(messages[0].rows).toEqual(rows);
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
