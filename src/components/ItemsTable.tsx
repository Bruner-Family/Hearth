import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { ItemWithCategory } from "@/lib/database.types";
import { formatCents, formatMonthYear } from "@/lib/format";
import { type SortDir, type SortKey } from "@/lib/itemSort";
import { formatYears, lifespanStatus } from "@/lib/lifespan";

type ColumnDef = {
  key: SortKey;
  label: string;
  /** Tailwind width/grow classes so columns line up between header and rows. */
  className: string;
  cell: (item: ItemWithCategory) => string;
};

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", className: "flex-1 min-w-[10rem]", cell: (i) => i.name },
  {
    key: "category",
    label: "Category",
    className: "w-40",
    cell: (i) => i.category.name,
  },
  {
    key: "location",
    label: "Location",
    className: "w-32",
    cell: (i) => i.location ?? "—",
  },
  {
    key: "age",
    label: "Age",
    className: "w-24",
    cell: (i) => formatYears(lifespanStatus(i).ageYears),
  },
  {
    key: "price",
    label: "Price",
    className: "w-28",
    cell: (i) => formatCents(i.price_cents),
  },
  {
    key: "purchase",
    label: "Purchased",
    className: "w-28",
    cell: (i) => formatMonthYear(i.purchase_date),
  },
];

export function ItemsTable({
  items,
  sort,
  onSortChange,
}: {
  items: ItemWithCategory[];
  sort: { key: SortKey; dir: SortDir };
  onSortChange: (key: SortKey) => void;
}) {
  const router = useRouter();
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="mx-auto w-full max-w-5xl px-4 pb-28"
    >
      <View className="overflow-hidden rounded-2xl border border-edge">
        {/* Header */}
        <View className="flex-row border-b border-edge bg-card">
          {COLUMNS.map((col) => (
            <Pressable
              key={col.key}
              accessibilityRole="button"
              className={`flex-row items-center gap-1 px-3 py-2.5 active:opacity-70 ${col.className}`}
              onPress={() => onSortChange(col.key)}
            >
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
                {col.label}
              </Text>
              {sort.key === col.key ? (
                <Text className="text-xs text-accent">
                  {sort.dir === "asc" ? "▲" : "▼"}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        {/* Rows */}
        {items.map((item, idx) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            className={`flex-row active:opacity-70 ${
              idx % 2 === 0 ? "bg-bg" : "bg-card"
            }`}
            onPress={() => router.push(`/items/${item.id}`)}
          >
            {COLUMNS.map((col) => (
              <View key={col.key} className={`px-3 py-2.5 ${col.className}`}>
                <Text
                  className={`text-sm ${
                    col.key === "name" ? "font-medium text-ink" : "text-ink-dim"
                  }`}
                  numberOfLines={1}
                >
                  {col.cell(item)}
                </Text>
              </View>
            ))}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
