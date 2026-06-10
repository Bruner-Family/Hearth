import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
} from "react-native";

import { usePalette } from "@/lib/theme";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`rounded-2xl border border-edge bg-card p-4 ${className}`}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-ink-dim">
      {children}
    </Text>
  );
}

type ButtonProps = PressableProps & {
  title: string;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
};

export function Button({
  title,
  variant = "primary",
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const palette = usePalette();
  const base =
    "min-h-12 items-center justify-center rounded-xl px-5 py-3 active:opacity-80";
  const styles = {
    primary: "bg-accent",
    secondary: "border border-edge bg-card",
    danger: "bg-danger",
  }[variant];
  const textStyles = {
    primary: "text-on-accent",
    secondary: "text-ink",
    danger: "text-white",
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      className={`${base} ${styles} ${disabled || loading ? "opacity-50" : ""}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "secondary" ? palette.ink : palette.onAccent}
        />
      ) : (
        <Text className={`text-base font-semibold ${textStyles}`}>{title}</Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
};

export function Field({ label, error, hint, ...props }: FieldProps) {
  const palette = usePalette();
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-ink">{label}</Text>
      <TextInput
        className={`min-h-12 rounded-xl border bg-card px-4 py-3 text-base text-ink ${
          error ? "border-danger" : "border-edge"
        }`}
        placeholderTextColor={palette.inkDim}
        {...props}
      />
      {hint && !error ? (
        <Text className="mt-1 text-xs text-ink-dim">{hint}</Text>
      ) : null}
      {error ? <Text className="mt-1 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body?: string;
}) {
  return (
    <View className="items-center px-8 py-16">
      <Text className="mb-3 text-5xl">{icon}</Text>
      <Text className="mb-1 text-center text-lg font-semibold text-ink">
        {title}
      </Text>
      {body ? (
        <Text className="text-center text-sm text-ink-dim">{body}</Text>
      ) : null}
    </View>
  );
}

export function Loading() {
  const palette = usePalette();
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <ActivityIndicator size="large" color={palette.accent} />
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View className="my-2 rounded-xl border border-danger/40 bg-danger/10 p-3">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  );
}
