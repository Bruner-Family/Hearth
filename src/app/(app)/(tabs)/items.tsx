import { useRouter } from "expo-router";
import { FlatList, Pressable, Text, useWindowDimensions, View } from "react-native";

import { LifespanBar } from "@/components/LifespanBar";
import { EmptyState, Loading } from "@/components/ui";
import type { ItemWithCategory } from "@/lib/database.types";
import { formatMonthYear } from "@/lib/format";
import { useHousehold } from "@/lib/household";
import { formatYears, lifespanStatus } from "@/lib/lifespan";
import { useItems } from "@/lib/queries";

export default function ItemsScreen() {
  const router = useRouter();
  const { active, isLoading: householdLoading } = useHousehold();
  const { data: items, isLoading } = useItems(active?.household.id);
  const { width } = useWindowDimensions();
  const numColumns = width >= 768 ? 2 : 1;

  if (householdLoading || isLoading) return <Loading />;

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        key={numColumns} // FlatList can't change numColumns in place
        data={items ?? []}
        numColumns={numColumns}
        keyExtractor={(item) => item.id}
        contentContainerClassName="mx-auto w-full max-w-5xl p-4 pb-28 gap-3"
        columnWrapperClassName={numColumns > 1 ? "gap-3" : undefined}
        renderItem={({ item }) =>
          numColumns > 1 ? (
            // Each grid cell shares the row width; single-column items keep
            // their natural height (flex-1 there would stretch them).
            <View className="flex-1">
              <ItemCard item={item} />
            </View>
          ) : (
            <ItemCard item={item} />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon="🏡"
            title="No items yet"
            body="Add your first home asset — the roof, the furnace, that fridge — and start its paper trail."
          />
        }
      />
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
