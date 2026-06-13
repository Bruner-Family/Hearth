// Pure formatter shared by the notify handler and its vitest test. No Deno or
// npm: imports here, so Node (vitest) can import it directly.

export type DigestKind = "schedule" | "warranty" | "end_of_life";

export type DigestRow = {
  kind: DigestKind;
  title: string;
  detail: string;
  due_on: string | null;
};

const SECTION_TITLES: Record<DigestKind, string> = {
  schedule: "🔧 Maintenance due",
  warranty: "📑 Warranties expiring",
  end_of_life: "⏳ Reaching end of life",
};

const SECTION_ORDER: DigestKind[] = ["schedule", "warranty", "end_of_life"];

/** Plain-text digest shared by all channels; "" when there is nothing to send. */
export function formatDigest(householdName: string, rows: DigestRow[]): string {
  if (rows.length === 0) return "";
  const lines: string[] = [`🏡 ${householdName} — this week in Hearth`];
  for (const kind of SECTION_ORDER) {
    const group = rows.filter((r) => r.kind === kind);
    if (group.length === 0) continue;
    lines.push("", SECTION_TITLES[kind]);
    for (const r of group) lines.push(`• ${r.title} — ${r.detail}`);
  }
  return lines.join("\n");
}

export function discordBody(text: string): string {
  return JSON.stringify({ content: text });
}

export function telegramBody(chatId: string, text: string): string {
  return JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true });
}
