import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { LogForm } from "@/components/LogForm";
import { parseDollarsToCents } from "@/lib/format";
import { useCreateLog } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function NewLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const createLog = useCreateLog();

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
        contentContainerClassName="mx-auto w-full max-w-2xl p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <LogForm
          submitLabel="Save entry"
          pending={createLog.isPending}
          error={createLog.error?.message}
          onSubmit={(values) =>
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
            )
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
