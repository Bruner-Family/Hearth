import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
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
  useNotificationSettings,
  useSchedules,
  useSnoozeSchedule,
  useUpdateSchedule,
} from "@/lib/queries";
import { snoozeAtReminderTime } from "@/lib/reminders";
import { usePalette } from "@/lib/theme";

export default function EditScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { active } = useHousehold();
  const { data: schedules = [], isLoading } = useSchedules(
    active?.household.id,
  );
  const {
    data: notificationSettings,
    isLoading: notificationSettingsLoading,
  } = useNotificationSettings(active?.household.id);
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const snoozeSchedule = useSnoozeSchedule();

  const schedule = schedules.find((s) => s.id === id);
  if (isLoading || notificationSettingsLoading || !schedule) return <Loading />;

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

  const timeZone = notificationSettings?.time_zone ?? "UTC";
  const reminderTime = notificationSettings?.reminder_time ?? "09:00";
  const now = new Date();
  const setSnooze = (days: number) =>
    snoozeSchedule.mutate({
      schedule,
      snoozed_until: snoozeAtReminderTime(
        new Date(),
        days,
        timeZone,
        reminderTime,
      ),
    });
  const snoozeEnded =
    schedule.snoozed_until != null &&
    Date.parse(schedule.snoozed_until) <= now.getTime();
  const snoozeLabel = schedule.snoozed_until
    ? new Intl.DateTimeFormat(undefined, {
        timeZone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(schedule.snoozed_until))
    : null;

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
        <View className="mt-8 border-t border-edge pt-5">
          <Text className="mb-1 text-base font-semibold text-ink">
            Reminder actions
          </Text>
          <Text className="mb-3 text-xs text-ink-dim">
            {snoozeLabel
              ? snoozeEnded
                ? `Snooze ended ${snoozeLabel}. Reminders are active.`
                : `Snoozed until ${snoozeLabel}.`
              : `Uses ${timeZone} at ${reminderTime.slice(0, 5)}.`}
          </Text>
          <View className="mb-3 flex-row gap-2">
            <View className="flex-1">
              <Button
                title="Tomorrow"
                variant="secondary"
                loading={snoozeSchedule.isPending}
                onPress={() => setSnooze(1)}
              />
            </View>
            <View className="flex-1">
              <Button
                title="1 week"
                variant="secondary"
                loading={snoozeSchedule.isPending}
                onPress={() => setSnooze(7)}
              />
            </View>
          </View>
          {schedule.snoozed_until ? (
            <View className="mb-3">
              <Button
                title="Clear snooze"
                variant="secondary"
                loading={snoozeSchedule.isPending}
                onPress={() =>
                  snoozeSchedule.mutate({ schedule, snoozed_until: null })
                }
              />
            </View>
          ) : null}
          <Button
            title="Mark done"
            onPress={() => router.push(`/schedules/${schedule.id}/complete`)}
          />
          {snoozeSchedule.error ? (
            <Text className="mt-2 text-xs text-danger">
              {snoozeSchedule.error.message}
            </Text>
          ) : null}
        </View>
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
