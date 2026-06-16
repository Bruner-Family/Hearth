import { Pressable, Text, View } from "react-native";

import { Field } from "@/components/ui";

const EMOJI_CHOICES: string[] = [
  "🔧", "🔨", "🪛", "🔩", "🪚", "🪜",
  "🧰", "🔌", "🔋", "💡", "🚿", "🛁",
  "🚽", "🚪", "🪟", "🪑", "🛋️", "🛏️",
  "🚰", "🧯", "🧹", "🧺", "🧴", "🌡️",
  "❄️", "🔥", "💧", "🌳", "🪴", "🌱",
  "🚗", "🚲", "🛞", "📡", "🖥️", "🖨️",
];

export function EmojiPickerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink">Icon</Text>

      <View className="flex-row flex-wrap gap-2">
        {/* Default chip — clears back to category icon */}
        <Pressable
          accessibilityRole="button"
          className={`rounded-full border px-3 py-2 active:opacity-70 ${
            value === ""
              ? "border-accent bg-accent"
              : "border-edge bg-card"
          }`}
          onPress={() => onChange("")}
        >
          <Text
            className={`text-lg ${
              value === "" ? "font-semibold text-on-accent" : "text-ink"
            }`}
          >
            📦
          </Text>
        </Pressable>

        {EMOJI_CHOICES.map((emoji) => {
          const selected = value === emoji;
          return (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              className={`rounded-full border px-3 py-2 active:opacity-70 ${
                selected
                  ? "border-accent bg-accent"
                  : "border-edge bg-card"
              }`}
              onPress={() => onChange(emoji)}
            >
              <Text
                className={`text-lg ${
                  selected ? "font-semibold text-on-accent" : "text-ink"
                }`}
              >
                {emoji}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-3">
        <Field
          label="Or type any emoji"
          placeholder="Paste or type an emoji…"
          value={value}
          onChangeText={onChange}
          maxLength={32}
          hint="Any emoji works — the grid highlights it if it's in the list above."
        />
      </View>
    </View>
  );
}
