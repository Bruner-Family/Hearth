import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";

import { ExportCsvButton } from "@/components/ExportCsvButton";
import { ItemFilterBar } from "@/components/ItemFilterBar";
import { ItemsTable } from "@/components/ItemsTable";
import { LifespanBar } from "@/components/LifespanBar";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState, Loading } from "@/components/ui";
import type { ItemWithCategory } from "@/lib/database.types";
import { formatMonthYear } from "@/lib/format";
import { useHousehold } from "@/lib/household";
import { EMPTY_FILTERS, filterItems, type ItemFilters } from "@/lib/itemFilters";
import { sortItems, type SortDir, type SortKey } from "@/lib/itemSort";
import { formatYears, lifespanStatus } from "@/lib/lifespan";
import { useItems } from "@/lib/queries";
import { searchItems } from "@/lib/search";

export default function ItemsScreen() {
  const router = useRouter();
  const { active, isLoading: householdLoading } = useHousehold();
  const { data: items, isLoading } = useItems(active?.household.id);
  const { width } = useWindowDimensions();
  const numColumns = width >= 768 ? 2 : 1;

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });

  // Table + toggle are laptop-only power tools (web at the md breakpoint).
  const canTable = Platform.OS === "web" && width >= 768;
  const showTable = canTable && view === "table";

  // One "now" per mount keeps age-band/lifespan math stable across renders.
  const now = useMemo(() => new Date(), []);
  const all = useMemo(() => items ?? [], [items]);
  const visible = useMemo(() => {
    const searched = searchItems(all, query);
    const filtered = filterItems(searched, filters, now);
    return showTable ? sortItems(filtered, sort.key, sort.dir, now) : filtered;
  }, [all, query, filters, now, showTable, sort]);

  if (householdLoading || isLoading) return <Loading />;

  // Key the "X of N" line on the outcome: if nothing was narrowed (even with an
  // active query that matched everything), just show the plain total.
  const filtering = visible.length !== all.length;

  const onSortChange = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  return (
    <View className="flex-1 bg-bg">
      <View className="mx-auto w-full max-w-5xl gap-3 px-4 pt-4">
        <SearchBar value={query} onChange={setQuery} />
        <ItemFilterBar items={all} filters={filters} onChange={setFilters} />
        <View className="flex-row items-center justify-between">
          {all.length > 0 ? (
            <Text className="text-sm text-ink-dim">
              {filtering
                ? `${visible.length} of ${all.length} items`
                : `${all.length} item${all.length === 1 ? "" : "s"}`}
            </Text>
          ) : (
            <View />
          )}
          {canTable ? (
            <View className="flex-row items-center gap-2">
              <ExportCsvButton items={visible} />
              <View className="flex-row gap-1 rounded-xl border border-edge bg-card p-1">
                {(["cards", "table"] as const).map((mode) => {
                  const selected = view === mode;
                  return (
                    <Pressable
                      key={mode}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`rounded-lg px-3 py-1.5 active:opacity-70 ${
                        selected ? "bg-accent" : ""
                      }`}
                      onPress={() => setView(mode)}
                    >
                      <Text
                        className={`text-sm ${
                          selected
                            ? "font-semibold text-on-accent"
                            : "text-ink-dim"
                        }`}
                      >
                        {mode === "cards" ? "Cards" : "Table"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {showTable && visible.length > 0 ? (
        <ItemsTable items={visible} sort={sort} onSortChange={onSortChange} />
      ) : (
        <FlatList
          key={numColumns} // FlatList can't change numColumns in place
          data={visible}
          numColumns={numColumns}
          keyExtractor={(item) => item.id}
          contentContainerClassName="mx-auto w-full max-w-5xl p-4 pb-28 gap-3"
          columnWrapperClassName={numColumns > 1 ? "gap-3" : undefined}
          renderItem={({ item }) =>
            numColumns > 1 ? (
              <View className="flex-1">
                <ItemCard item={item} />
              </View>
            ) : (
              <ItemCard item={item} />
            )
          }
          ListEmptyComponent={
            all.length === 0 ? (
              <EmptyState
                icon="🏡"
                title="No items yet"
                body="Add your first home asset — the roof, the furnace, that fridge — and start its paper trail."
              />
            ) : (
              <EmptyState
                icon="🔍"
                title="No matches"
                body="No items match your search and filters. Try clearing some."
              />
            )
          }
        />
      )}

      {/* Large touch target, thumb-reachable — mobile-first (§2.6) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add item"
        className="absolute bottom-6 right-6 h-16 w-16 items-center justify-center rounded-full bg-accent shadow-lg active:opacity-80"
        onPress={() => router.push("/items/new")}
      >
        <Text className="text-3xl leading-9 text-on-accent">＋</Text>
      </Pressable>
    </View>
  );
}

function ItemCard({ item }: { item: ItemWithCategory }) {
  const router = useRouter();
  const status = lifespanStatus(item);

  return (
    <Pressable
      accessibilityRole="button"
      className="rounded-2xl border border-edge bg-card p-4 active:opacity-70"
      onPress={() => router.push(`/items/${item.id}`)}
    >
      <View className="flex-row items-center gap-3">
        <Text className="text-3xl">{item.category.icon}</Text>
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-sm text-ink-dim" numberOfLines={1}>
            {[item.location, formatMonthYear(item.purchase_date)]
              .filter((part) => part && part !== "—")
              .join(" · ") || item.category.name}
          </Text>
        </View>
        {status.ageYears != null ? (
          <Text className="text-sm text-ink-dim">
            {formatYears(status.ageYears)}
            {status.lifespanYears ? ` / ${status.lifespanYears} yrs` : ""}
          </Text>
        ) : null}
      </View>
      {status.ratio != null ? (
        <View className="mt-3">
          <LifespanBar ratio={status.ratio} height={6} />
        </View>
      ) : null}
    </Pressable>
  );
}
