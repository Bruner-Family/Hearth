import {
  Controller,
  useFieldArray,
  type Control,
} from "react-hook-form";
import { Pressable, Text, TextInput, View } from "react-native";

import { Button, SectionTitle } from "@/components/ui";
import type { ItemFormValues } from "@/lib/schemas";
import { usePalette } from "@/lib/theme";

const inputClass =
  "min-h-12 rounded-xl border border-edge bg-card px-4 py-3 text-base text-ink";

export function ReferenceDetailsField({
  control,
}: {
  control: Control<ItemFormValues>;
}) {
  const palette = usePalette();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "reference_details",
  });

  return (
    <View>
      <SectionTitle>Reference details</SectionTitle>
      <Text className="mb-3 text-xs text-ink-dim">
        Sizes, part numbers, paint codes — the specs you need at the appliance or
        the store.
      </Text>

      {fields.map((field, index) => (
        <View key={field.id} className="mb-3 flex-row items-center gap-2">
          <View className="flex-1">
            <Controller
              control={control}
              name={`reference_details.${index}.label`}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={inputClass}
                  placeholder="Label"
                  placeholderTextColor={palette.inkDim}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  accessibilityLabel={`Reference detail ${index + 1} label`}
                />
              )}
            />
          </View>
          <View className="flex-1">
            <Controller
              control={control}
              name={`reference_details.${index}.value`}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={inputClass}
                  placeholder="Value"
                  placeholderTextColor={palette.inkDim}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  accessibilityLabel={`Reference detail ${index + 1} value`}
                />
              )}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove reference detail ${index + 1}`}
            className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
            onPress={() => remove(index)}
          >
            <Text className="text-lg text-danger">✕</Text>
          </Pressable>
        </View>
      ))}

      <Button
        title="Add detail"
        variant="secondary"
        onPress={() => append({ label: "", value: "" })}
      />
    </View>
  );
}
