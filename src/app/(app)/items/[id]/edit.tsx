import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { ItemForm } from "@/components/ItemForm";
import { Loading } from "@/components/ui";
import { useItem, useUpdateItem } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { data: item, isLoading } = useItem(id);
  const updateItem = useUpdateItem();

  if (isLoading || !item) return <Loading />;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: `Edit ${item.name}`,
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <ItemForm
          initial={item}
          submitLabel="Save changes"
          pending={updateItem.isPending}
          error={updateItem.error?.message}
          onSubmit={(values) =>
            updateItem.mutate(
              { id: item.id, ...values },
              { onSuccess: () => router.back() },
            )
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
