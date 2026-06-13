import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { ScheduleRow } from "@/components/ScheduleRow";
import { Button, Card, SectionTitle } from "@/components/ui";
import { useHousehold } from "@/lib/household";
import { useSchedules } from "@/lib/queries";

/** "Schedule" section on item detail (roadmap spec v1.2). */
export function ScheduleSection({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { active } = useHousehold();
  const { data: schedules = [] } = useSchedules(active?.household.id);
  const mine = schedules.filter((s) => s.item_id === itemId);

  return (
    <View>
      <SectionTitle>Schedule</SectionTitle>
      {mine.length === 0 ? (
        <Card className="mb-3">
          <Text className="text-sm text-ink-dim">
            No recurring maintenance set up for this item.
          </Text>
        </Card>
      ) : (
        <Card className="mb-3">
          {mine.map((s, i) => (
            <ScheduleRow key={s.id} schedule={s} first={i === 0} />
          ))}
        </Card>
      )}
      <Button
        title="Add schedule"
        variant="secondary"
        onPress={() => router.push(`/schedules/new?itemId=${itemId}`)}
      />
    </View>
  );
}
