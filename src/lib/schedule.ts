import type { MaintenanceSchedule } from "@/lib/database.types";

// Pure cadence math for maintenance schedules (roadmap spec v1.2). A schedule
// recurs either every N months (interval_months) or yearly in a fixed month
// (anchor_month); exactly one is set (DB check constraint). No RN imports —
// this module is vitest-tested.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before next_due that a task starts showing as "upcoming". */
export const UPCOMING_WINDOW_DAYS = 30;

/**
 * Completing a season-anchored task within this many months *before* the
 * anchor counts as doing that occurrence early (gutters done in late
 * September satisfy October), so the next due date skips to the year after.
 */
const ANCHOR_SLACK_MONTHS = 3;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO date `months` after `iso`, day clamped (Jan 31 + 1mo → Feb 28). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12; // 0-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad2(month + 1)}-${pad2(Math.min(d, daysInMonth))}`;
}

/**
 * First due date for a new anchor schedule: the 1st of `anchorMonth` in
 * `from`'s year unless that month has already passed. Creating an
 * "every October" task during October makes it due immediately.
 */
export function nextAnchorOccurrence(anchorMonth: number, fromISO: string): string {
  const [y, m] = fromISO.split("-").map(Number);
  const year = anchorMonth >= m ? y : y + 1;
  return `${year}-${pad2(anchorMonth)}-01`;
}

/** Next due date after completing a schedule on `completedOn` (ISO date). */
export function advanceSchedule(
  schedule: Pick<MaintenanceSchedule, "interval_months" | "anchor_month">,
  completedOn: string,
): string {
  if (schedule.interval_months != null) {
    return addMonths(completedOn, schedule.interval_months);
  }
  const anchor = schedule.anchor_month!;
  const [y, m] = completedOn.split("-").map(Number);
  // The occurrence most recently due (1st of anchor month at or before now)…
  const prevYear = anchor <= m ? y : y - 1;
  // …unless completion lands within the slack window before the next one,
  // which counts as doing that upcoming occurrence early.
  const monthsUntilNext = (prevYear + 1) * 12 + anchor - (y * 12 + m);
  const coveredYear =
    monthsUntilNext <= ANCHOR_SLACK_MONTHS ? prevYear + 1 : prevYear;
  return `${coveredYear + 1}-${pad2(anchor)}-01`;
}

/** Whole days from `now` until `nextDue`; negative when overdue. */
export function daysUntil(nextDue: string, now: Date): number {
  // Anchor at local midnight so a task due today counts all day (same
  // convention as needsAttention in src/lib/dashboard.ts).
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.round(
    (Date.parse(`${nextDue}T00:00:00`) - startOfToday) / DAY_MS,
  );
}

export type TaskBucket = "due" | "upcoming";

export type TaskEntry<S extends MaintenanceSchedule = MaintenanceSchedule> = {
  schedule: S;
  bucket: TaskBucket;
  /** Whole days until next_due; negative when overdue. */
  daysUntil: number;
};

/**
 * Tasks worth surfacing: due now (next_due ≤ today) or upcoming within
 * UPCOMING_WINDOW_DAYS — soonest first. Generic so joined rows
 * (e.g. ScheduleWithItem) flow through.
 */
export function dueTasks<S extends MaintenanceSchedule>(
  schedules: S[],
  now: Date,
): TaskEntry<S>[] {
  const entries: TaskEntry<S>[] = [];
  for (const schedule of schedules) {
    const days = daysUntil(schedule.next_due, now);
    if (days > UPCOMING_WINDOW_DAYS) continue;
    entries.push({
      schedule,
      bucket: days <= 0 ? "due" : "upcoming",
      daysUntil: days,
    });
  }
  entries.sort((a, b) => a.daysUntil - b.daysUntil);
  return entries;
}

/** Count behind the Home tab badge: tasks due today or overdue. */
export function dueCount(schedules: MaintenanceSchedule[], now: Date): number {
  return dueTasks(schedules, now).filter((t) => t.bucket === "due").length;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "every 3 months" / "every month" / "every year" / "every October". */
export function formatCadence(
  schedule: Pick<MaintenanceSchedule, "interval_months" | "anchor_month">,
): string {
  if (schedule.interval_months != null) {
    if (schedule.interval_months === 1) return "every month";
    if (schedule.interval_months === 12) return "every year";
    return `every ${schedule.interval_months} months`;
  }
  return `every ${MONTH_NAMES[schedule.anchor_month! - 1]}`;
}

/** "due today" / "3 days overdue" / "due in 12 days" — for task rows. */
export function formatDueness(days: number): string {
  if (days === 0) return "due today";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  return `due in ${days} day${days === 1 ? "" : "s"}`;
}
