// Pure formatter shared by the notify handler and its vitest test. No Deno or
// npm: imports here, so Node (vitest) can import it directly.

export type DigestKind = "warranty" | "end_of_life";

export type DigestRow = {
  kind: DigestKind;
  title: string;
  detail: string;
  due_on: string | null;
};

const SECTION_TITLES: Record<DigestKind, string> = {
  warranty: "📑 Warranties expiring",
  end_of_life: "⏳ Reaching end of life",
};

const SECTION_ORDER: DigestKind[] = ["warranty", "end_of_life"];

/** Plain-text digest shared by all channels; "" when there is nothing to send. */
export function formatDigest(householdName: string, rows: DigestRow[]): string {
  if (rows.length === 0) return "";
  const lines: string[] = [`🏡 ${householdName} - Hearth weekly digest`];
  for (const kind of SECTION_ORDER) {
    const group = rows.filter((r) => r.kind === kind);
    if (group.length === 0) continue;
    lines.push("", SECTION_TITLES[kind]);
    for (const r of group) lines.push(`• ${r.title} — ${r.detail}`);
  }
  return lines.join("\n");
}

export type ScheduleReminderRow = {
  schedule_id: string;
  schedule_name: string;
  item_name: string | null;
  occurrence_due_on: string;
};

/** Discord rejects content over 2000 characters; Telegram caps at 4096. */
export const MAX_MESSAGE_CHARS = 1900;

function reminderLines(row: ScheduleReminderRow, baseUrl?: string): string[] {
  const title = row.item_name
    ? `${row.item_name} - ${row.schedule_name}`
    : row.schedule_name;
  const lines = [``, `• ${title} - due ${row.occurrence_due_on}`];
  if (baseUrl) {
    lines.push(`${baseUrl}/schedules/${encodeURIComponent(row.schedule_id)}/edit`);
  }
  return lines;
}

/**
 * Splits a household's reminders into provider-sized messages, each carrying
 * the rows it covers so the caller can record delivery per message. A single
 * row that exceeds the cap still gets its own message rather than being
 * dropped.
 */
export function formatScheduleReminderMessages<T extends ScheduleReminderRow>(
  householdName: string,
  rows: T[],
  appUrl?: string,
  maxChars = MAX_MESSAGE_CHARS,
): { text: string; rows: T[] }[] {
  const header = `${householdName} - Hearth reminders`;
  const baseUrl = appUrl?.replace(/\/$/, "");
  const messages: { text: string; rows: T[] }[] = [];
  let lines = [header];
  let batch: T[] = [];

  for (const row of rows) {
    const next = reminderLines(row, baseUrl);
    const length = [...lines, ...next].join("\n").length;
    if (length > maxChars && batch.length > 0) {
      messages.push({ text: lines.join("\n"), rows: batch });
      lines = [header];
      batch = [];
    }
    lines.push(...next);
    batch.push(row);
  }
  if (batch.length > 0) messages.push({ text: lines.join("\n"), rows: batch });
  return messages;
}
