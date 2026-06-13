import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";

import { DateField } from "@/components/DateField";
import { Button, ErrorNote, Field } from "@/components/ui";
import type { Database, MaintenanceSchedule } from "@/lib/database.types";
import { todayISO } from "@/lib/format";
import { MONTH_NAMES, nextAnchorOccurrence } from "@/lib/schedule";
import { scheduleFormSchema, type ScheduleFormValues } from "@/lib/schemas";

type ScheduleInsert =
  Database["public"]["Tables"]["maintenance_schedules"]["Insert"];

/** What the form hands back — household/item scoping is the caller's job. */
export type ScheduleFormOutput = Pick<
  ScheduleInsert,
  "name" | "interval_months" | "anchor_month" | "next_due" | "notes"
>;

const empty = (v: string | undefined) =>
  v && v.trim() !== "" ? v.trim() : null;

export function ScheduleForm({
  initial,
  submitLabel,
  onSubmit,
  pending,
  error,
}: {
  initial?: MaintenanceSchedule;
  submitLabel: string;
  onSubmit: (values: ScheduleFormOutput) => void;
  pending: boolean;
  error?: string;
}) {
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      name: initial?.name ?? "",
      cadence: initial?.anchor_month != null ? "anchor" : "interval",
      interval_months:
        initial?.interval_months != null ? String(initial.interval_months) : "",
      anchor_month: initial?.anchor_month ?? null,
      next_due: initial?.next_due ?? todayISO(),
      notes: initial?.notes ?? "",
    },
  });

  const cadence = watch("cadence");

  const submit = handleSubmit((values) => {
    const anchor = values.cadence === "anchor" ? values.anchor_month : null;
    const next_due =
      values.cadence === "interval"
        ? values.next_due || todayISO()
        : initial && initial.anchor_month === anchor
          ? initial.next_due // unchanged anchor keeps its advanced date
          : nextAnchorOccurrence(anchor!, todayISO());
    onSubmit({
      name: values.name.trim(),
      interval_months:
        values.cadence === "interval" ? Number(values.interval_months) : null,
      anchor_month: anchor,
      next_due,
      notes: empty(values.notes),
    });
  });

  return (
    <View>
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Task"
            placeholder="e.g. Replace furnace filter"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.name?.message}
            autoFocus={!initial}
          />
        )}
      />

      <Controller
        control={control}
        name="cadence"
        render={({ field: { onChange, value } }) => (
          <View className="mb-4">
            <Text className="mb-1.5 text-sm font-medium text-ink">Repeats</Text>
            <View className="flex-row gap-2">
              {(
                [
                  { value: "interval", label: "Every N months" },
                  { value: "anchor", label: "Every year in…" },
                ] as const
              ).map((opt) => {
                const selected = value === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="button"
                    className={`flex-1 items-center rounded-xl border px-3 py-3 active:opacity-70 ${
                      selected
                        ? "border-accent bg-accent"
                        : "border-edge bg-card"
                    }`}
                    onPress={() => onChange(opt.value)}
                  >
                    <Text
                      className={
                        selected
                          ? "text-sm font-semibold text-on-accent"
                          : "text-sm text-ink"
                      }
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      />

      {cadence === "interval" ? (
        <View className="flex-row gap-3">
          <View className="w-36">
            <Controller
              control={control}
              name="interval_months"
              render={({ field: { onChange, onBlur, value } }) => (
                <Field
                  label="Months between"
                  placeholder="e.g. 3"
                  inputMode="numeric"
                  maxLength={3}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.interval_months?.message}
                />
              )}
            />
          </View>
          <View className="flex-1">
            <Controller
              control={control}
              name="next_due"
              render={({ field: { onChange, onBlur, value } }) => (
                <DateField
                  label="Next due"
                  value={value ?? ""}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={errors.next_due?.message}
                />
              )}
            />
          </View>
        </View>
      ) : (
        <Controller
          control={control}
          name="anchor_month"
          render={({ field: { onChange, value } }) => (
            <View className="mb-4">
              <Text className="mb-1.5 text-sm font-medium text-ink">Month</Text>
              <View className="flex-row flex-wrap gap-2">
                {MONTH_NAMES.map((label, i) => {
                  const month = i + 1;
                  const selected = value === month;
                  return (
                    <Pressable
                      key={label}
                      accessibilityRole="button"
                      className={`rounded-full border px-3 py-2 active:opacity-70 ${
                        selected
                          ? "border-accent bg-accent"
                          : "border-edge bg-card"
                      }`}
                      onPress={() => onChange(month)}
                    >
                      <Text
                        className={`text-sm ${
                          selected ? "font-semibold text-on-accent" : "text-ink"
                        }`}
                      >
                        {label.slice(0, 3)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {errors.anchor_month ? (
                <Text className="mt-1 text-xs text-danger">
                  {errors.anchor_month.message}
                </Text>
              ) : null}
            </View>
          )}
        />
      )}

      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Notes"
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

      {error ? <ErrorNote message={error} /> : null}

      <Button title={submitLabel} loading={pending} onPress={() => submit()} />
    </View>
  );
}
