import type { ItemWithCategory } from "@/lib/database.types";
import { lifespanStatus } from "@/lib/lifespan";

type Column = {
  header: string;
  value: (item: ItemWithCategory, now: Date) => string;
};

const dollars = (cents: number | null): string =>
  cents == null ? "" : (cents / 100).toFixed(2);

const COLUMNS: Column[] = [
  { header: "Name", value: (i) => i.name },
  { header: "Category", value: (i) => i.category.name },
  { header: "Location", value: (i) => i.location ?? "" },
  { header: "Purchase date", value: (i) => i.purchase_date ?? "" },
  { header: "Price", value: (i) => dollars(i.price_cents) },
  { header: "Brand", value: (i) => i.brand ?? "" },
  { header: "Model", value: (i) => i.model ?? "" },
  { header: "Serial", value: (i) => i.serial_number ?? "" },
  { header: "Warranty until", value: (i) => i.warranty_until ?? "" },
  {
    header: "Age (years)",
    value: (i, now) => {
      const { ageYears } = lifespanStatus(i, now);
      return ageYears == null ? "" : String(Math.round(ageYears));
    },
  },
  { header: "Notes", value: (i) => i.notes ?? "" },
];

/**
 * Escape a field for CSV. Two concerns:
 *  1. Formula injection — a value starting with =, +, -, @, tab, or CR can be
 *     executed as a formula when the file is opened in Excel/Sheets. Prefix
 *     such values with a single quote so they're treated as text.
 *  2. RFC-4180 quoting — wrap in double quotes (doubling any internal quote)
 *     when the value contains a comma, quote, or newline.
 */
function escapeField(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) {
    v = `'${v}`;
  }
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/**
 * Serialize items to CSV text. Header row uses no CRLF (so an empty export is
 * just the header line); data rows are CRLF-joined per RFC 4180.
 */
export function itemsToCsv(
  items: ItemWithCategory[],
  now: Date = new Date(),
): string {
  const header = COLUMNS.map((c) => c.header).join(",");
  const rows = items.map((item) =>
    COLUMNS.map((c) => escapeField(c.value(item, now))).join(","),
  );
  return [header, ...rows].join("\r\n");
}
