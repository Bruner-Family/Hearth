import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui";
import type {
  AttentionEntry,
  ReplacementYear,
  YearSpend,
} from "@/lib/dashboard";
import { formatCents, formatDate } from "@/lib/format";
import type { HouseholdLog } from "@/lib/queries";

function CardTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-sm font-semibold text-ink">{children}</Text>
  );
}

function QuietNote({ children }: { children: string }) {
  return <Text className="text-sm text-ink-dim">{children}</Text>;
}

export function NeedsAttentionCard({ entries }: { entries: AttentionEntry[] }) {
  const router = useRouter();
  return (
    <Card className="flex-1">
      <CardTitle>⚠️ Needs attention</CardTitle>
      {entries.length === 0 ? (
        <QuietNote>All clear — nothing is near end-of-life.</QuietNote>
      ) : (
        entries.map(({ item, reason, detail }) => (
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
              {item.category.icon} {item.name}
            </Text>
            <Text className="text-xs text-ink-dim">{detail}</Text>
          </Pressable>
        ))
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
              {items.map((i) => `${i.category.icon} ${i.name}`).join("  ")}
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
  const max = Math.max(...spend.byMonthCents, 1);
  return (
    <Card className="flex-1">
      <CardTitle>💵 Spend this year</CardTitle>
      <Text className="text-2xl font-bold text-ink">
        {formatCents(spend.totalCents)}
      </Text>
      <Text className="mt-1 text-xs text-ink-dim">
        {spend.count} log entr{spend.count === 1 ? "y" : "ies"} in{" "}
        {new Date().getFullYear()}
      </Text>
      {/* Monthly bars earn their space on laptop only (spec: chart on laptop). */}
      <View className="mt-3 hidden h-16 flex-row items-end gap-1 md:flex">
        {spend.byMonthCents.map((cents, month) => (
          <View
            key={month}
            className={`flex-1 rounded-t ${cents > 0 ? "bg-accent" : "bg-edge"}`}
            style={{ height: `${Math.max(6, (cents / max) * 100)}%` }}
          />
        ))}
      </View>
    </Card>
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
