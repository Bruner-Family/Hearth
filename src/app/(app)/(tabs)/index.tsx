import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import {
  NeedsAttentionCard,
  NextFiveYearsCard,
  RecentActivityCard,
  SpendCard,
} from "@/components/DashboardCards";
import { StarterPackCard } from "@/components/StarterPackCard";
import { TimelineChart } from "@/components/TimelineChart";
import { Button, Card, EmptyState, Loading } from "@/components/ui";
import { needsAttention, nextFiveYears, spendThisYear } from "@/lib/dashboard";
import { useHousehold } from "@/lib/household";
import { lifespanStatus } from "@/lib/lifespan";
import { useHouseholdLogs, useItems, useSchedules } from "@/lib/queries";
import { dueTasks } from "@/lib/schedule";

export default function HomeScreen() {
  const router = useRouter();
  const { active, isLoading: householdLoading } = useHousehold();
  const { data: items = [], isLoading } = useItems(active?.household.id);
  const { data: logs = [] } = useHouseholdLogs(active?.household.id);
  const { data: schedules = [] } = useSchedules(active?.household.id);

  if (householdLoading || isLoading) return <Loading />;

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-bg p-6">
        <EmptyState
          icon="🏡"
          title="Welcome to Hearth"
          body="Add your first home asset and this page becomes your home's dashboard."
        />
        <Button title="Add an item" onPress={() => router.push("/items/new")} />
      </View>
    );
  }

  const now = new Date();
  const withLifespan = items.filter(
    (item) => lifespanStatus(item, now).ratio !== null,
  );
  const attention = needsAttention(items, now);
  const tasks = dueTasks(schedules, now);
  const years = nextFiveYears(items, now);
  const spend = spendThisYear(logs, items, now);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="mx-auto w-full max-w-5xl p-4 pb-12"
    >
      {/* Timeline hero — the lifespan bars lead the page (spec v1.1). */}
      {withLifespan.length > 0 ? (
        <Card>
          <TimelineChart items={withLifespan} />
          <View className="mt-4 flex-row justify-center gap-5">
            <LegendDot className="bg-ok" label="healthy" />
            <LegendDot className="bg-warn" label="aging" />
            <LegendDot className="bg-danger" label="near end-of-life" />
          </View>
        </Card>
      ) : (
        <Card>
          <Text className="text-sm text-ink-dim">
            Items need a purchase date and a lifespan (category default or your
            override) to appear on the timeline.
          </Text>
        </Card>
      )}

      <StarterPackCard
        householdId={active!.household.id}
        hasSchedules={schedules.length > 0}
      />

      <View className="mt-4 gap-4 md:flex-row">
        <NeedsAttentionCard tasks={tasks} entries={attention} />
        <NextFiveYearsCard years={years} />
      </View>
      <View className="mt-4 gap-4 md:flex-row">
        <SpendCard spend={spend} />
        <RecentActivityCard logs={logs} />
      </View>
    </ScrollView>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`h-2.5 w-2.5 rounded-full ${className}`} />
      <Text className="text-xs text-ink-dim">{label}</Text>
    </View>
  );
}
