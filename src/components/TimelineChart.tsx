import { useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import type { ItemWithCategory } from "@/lib/database.types";
import { lifespanBand, lifespanStatus, type LifespanStatus } from "@/lib/lifespan";
import { usePalette } from "@/lib/theme";

const ROW_HEIGHT = 56;
const BAR_HEIGHT = 14;
const BAR_RADIUS = 7;

type Row = { item: ItemWithCategory; status: LifespanStatus };

/**
 * Horizontal remaining-life timeline (ADR-001 §2.5): one bar per item,
 * filled proportionally to age/lifespan, color-shifting toward end-of-life,
 * sorted by projected replacement date. Doubles as a capital-planning view.
 */
export function TimelineChart({ items }: { items: ItemWithCategory[] }) {
  const palette = usePalette();
  const router = useRouter();
  const [width, setWidth] = useState(0);

  const rows: Row[] = items
    .map((item) => ({ item, status: lifespanStatus(item) }))
    .filter((r): r is Row => r.status.ratio !== null)
    .sort(
      (a, b) =>
        (a.status.replaceBy?.getTime() ?? 0) -
        (b.status.replaceBy?.getTime() ?? 0),
    );

  if (rows.length === 0) return null;

  const bandColor = (ratio: number) =>
    ({ ok: palette.ok, warn: palette.warn, danger: palette.danger })[
      lifespanBand(ratio)
    ];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={rows.length * ROW_HEIGHT}>
          {rows.map(({ item, status }, i) => {
            const y = i * ROW_HEIGHT + ROW_HEIGHT - BAR_HEIGHT - 8;
            const ratio = Math.min(1, status.ratio!);
            return (
              <Fragment key={item.id}>
                <Rect
                  x={0}
                  y={y}
                  width={width}
                  height={BAR_HEIGHT}
                  rx={BAR_RADIUS}
                  fill={palette.edge}
                />
                <Rect
                  x={0}
                  y={y}
                  width={Math.max(BAR_HEIGHT, ratio * width)}
                  height={BAR_HEIGHT}
                  rx={BAR_RADIUS}
                  fill={bandColor(status.ratio!)}
                />
              </Fragment>
            );
          })}
        </Svg>
      )}
      {/* Labels overlay + touch targets */}
      <View className="absolute inset-0">
        {rows.map(({ item, status }) => (
          <Pressable
            key={item.id}
            className="justify-start active:opacity-70"
            style={{ height: ROW_HEIGHT }}
            onPress={() => router.push(`/items/${item.id}`)}
          >
            <View className="flex-row items-baseline justify-between">
              <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                {item.category.icon} {item.name}
              </Text>
              <Text className="text-xs text-ink-dim">
                {replacementLabel(status)}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function replacementLabel(status: LifespanStatus): string {
  if (!status.replaceBy) return "";
  const year = status.replaceBy.getFullYear();
  return status.replaceBy.getTime() < Date.now()
    ? `overdue (${year})`
    : `replace ~${year}`;
}
