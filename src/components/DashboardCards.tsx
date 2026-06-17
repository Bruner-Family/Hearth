import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui";
import type {
  AttentionEntry,
  ReplacementYear,
  YearSpend,
} from "@/lib/dashboard";
import { formatCents, formatDate, itemIcon } from "@/lib/format";
import type { HouseholdLog, ScheduleWithItem } from "@/lib/queries";
import { formatDueness, type TaskEntry } from "@/lib/schedule";

function CardTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-sm font-semibold text-ink">{children}</Text>
  );
}

function QuietNote({ children }: { children: string }) {
  return <Text className="text-sm text-ink-dim">{children}</Text>;
}

export function NeedsAttentionCard({
  tasks,
  entries,
}: {
  tasks: TaskEntry<ScheduleWithItem>[];
  entries: AttentionEntry[];
}) {
  const router = useRouter();
  return (
    <Card className="flex-1">
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text className="text-sm font-semibold text-ink">
          ⚠️ Needs attention
        </Text>
        <Pressable
          accessibilityRole="button"
          className="active:opacity-70"
          onPress={() => router.push("/schedules")}
        >
          <Text className="text-xs text-accent">All schedules ›</Text>
        </Pressable>
      </View>
      {tasks.length === 0 && entries.length === 0 ? (
        <QuietNote>All clear — nothing due, nothing near end-of-life.</QuietNote>
      ) : (
        <>
          {tasks.map(({ schedule, bucket, daysUntil }) => (
            <View
              key={schedule.id}
              className="flex-row items-center gap-2 py-1.5"
            >
              <View
                className={`h-2 w-2 rounded-full ${
                  bucket === "due" ? "bg-danger" : "bg-warn"
                }`}
              />
              <Pressable
                accessibilityRole="button"
                className="flex-1 active:opacity-70"
                onPress={() =>
                  router.push(
                    schedule.item
                      ? `/items/${schedule.item.id}`
                      : `/schedules/${schedule.id}/edit`,
                  )
                }
              >
                <Text className="text-sm text-ink" numberOfLines={1}>
                  {schedule.name}
                  {schedule.item ? ` — ${schedule.item.name}` : ""}
                </Text>
              </Pressable>
              <Text className="text-xs text-ink-dim">
                {formatDueness(daysUntil)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mark "${schedule.name}" done`}
                className="rounded-full border border-edge px-2.5 py-1 active:opacity-70"
                onPress={() => router.push(`/schedules/${schedule.id}/complete`)}
              >
                <Text className="text-sm text-ok">✓</Text>
              </Pressable>
            </View>
          ))}
          {entries.map(({ item, reason, detail }) => (
            <Pressable
              key={`${item.id}-${reason}`}
              accessibilityRole="button"
              className="flex-row items-center gap-2 py-1.5 active:opacity-70"
              onPress={() => router.push(`/items/${item.id}`)}
            >
              <View
                className={`h-2 w-2 rounded-full ${
                  reason === "end-of-life" ? "bg-danger" : "bg-warn"
                }`}
              />
              <Text className="flex-1 text-sm text-ink" numberOfLines={1}>
                {itemIcon(item)} {item.name}
              </Text>
              <Text className="text-xs text-ink-dim">{detail}</Text>
            </Pressable>
          ))}
        </>
      )}
    </Card>
  );
}

export function NextFiveYearsCard({ years }: { years: ReplacementYear[] }) {
  return (
    <Card className="flex-1">
      <CardTitle>📅 Next 5 years</CardTitle>
      {years.length === 0 ? (
        <QuietNote>No projected replacements in the next five years.</QuietNote>
      ) : (
        years.map(({ year, items, totalCents }) => (
          <View key={year} className="flex-row items-baseline gap-2 py-1.5">
            <Text className="w-12 text-sm font-semibold text-ink">{year}</Text>
            <Text className="flex-1 text-sm text-ink-dim" numberOfLines={2}>
              {items.map((i) => `${itemIcon(i)} ${i.name}`).join("  ")}
            </Text>
            {totalCents > 0 ? (
              <Text className="text-sm text-ink">~{formatCents(totalCents)}</Text>
            ) : null}
          </View>
        ))
      )}
    </Card>
  );
}

export function SpendCard({ spend }: { spend: YearSpend }) {
  const year = new Date().getFullYear();
  // Bars scale to the tallest *combined* month so the stacked total fits.
  const max = Math.max(
    ...spend.purchase.byMonthCents.map(
      (cents, month) => cents + spend.maintenance.byMonthCents[month],
    ),
    1,
  );
  return (
    <Card className="flex-1">
      <CardTitle>💵 Spend this year</CardTitle>
      <View className="flex-row gap-6">
        <SpendColumn
          label="🛒 New purchases"
          valueClassName="text-spend-buy"
          totalCents={spend.purchase.totalCents}
          count={spend.purchase.count}
          noun="item"
          year={year}
        />
        <SpendColumn
          label="🔧 Maintenance"
          valueClassName="text-spend-fix"
          totalCents={spend.maintenance.totalCents}
          count={spend.maintenance.count}
          noun="log"
          year={year}
        />
      </View>
      {/* Stacked monthly bars earn their space on laptop only (spec v1.1). */}
      <View className="mt-3 hidden h-16 flex-row items-end gap-1 md:flex">
        {spend.purchase.byMonthCents.map((buyCents, month) => {
          const fixCents = spend.maintenance.byMonthCents[month];
          const total = buyCents + fixCents;
          if (total === 0) {
            return (
              <View key={month} className="h-1.5 flex-1 self-end rounded-t bg-edge" />
            );
          }
          return (
            <View
              key={month}
              className="flex-1 self-end overflow-hidden rounded-t"
              style={{ height: `${Math.max(6, (total / max) * 100)}%` }}
            >
              {/* Default RN flex direction is column: blue purchases on top,
                  green maintenance below. flexGrow is a unitless ratio. */}
              <View
                className="bg-spend-buy"
                style={{ flexGrow: buyCents, flexBasis: 0 }}
              />
              <View
                className="bg-spend-fix"
                style={{ flexGrow: fixCents, flexBasis: 0 }}
              />
            </View>
          );
        })}
      </View>
      <View className="mt-2 hidden flex-row gap-4 md:flex">
        <LegendChip colorClassName="bg-spend-buy" label="purchases" />
        <LegendChip colorClassName="bg-spend-fix" label="maintenance" />
      </View>
    </Card>
  );
}

function SpendColumn({
  label,
  valueClassName,
  totalCents,
  count,
  noun,
  year,
}: {
  label: string;
  valueClassName: string;
  totalCents: number;
  count: number;
  noun: string;
  year: number;
}) {
  return (
    <View>
      <Text className="text-xs text-ink-dim">{label}</Text>
      <Text className={`text-2xl font-bold ${valueClassName}`}>
        {formatCents(totalCents)}
      </Text>
      <Text className="mt-1 text-xs text-ink-dim">
        {count} {noun}
        {count === 1 ? "" : "s"} in {year}
      </Text>
    </View>
  );
}

function LegendChip({
  colorClassName,
  label,
}: {
  colorClassName: string;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`h-2 w-2 rounded-sm ${colorClassName}`} />
      <Text className="text-xs text-ink-dim">{label}</Text>
    </View>
  );
}

export function RecentActivityCard({ logs }: { logs: HouseholdLog[] }) {
  const router = useRouter();
  const recent = logs.slice(0, 5);
  return (
    <Card className="flex-1">
      <CardTitle>🕐 Recent activity</CardTitle>
      {recent.length === 0 ? (
        <QuietNote>No maintenance logged yet.</QuietNote>
      ) : (
        recent.map((log) => (
          <Pressable
            key={log.id}
            accessibilityRole="button"
            className="flex-row items-baseline gap-2 py-1.5 active:opacity-70"
            onPress={() => router.push(`/items/${log.item.id}`)}
          >
            <Text className="flex-1 text-sm text-ink" numberOfLines={1}>
              {log.item.name}
              {log.notes ? ` — ${log.notes}` : ""}
            </Text>
            <Text className="text-xs text-ink-dim">
              {formatDate(log.performed_on)}
              {log.cost_cents != null ? ` · ${formatCents(log.cost_cents)}` : ""}
            </Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}
