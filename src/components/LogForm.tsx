import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { DateField } from "@/components/DateField";
import { Button, ErrorNote, Field } from "@/components/ui";
import type { MaintenanceLog } from "@/lib/database.types";
import { todayISO } from "@/lib/format";
import { logFormSchema, type LogFormValues } from "@/lib/schemas";

type LogFormProps = {
  initial?: Pick<
    MaintenanceLog,
    "performed_on" | "cost_cents" | "performed_by" | "notes"
  >;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (values: LogFormValues) => void;
};

export function LogForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: LogFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LogFormValues>({
    resolver: zodResolver(logFormSchema),
    defaultValues: {
      performed_on: initial?.performed_on ?? todayISO(),
      cost:
        initial?.cost_cents != null
          ? (initial.cost_cents / 100).toFixed(2)
          : "",
      performed_by: initial?.performed_by ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const submit = handleSubmit(onSubmit);

  return (
    <>
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
      {error ? <ErrorNote message={error} /> : null}
      <Button title={submitLabel} loading={pending} onPress={() => submit()} />
    </>
  );
}
