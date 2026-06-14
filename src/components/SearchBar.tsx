import { Pressable, Text, TextInput, View } from "react-native";

import { usePalette } from "@/lib/theme";

export function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const palette = usePalette();
  return (
    <View className="flex-row items-center rounded-xl border border-edge bg-card px-3">
      <Text className="text-base text-ink-dim">🔍</Text>
      <TextInput
        className="min-h-12 flex-1 px-2 py-3 text-base text-ink"
        placeholder="Search name, brand, serial, location…"
        placeholderTextColor={palette.inkDim}
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={onChange}
        accessibilityLabel="Search items"
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
          onPress={() => onChange("")}
        >
          <Text className="text-lg text-ink-dim">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
