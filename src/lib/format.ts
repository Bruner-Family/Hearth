const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format integer cents as USD. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return usd.format(cents / 100);
}

/** Parse a user-entered dollar amount ("1,234.56") into integer cents. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

const monthYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const fullDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Parse a YYYY-MM-DD date string as local time (not UTC midnight). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  return monthYear.format(parseISODate(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return fullDate.format(parseISODate(iso));
}

export function todayISO(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}
