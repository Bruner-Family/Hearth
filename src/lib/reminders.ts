type LocalMinute = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function localMinute(date: Date, timeZone: string): LocalMinute {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (kind: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === kind)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function minuteValue(parts: LocalMinute): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
}

export function snoozeAtReminderTime(
  now: Date,
  days: number,
  timeZone: string,
  reminderTime: string,
): string {
  const current = localMinute(now, timeZone);
  const targetDay = new Date(
    Date.UTC(current.year, current.month - 1, current.day + days),
  );
  const [hour, minute] = reminderTime.slice(0, 5).split(":").map(Number);
  const target: LocalMinute = {
    year: targetDay.getUTCFullYear(),
    month: targetDay.getUTCMonth() + 1,
    day: targetDay.getUTCDate(),
    hour,
    minute,
  };
  const wanted = minuteValue(target);
  const guess = wanted;
  let exact: number | null = null;
  let firstAfter: { local: number; instant: number } | null = null;

  for (let offset = -18 * 60; offset <= 18 * 60; offset += 1) {
    const instant = guess + offset * 60_000;
    const local = minuteValue(localMinute(new Date(instant), timeZone));
    if (local === wanted && (exact == null || instant < exact)) exact = instant;
    if (
      local > wanted &&
      (firstAfter == null ||
        local < firstAfter.local ||
        (local === firstAfter.local && instant < firstAfter.instant))
    ) {
      firstAfter = { local, instant };
    }
  }

  const instant = exact ?? firstAfter?.instant;
  if (instant == null) throw new Error("Could not resolve the snooze time");
  return new Date(instant).toISOString();
}
