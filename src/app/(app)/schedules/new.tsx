import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";

import {
  ScheduleForm,
  type ScheduleFormOutput,
} from "@/components/ScheduleForm";
import { Loading } from "@/components/ui";
import { useHousehold } from "@/lib/household";
import { useCreateSchedule, useItem } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function NewScheduleScreen() {
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { active, isLoading } = useHousehold();
  const { data: item } = useItem(itemId);
  const createSchedule = useCreateSchedule();

  if (isLoading || !active) return <Loading />;

  const submit = (values: ScheduleFormOutput) =>
    createSchedule.mutate(
      {
        household_id: active.household.id,
        item_id: itemId ?? null,
        ...values,
      },
      { onSuccess: () => router.back() },
    );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: itemId && item ? `Schedule: ${item.name}` : "New schedule",
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="mx-auto w-full max-w-2xl p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        {!itemId ? (
          <Text className="mb-4 text-sm text-ink-dim">
            A house-level task, not tied to any item — e.g. “test smoke
            detectors”.
          </Text>
        ) : null}
        <ScheduleForm
          submitLabel="Create schedule"
          onSubmit={submit}
          pending={createSchedule.isPending}
          error={createSchedule.error?.message}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
