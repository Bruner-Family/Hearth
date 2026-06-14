import { Platform, Pressable, Text } from "react-native";

import { itemsToCsv } from "@/lib/csv";
import type { ItemWithCategory } from "@/lib/database.types";
import { todayISO } from "@/lib/format";

/** Trigger a browser download of `csv` as `filename` (web only). */
function downloadCsv(filename: string, csv: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  // Prepend a BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ExportCsvButton({ items }: { items: ItemWithCategory[] }) {
  if (Platform.OS !== "web") return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Export CSV"
      className="rounded-xl border border-edge bg-card px-3 py-2.5 active:opacity-70"
      disabled={items.length === 0}
      onPress={() =>
        downloadCsv(`hearth-items-${todayISO()}.csv`, itemsToCsv(items))
      }
    >
      <Text
        className={`text-sm font-medium ${
          items.length === 0 ? "text-ink-dim" : "text-ink"
        }`}
      >
        ⬇ Export CSV
      </Text>
    </Pressable>
  );
}
