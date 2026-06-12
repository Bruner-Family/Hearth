import { describe, expect, it } from "vitest";

import {
  addMonths,
  advanceSchedule,
  daysUntil,
  dueCount,
  dueTasks,
  formatCadence,
  formatDueness,
  nextAnchorOccurrence,
} from "@/lib/schedule";
import { makeSchedule } from "./fixtures";

const now = new Date(2026, 5, 15); // 2026-06-15

describe("addMonths", () => {
  it("adds within a year", () => expect(addMonths("2026-03-10", 3)).toBe("2026-06-10"));
  it("rolls over the year", () => expect(addMonths("2026-11-10", 3)).toBe("2027-02-10"));
  it("clamps the day", () => expect(addMonths("2026-01-31", 1)).toBe("2026-02-28"));
  it("respects leap years", () => expect(addMonths("2024-01-31", 1)).toBe("2024-02-29"));
});

describe("nextAnchorOccurrence", () => {
  it("is this year when the month hasn't passed", () =>
    expect(nextAnchorOccurrence(10, "2026-06-15")).toBe("2026-10-01"));
  it("is next year when the month has passed", () =>
    expect(nextAnchorOccurrence(3, "2026-06-15")).toBe("2027-03-01"));
  it("is due now when created during the anchor month", () =>
    expect(nextAnchorOccurrence(6, "2026-06-15")).toBe("2026-06-01"));
});

describe("advanceSchedule", () => {
  it("interval: completion date plus the interval", () => {
    const s = makeSchedule({ interval_months: 3 });
    expect(advanceSchedule(s, "2026-06-12")).toBe("2026-09-12");
  });

  const october = makeSchedule({ interval_months: null, anchor_month: 10 });

  it("anchor: late completion covers the occurrence that was due", () =>
    // Done in January — this October is still ahead.
    expect(advanceSchedule(october, "2026-01-15")).toBe("2026-10-01"));
  it("anchor: completion during the anchor month moves to next year", () =>
    expect(advanceSchedule(october, "2026-10-05")).toBe("2027-10-01"));
  it("anchor: early completion within 3 months covers the upcoming occurrence", () =>
    // Gutters done late September satisfy October.
    expect(advanceSchedule(october, "2026-09-20")).toBe("2027-10-01"));
  it("anchor: completion more than 3 months early counts as the previous one", () => {
    const april = makeSchedule({ interval_months: null, anchor_month: 4 });
    // Done in November (7 months late for April) — next April, not the one after.
    expect(advanceSchedule(april, "2026-11-01")).toBe("2027-04-01");
  });
});

describe("dueTasks", () => {
  it("buckets due (incl. today) and upcoming, sorted soonest first", () => {
    const overdue = makeSchedule({ id: "a", next_due: "2026-06-01" });
    const today = makeSchedule({ id: "b", next_due: "2026-06-15" });
    const soon = makeSchedule({ id: "c", next_due: "2026-07-01" });
    const far = makeSchedule({ id: "d", next_due: "2026-09-01" });
    const tasks = dueTasks([far, soon, today, overdue], now);
    expect(tasks.map((t) => t.schedule.id)).toEqual(["a", "b", "c"]);
    expect(tasks.map((t) => t.bucket)).toEqual(["due", "due", "upcoming"]);
  });

  it("is empty when nothing is due within the window", () => {
    expect(dueTasks([makeSchedule({ next_due: "2026-08-01" })], now)).toEqual([]);
  });

  it("buckets by whole days regardless of time of day", () => {
    const afternoon = new Date(2026, 5, 15, 14, 30);
    const tasks = dueTasks([makeSchedule({ next_due: "2026-06-15" })], afternoon);
    expect(tasks[0].bucket).toBe("due");
  });
});

describe("daysUntil / dueCount", () => {
  it("counts whole days until next_due", () => {
    expect(daysUntil("2026-06-18", now)).toBe(3);
    expect(daysUntil("2026-06-12", now)).toBe(-3);
  });
  it("dueCount counts only due tasks (badge)", () => {
    const schedules = [
      makeSchedule({ id: "a", next_due: "2026-06-01" }),
      makeSchedule({ id: "b", next_due: "2026-07-01" }),
    ];
    expect(dueCount(schedules, now)).toBe(1);
  });
});

describe("formatting", () => {
  it("formats interval cadences", () => {
    expect(formatCadence(makeSchedule({ interval_months: 1 }))).toBe("every month");
    expect(formatCadence(makeSchedule({ interval_months: 3 }))).toBe("every 3 months");
    expect(formatCadence(makeSchedule({ interval_months: 12 }))).toBe("every year");
  });
  it("formats anchor cadences", () => {
    expect(
      formatCadence(makeSchedule({ interval_months: null, anchor_month: 10 })),
    ).toBe("every October");
  });
  it("formats dueness", () => {
    expect(formatDueness(0)).toBe("due today");
    expect(formatDueness(-1)).toBe("1 day overdue");
    expect(formatDueness(-14)).toBe("14 days overdue");
    expect(formatDueness(1)).toBe("due in 1 day");
    expect(formatDueness(12)).toBe("due in 12 days");
  });
});
