import type { PurchaseDatePrecision } from "@/lib/database.types";

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

/** Format a purchase date at its recorded precision ("Jun 2019" vs "Jun 1, 2019"). */
export function formatPurchaseDate(
  iso: string | null | undefined,
  precision: PurchaseDatePrecision,
): string {
  if (!iso) return "—";
  return precision === "month" ? formatMonthYear(iso) : formatDate(iso);
}

/** Combine form values (YYYY-MM month, optional day) into the stored columns. */
export function combinePurchaseDate(
  month: string | undefined,
  day: string | undefined,
): {
  purchase_date: string | null;
  purchase_date_precision: PurchaseDatePrecision;
} {
  if (!month) return { purchase_date: null, purchase_date_precision: "day" };
  if (!day) {
    return {
      purchase_date: `${month}-01`,
      purchase_date_precision: "month",
    };
  }
  return {
    purchase_date: `${month}-${day.padStart(2, "0")}`,
    purchase_date_precision: "day",
  };
}

/** Split the stored purchase date back into form month/day values. */
export function splitPurchaseDate(
  date: string | null | undefined,
  precision: PurchaseDatePrecision | undefined,
): { month: string; day: string } {
  if (!date) return { month: "", day: "" };
  return {
    month: date.slice(0, 7),
    day: precision === "month" ? "" : String(Number(date.slice(8, 10))),
  };
}

export function todayISO(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Return the item's own icon when set, otherwise fall back to its category icon. */
export function itemIcon(item: { icon: string | null; category: { icon: string } }): string {
  return item.icon?.trim() || item.category.icon;
}
