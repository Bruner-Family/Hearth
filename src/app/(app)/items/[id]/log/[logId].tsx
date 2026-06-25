import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";

import { LogForm } from "@/components/LogForm";
import { Button, Loading } from "@/components/ui";
import { parseDollarsToCents } from "@/lib/format";
import { useDeleteLog, useLog, useUpdateLog } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function EditLogScreen() {
  const { logId } = useLocalSearchParams<{ id: string; logId: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { data: log, isLoading } = useLog(logId);
  const updateLog = useUpdateLog();
  const deleteLog = useDeleteLog();

  if (isLoading || !log) return <Loading />;

  const confirmDelete = () => {
    const remove = () =>
      deleteLog.mutate(
        { id: log.id, item_id: log.item_id },
        { onSuccess: () => router.back() },
      );
    if (Platform.OS === "web") {
      if (window.confirm("Delete this maintenance entry?")) remove();
      return;
    }
    Alert.alert("Delete entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: remove },
    ]);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Edit entry",
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
          initial={log}
          submitLabel="Save changes"
          pending={updateLog.isPending}
          error={updateLog.error?.message}
          onSubmit={(values) =>
            updateLog.mutate(
              {
                id: log.id,
                item_id: log.item_id,
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
        <View className="mt-10">
          <Button
            title="Delete entry"
            variant="danger"
            loading={deleteLog.isPending}
            onPress={confirmDelete}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
