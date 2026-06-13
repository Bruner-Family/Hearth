import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";

import { DateField } from "@/components/DateField";
import { Button, ErrorNote, Field, Loading } from "@/components/ui";
import { formatDate, parseDollarsToCents, todayISO } from "@/lib/format";
import { useHousehold } from "@/lib/household";
import { useCompleteSchedule, useSchedules } from "@/lib/queries";
import { advanceSchedule, formatCadence } from "@/lib/schedule";
import { logFormSchema, type LogFormValues } from "@/lib/schemas";
import { usePalette } from "@/lib/theme";

export default function CompleteScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { active } = useHousehold();
  const { data: schedules = [], isLoading } = useSchedules(
    active?.household.id,
  );
  const completeSchedule = useCompleteSchedule();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LogFormValues>({
    resolver: zodResolver(logFormSchema),
    defaultValues: {
      performed_on: todayISO(),
      cost: "",
      performed_by: "",
      notes: "",
    },
  });
  const performedOn = useWatch({ control, name: "performed_on" });

  const schedule = schedules.find((s) => s.id === id);
  if (isLoading || !schedule) return <Loading />;

  const nextDuePreview = /^\d{4}-\d{2}-\d{2}$/.test(performedOn)
    ? formatDate(advanceSchedule(schedule, performedOn))
    : null;

  const submit = handleSubmit((values) => {
    completeSchedule.mutate(
      {
        schedule,
        performed_on: values.performed_on,
        cost_cents: values.cost ? parseDollarsToCents(values.cost) : null,
        performed_by: values.performed_by?.trim()
          ? values.performed_by.trim()
          : null,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      },
      { onSuccess: () => router.back() },
    );
  });

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Mark done",
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
        <Text className="text-base font-semibold text-ink">
          {schedule.name}
        </Text>
        <Text className="mb-4 text-sm text-ink-dim">
          {formatCadence(schedule)}
          {schedule.item ? ` · ${schedule.item.name}` : " · house task"}
        </Text>

        <Controller
          control={control}
          name="performed_on"
          render={({ field: { onChange, onBlur, value } }) => (
            <DateField
              label="Date done"
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              error={errors.performed_on?.message}
            />
          )}
        />

        {/* House-level tasks write no maintenance log; only the date matters. */}
        {schedule.item_id ? (
          <>
            <Controller
              control={control}
              name="cost"
              render={({ field: { onChange, onBlur, value } }) => (
                <Field
                  label="Cost (USD)"
                  placeholder="Optional, e.g. 24.99"
                  inputMode="decimal"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.cost?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="performed_by"
              render={({ field: { onChange, onBlur, value } }) => (
                <Field
                  label="Performed by"
                  placeholder='e.g. "self", "ABC Plumbing"'
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.performed_by?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <Field
                  label="Notes"
                  placeholder={schedule.name}
                  hint="Leave blank to log it as the task name."
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: "top" }}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.notes?.message}
                />
              )}
            />
          </>
        ) : null}

        {nextDuePreview ? (
          <Text className="mb-4 text-xs text-ink-dim">
            Next due {nextDuePreview} after this.
          </Text>
        ) : null}

        {completeSchedule.error ? (
          <ErrorNote message={completeSchedule.error.message} />
        ) : null}
        <Button
          title="Mark done"
          loading={completeSchedule.isPending}
          onPress={() => submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
