import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { DateField } from "@/components/DateField";
import { Button, ErrorNote, Field } from "@/components/ui";
import { parseDollarsToCents, todayISO } from "@/lib/format";
import { useCreateLog } from "@/lib/queries";
import { logFormSchema, type LogFormValues } from "@/lib/schemas";
import { usePalette } from "@/lib/theme";

export default function NewLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const createLog = useCreateLog();

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

  const submit = handleSubmit((values) => {
    createLog.mutate(
      {
        item_id: id!,
        performed_on: values.performed_on,
        cost_cents: values.cost ? parseDollarsToCents(values.cost) : null,
        performed_by:
          values.performed_by && values.performed_by.trim() !== ""
            ? values.performed_by.trim()
            : null,
        notes:
          values.notes && values.notes.trim() !== ""
            ? values.notes.trim()
            : null,
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
          title: "Log maintenance",
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <Controller
          control={control}
          name="performed_on"
          render={({ field: { onChange, onBlur, value } }) => (
            <DateField
              label="Date performed"
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              error={errors.performed_on?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="cost"
          render={({ field: { onChange, onBlur, value } }) => (
            <Field
              label="Cost (USD)"
              placeholder="e.g. 150.00"
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
              multiline
              numberOfLines={4}
              style={{ minHeight: 96, textAlignVertical: "top" }}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.notes?.message}
            />
          )}
        />
        {createLog.error ? <ErrorNote message={createLog.error.message} /> : null}
        <Button
          title="Save entry"
          loading={createLog.isPending}
          onPress={() => submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
