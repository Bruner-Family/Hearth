import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";

import {
  ScheduleForm,
  type ScheduleFormOutput,
} from "@/components/ScheduleForm";
import { Button, Loading } from "@/components/ui";
import { useHousehold } from "@/lib/household";
import {
  useDeleteSchedule,
  useSchedules,
  useUpdateSchedule,
} from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function EditScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { active } = useHousehold();
  const { data: schedules = [], isLoading } = useSchedules(
    active?.household.id,
  );
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const schedule = schedules.find((s) => s.id === id);
  if (isLoading || !schedule) return <Loading />;

  const submit = (values: ScheduleFormOutput) =>
    updateSchedule.mutate(
      { id: schedule.id, ...values },
      { onSuccess: () => router.back() },
    );

  const confirmDelete = () => {
    const doDelete = () =>
      deleteSchedule.mutate(
        { id: schedule.id, household_id: schedule.household_id },
        { onSuccess: () => router.back() },
      );
    if (Platform.OS === "web") {
      if (window.confirm(`Delete the "${schedule.name}" schedule?`)) doDelete();
      return;
    }
    Alert.alert(
      "Delete schedule?",
      `"${schedule.name}" — past log entries stay.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Edit schedule",
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
        <ScheduleForm
          initial={schedule}
          submitLabel="Save changes"
          onSubmit={submit}
          pending={updateSchedule.isPending}
          error={updateSchedule.error?.message}
        />
        <View className="mt-10">
          <Button
            title="Delete schedule"
            variant="danger"
            loading={deleteSchedule.isPending}
            onPress={confirmDelete}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
