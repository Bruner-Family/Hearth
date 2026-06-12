import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";

import { DateField } from "@/components/DateField";
import { Button, ErrorNote, Field, SectionTitle } from "@/components/ui";
import type { Database, ItemWithCategory } from "@/lib/database.types";
import {
  combinePurchaseDate,
  parseDollarsToCents,
  splitPurchaseDate,
} from "@/lib/format";
import { useCategories } from "@/lib/queries";
import { itemFormSchema, type ItemFormValues } from "@/lib/schemas";

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];

const empty = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

export function ItemForm({
  initial,
  submitLabel,
  onSubmit,
  pending,
  error,
}: {
  initial?: ItemWithCategory;
  submitLabel: string;
  onSubmit: (values: Omit<ItemInsert, "household_id">) => void;
  pending: boolean;
  error?: string;
}) {
  const { data: categories = [] } = useCategories();
  const initialPurchase = splitPurchaseDate(
    initial?.purchase_date,
    initial?.purchase_date_precision,
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      name: initial?.name ?? "",
      category_id: initial?.category_id ?? "",
      location: initial?.location ?? "",
      purchase_month: initialPurchase.month,
      purchase_day: initialPurchase.day,
      price:
        initial?.price_cents != null
          ? (initial.price_cents / 100).toFixed(2)
          : "",
      vendor: initial?.vendor ?? "",
      brand: initial?.brand ?? "",
      model: initial?.model ?? "",
      serial_number: initial?.serial_number ?? "",
      warranty_until: initial?.warranty_until ?? "",
      lifespan_years_override:
        initial?.lifespan_years_override != null
          ? String(initial.lifespan_years_override)
          : "",
      notes: initial?.notes ?? "",
    },
  });

  const submit = handleSubmit((values) => {
    onSubmit({
      category_id: values.category_id,
      name: values.name.trim(),
      location: empty(values.location),
      ...combinePurchaseDate(values.purchase_month, values.purchase_day),
      price_cents: values.price ? parseDollarsToCents(values.price) : null,
      vendor: empty(values.vendor),
      brand: empty(values.brand),
      model: empty(values.model),
      serial_number: empty(values.serial_number),
      warranty_until: empty(values.warranty_until),
      lifespan_years_override: values.lifespan_years_override
        ? Number(values.lifespan_years_override)
        : null,
      notes: empty(values.notes),
    });
  });

  const selectedCategory = (id: string) =>
    categories.find((c) => c.id === id);

  return (
    <View>
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Name"
            placeholder="e.g. Water heater"
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
        name="category_id"
        render={({ field: { onChange, value } }) => (
          <View className="mb-4">
            <Text className="mb-1.5 text-sm font-medium text-ink">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {categories.map((cat) => {
                const selected = value === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    accessibilityRole="button"
                    className={`rounded-full border px-3 py-2 active:opacity-70 ${
                      selected
                        ? "border-accent bg-accent"
                        : "border-edge bg-card"
                    }`}
                    onPress={() => onChange(cat.id)}
                  >
                    <Text
                      className={`text-sm ${
                        selected ? "font-semibold text-on-accent" : "text-ink"
                      }`}
                    >
                      {cat.icon} {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.category_id ? (
              <Text className="mt-1 text-xs text-danger">
                {errors.category_id.message}
              </Text>
            ) : null}
            {selectedCategory(value)?.default_lifespan_years != null ? (
              <Text className="mt-1 text-xs text-ink-dim">
                Suggested lifespan:{" "}
                {selectedCategory(value)!.default_lifespan_years} years
              </Text>
            ) : null}
          </View>
        )}
      />

      <Controller
        control={control}
        name="location"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Location in home"
            placeholder="e.g. Kitchen, Attic"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.location?.message}
          />
        )}
      />

      <SectionTitle>Purchase</SectionTitle>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Controller
            control={control}
            name="purchase_month"
            render={({ field: { onChange, onBlur, value } }) => (
              <DateField
                mode="month"
                label="Purchase month"
                value={value ?? ""}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.purchase_month?.message}
              />
            )}
          />
        </View>
        <View className="w-28">
          <Controller
            control={control}
            name="purchase_day"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label="Day"
                placeholder="—"
                inputMode="numeric"
                maxLength={2}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.purchase_day?.message}
                hint="Optional"
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="price"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Price (USD)"
            placeholder="e.g. 1299.00"
            inputMode="decimal"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.price?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="vendor"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Vendor"
            placeholder="Where it came from"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.vendor?.message}
          />
        )}
      />

      <SectionTitle>Details</SectionTitle>

      <View className="md:flex-row md:gap-3">
        <View className="md:flex-1">
          <Controller
            control={control}
            name="brand"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label="Brand"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.brand?.message}
              />
            )}
          />
        </View>
        <View className="md:flex-1">
          <Controller
            control={control}
            name="model"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label="Model"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.model?.message}
              />
            )}
          />
        </View>
      </View>

      <View className="md:flex-row md:gap-3">
        <View className="md:flex-1">
          <Controller
            control={control}
            name="serial_number"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label="Serial number"
                autoCapitalize="characters"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.serial_number?.message}
              />
            )}
          />
        </View>
        <View className="md:flex-1">
          <Controller
            control={control}
            name="warranty_until"
            render={({ field: { onChange, onBlur, value } }) => (
              <DateField
                label="Warranty until"
                value={value ?? ""}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.warranty_until?.message}
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="lifespan_years_override"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Expected lifespan override (years)"
            placeholder="Leave blank to use the category default"
            inputMode="decimal"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.lifespan_years_override?.message}
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
    </View>
  );
}
