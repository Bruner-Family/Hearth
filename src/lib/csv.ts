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

/** RFC-4180-style escape: quote when the field contains "," '"' or a newline. */
function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
