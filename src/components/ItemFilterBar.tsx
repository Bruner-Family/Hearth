import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import type { ItemWithCategory } from "@/lib/database.types";
import {
  activeFilterCount,
  distinctLocations,
  type AgeBand,
  type ItemFilters,
} from "@/lib/itemFilters";
import { useCategories } from "@/lib/queries";

const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: "healthy", label: "Healthy" },
  { value: "aging", label: "Aging" },
  { value: "eol", label: "Near end-of-life" },
  { value: "unknown", label: "Unknown" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-full border px-3 py-2 active:opacity-70 ${
        selected ? "border-accent bg-accent" : "border-edge bg-card"
      }`}
      onPress={onPress}
    >
      <Text
        className={`text-sm ${
          selected ? "font-semibold text-on-accent" : "text-ink"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ItemFilterBar({
  items,
  filters,
  onChange,
}: {
  items: ItemWithCategory[];
  filters: ItemFilters;
  onChange: (next: ItemFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useCategories();
  const locations = distinctLocations(items);
  const count = activeFilterCount(filters);

  // Only show categories that actually appear in this household's items.
  const usedCategoryIds = new Set(items.map((i) => i.category_id));
  const shownCategories = categories.filter((c) => usedCategoryIds.has(c.id));

  return (
    <View>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle filters"
          className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-2.5 active:opacity-70 ${
            count > 0 ? "border-accent bg-accent" : "border-edge bg-card"
          }`}
          onPress={() => setOpen((v) => !v)}
        >
          <Text
            className={`text-sm font-medium ${
              count > 0 ? "text-on-accent" : "text-ink"
            }`}
          >
            Filters{count > 0 ? ` (${count})` : ""}
          </Text>
          <Text className={count > 0 ? "text-on-accent" : "text-ink-dim"}>
            {open ? "▴" : "▾"}
          </Text>
        </Pressable>
        {count > 0 ? (
          <Pressable
            accessibilityRole="button"
            className="px-2 py-2 active:opacity-60"
            onPress={() =>
              onChange({ categoryIds: [], locations: [], ageBands: [] })
            }
          >
            <Text className="text-sm text-danger">Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View className="mt-3 gap-3 rounded-xl border border-edge bg-card p-3">
          <FilterGroup title="Category">
            {shownCategories.map((c) => (
              <Chip
                key={c.id}
                label={`${c.icon} ${c.name}`}
                selected={filters.categoryIds.includes(c.id)}
                onPress={() =>
                  onChange({
                    ...filters,
                    categoryIds: toggle(filters.categoryIds, c.id),
                  })
                }
              />
            ))}
          </FilterGroup>

          {locations.length > 0 ? (
            <FilterGroup title="Location">
              {locations.map((loc) => (
                <Chip
                  key={loc}
                  label={loc}
                  selected={filters.locations.includes(loc)}
                  onPress={() =>
                    onChange({
                      ...filters,
                      locations: toggle(filters.locations, loc),
                    })
                  }
                />
              ))}
            </FilterGroup>
          ) : null}

          <FilterGroup title="Age">
            {AGE_BANDS.map((band) => (
              <Chip
                key={band.value}
                label={band.label}
                selected={filters.ageBands.includes(band.value)}
                onPress={() =>
                  onChange({
                    ...filters,
                    ageBands: toggle(filters.ageBands, band.value),
                  })
                }
              />
            ))}
          </FilterGroup>
        </View>
      ) : null}
    </View>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View>
      <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-dim">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}
