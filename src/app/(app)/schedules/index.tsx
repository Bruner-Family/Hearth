import { Stack, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { ScheduleRow } from "@/components/ScheduleRow";
import { Button, Card, EmptyState, Loading } from "@/components/ui";
import { useHousehold } from "@/lib/household";
import { useSchedules } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function SchedulesScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { active, isLoading } = useHousehold();
  const { data: schedules = [], isLoading: schedulesLoading } = useSchedules(
    active?.household.id,
  );

  if (isLoading || schedulesLoading) return <Loading />;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="mx-auto w-full max-w-2xl p-4 pb-16"
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Schedules",
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerShadowVisible: false,
        }}
      />
      {schedules.length === 0 ? (
        <EmptyState
          icon="🔁"
          title="No schedules yet"
          body="Recurring maintenance shows up here, and on the Home tab when due."
        />
      ) : (
        <Card>
          {schedules.map((s, i) => (
            <ScheduleRow key={s.id} schedule={s} first={i === 0} showItem />
          ))}
        </Card>
      )}
      <View className="mt-4">
        <Button
          title="New house task"
          variant="secondary"
          onPress={() => router.push("/schedules/new")}
        />
      </View>
      <Text className="mt-2 text-center text-xs text-ink-dim">
        Schedules for a specific item are added from that item&apos;s page.
      </Text>
    </ScrollView>
  );
}
