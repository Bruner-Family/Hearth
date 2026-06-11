import { Platform, Text, View } from "react-native";

import { Field } from "@/components/ui";
import { useTheme } from "@/lib/theme";

type DateFieldProps = {
  label: string;
  /** "" or YYYY-MM-DD ("date" mode) / YYYY-MM ("month" mode). */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  /** "month" renders a year/month picker and yields YYYY-MM values. */
  mode?: "date" | "month";
};

/**
 * Date input with the browser's popup calendar on web. Browsers that don't
 * implement the input type (type="month" on desktop Firefox/Safari) degrade
 * to a text input, which the form schemas still validate. On native this
 * falls back to a plain text Field — swap in a native picker when the iOS
 * target becomes real (ADR-001).
 */
export function DateField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  mode = "date",
}: DateFieldProps) {
  const { scheme } = useTheme();
  const placeholder = mode === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  if (Platform.OS !== "web") {
    return (
      <Field
        label={label}
        placeholder={placeholder}
        inputMode="numeric"
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        error={error}
        hint={hint}
      />
    );
  }

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink">{label}</Text>
      <input
        type={mode}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`min-h-12 rounded-xl border bg-card px-4 py-3 text-base text-ink ${
          error ? "border-danger" : "border-edge"
        }`}
        style={{
          // The popup calendar and its indicator glyph follow the app theme.
          colorScheme: scheme,
          font: "inherit",
        }}
      />
      {hint && !error ? (
        <Text className="mt-1 text-xs text-ink-dim">{hint}</Text>
      ) : null}
      {error ? <Text className="mt-1 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}
