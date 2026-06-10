import { ScrollView, Text, View } from "react-native";

import { TimelineChart } from "@/components/TimelineChart";
import { Card, EmptyState, Loading } from "@/components/ui";
import { formatCents } from "@/lib/format";
import { useHousehold } from "@/lib/household";
import { lifespanStatus } from "@/lib/lifespan";
import { useItems } from "@/lib/queries";

export default function TimelineScreen() {
  const { active, isLoading: householdLoading } = useHousehold();
  const { data: items = [], isLoading } = useItems(active?.household.id);

  if (householdLoading || isLoading) return <Loading />;

  const withLifespan = items.filter(
    (item) => lifespanStatus(item).ratio !== null,
  );

  // Capital-planning view (§2.5): what's due soon, and what it cost last time.
  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + 5);
  const dueSoon = withLifespan
    .map((item) => ({ item, status: lifespanStatus(item) }))
    .filter((r) => r.status.replaceBy && r.status.replaceBy <= horizon);
  const dueSoonCost = dueSoon.reduce(
    (sum, r) => sum + (r.item.price_cents ?? 0),
    0,
  );

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="p-4 pb-12"
    >
      {withLifespan.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Nothing to chart yet"
          body="Items need a purchase date and a lifespan (category default or your override) to appear on the timeline."
        />
      ) : (
        <>
          <Card className="mb-4">
            <Text className="text-sm text-ink-dim">
              Due for replacement in the next 5 years
            </Text>
            <Text className="mt-1 text-2xl font-bold text-ink">
              {dueSoon.length} item{dueSoon.length === 1 ? "" : "s"}
              {dueSoonCost > 0 ? ` · ~${formatCents(dueSoonCost)}` : ""}
            </Text>
            {dueSoonCost > 0 ? (
              <Text className="mt-1 text-xs text-ink-dim">
                Based on what each item cost last time.
              </Text>
            ) : null}
          </Card>
          <Card>
            <TimelineChart items={withLifespan} />
            <View className="mt-4 flex-row justify-center gap-5">
              <LegendDot className="bg-ok" label="healthy" />
              <LegendDot className="bg-warn" label="aging" />
              <LegendDot className="bg-danger" label="near end-of-life" />
            </View>
          </Card>
        </>
      )}
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
