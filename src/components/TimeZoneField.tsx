import { Platform, Pressable, Text, View } from "react-native";

import { Field } from "@/components/ui";
import { deviceTimeZone, supportedTimeZones } from "@/lib/timeZones";
import { useTheme } from "@/lib/theme";

// The IANA list cannot change during a session, so it is built once instead of
// on every keystroke in the combobox.
const TIME_ZONE_OPTIONS = supportedTimeZones();

export function TimeZoneField({
  value,
  onChange,
  onBlur,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
}) {
  const { scheme } = useTheme();

  if (Platform.OS === "web") {
    return (
      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink">Time zone</Text>
        <input
          list="hearth-time-zones"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={onBlur}
          className={`min-h-12 rounded-xl border bg-card px-4 py-3 text-base text-ink ${
            error ? "border-danger" : "border-edge"
          }`}
          style={{ colorScheme: scheme, font: "inherit" }}
        />
        <datalist id="hearth-time-zones">
          {TIME_ZONE_OPTIONS.map((timeZone) => (
            <option key={timeZone} value={timeZone} />
          ))}
        </datalist>
        {error ? (
          <Text className="mt-1 text-xs text-danger">{error}</Text>
        ) : (
          <Text className="mt-1 text-xs text-ink-dim">
            IANA time zone used for schedule due dates.
          </Text>
        )}
      </View>
    );
  }

  const device = deviceTimeZone();
  return (
    <View>
      <Field
        label="Time zone"
        value={value}
        autoCapitalize="none"
        onChangeText={onChange}
        onBlur={onBlur}
        error={error}
        hint="IANA name, for example America/Chicago"
      />
      <View className="mb-4 flex-row gap-2">
        {[...new Set([device, "UTC"])].map((timeZone) => (
          <Pressable
            key={timeZone}
            accessibilityRole="button"
            className="rounded-lg border border-edge px-3 py-2 active:opacity-70"
            onPress={() => onChange(timeZone)}
          >
            <Text className="text-xs text-ink">{timeZone}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
