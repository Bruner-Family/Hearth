import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { formatDate } from "@/lib/format";
import type { ScheduleWithItem } from "@/lib/queries";
import {
  UPCOMING_WINDOW_DAYS,
  daysUntil,
  formatCadence,
  formatDueness,
} from "@/lib/schedule";

export function ScheduleRow({
  schedule,
  first,
  showItem = false,
}: {
  schedule: ScheduleWithItem;
  first: boolean;
  showItem?: boolean;
}) {
  const router = useRouter();
  const days = daysUntil(schedule.next_due, new Date());
  const dueClass =
    days <= 0
      ? "text-danger"
      : days <= UPCOMING_WINDOW_DAYS
        ? "text-warn"
        : "text-ink-dim";

  return (
    <View
      className={`flex-row items-center gap-3 py-2.5 ${
        first ? "" : "border-t border-edge"
      }`}
    >
      <Pressable
        accessibilityRole="button"
        className="flex-1 active:opacity-70"
        onPress={() => router.push(`/schedules/${schedule.id}/edit`)}
      >
        <Text className="text-sm font-medium text-ink" numberOfLines={1}>
          {schedule.name}
          {showItem && schedule.item ? ` — ${schedule.item.name}` : ""}
        </Text>
        <Text className="text-xs text-ink-dim">
          {formatCadence(schedule)}
          {schedule.last_completed_on
            ? ` · last done ${formatDate(schedule.last_completed_on)}`
            : ""}
        </Text>
      </Pressable>
      <Text className={`text-xs ${dueClass}`}>
        {days <= UPCOMING_WINDOW_DAYS
          ? formatDueness(days)
          : formatDate(schedule.next_due)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mark "${schedule.name}" done`}
        className="h-9 w-9 items-center justify-center rounded-full border border-edge active:opacity-70"
        onPress={() => router.push(`/schedules/${schedule.id}/complete`)}
      >
        <Text className="text-base text-ok">✓</Text>
      </Pressable>
    </View>
  );
}
