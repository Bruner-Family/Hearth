import { describe, expect, it } from "vitest";

import { snoozeAtReminderTime } from "@/lib/reminders";

describe("snoozeAtReminderTime", () => {
  it("uses the household local reminder time", () => {
    expect(
      snoozeAtReminderTime(
        new Date("2026-08-21T16:00:00Z"),
        1,
        "America/Chicago",
        "09:00",
      ),
    ).toBe("2026-08-22T14:00:00.000Z");
  });

  it("uses the first valid instant after a daylight-saving gap", () => {
    expect(
      snoozeAtReminderTime(
        new Date("2026-03-07T12:00:00Z"),
        1,
        "America/Chicago",
        "02:30",
      ),
    ).toBe("2026-03-08T08:00:00.000Z");
  });

  it("uses the earlier instant during a daylight-saving overlap", () => {
    expect(
      snoozeAtReminderTime(
        new Date("2026-10-31T12:00:00Z"),
        1,
        "America/Chicago",
        "01:30",
      ),
    ).toBe("2026-11-01T06:30:00.000Z");
  });
});
