import { Stack, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { ItemForm } from "@/components/ItemForm";
import { Loading } from "@/components/ui";
import { useHousehold } from "@/lib/household";
import { useCreateItem } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function NewItemScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { active, isLoading } = useHousehold();
  const createItem = useCreateItem();

  if (isLoading || !active) return <Loading />;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Add item",
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
        <ItemForm
          submitLabel="Add item"
          pending={createItem.isPending}
          error={createItem.error?.message}
          onSubmit={(values) =>
            createItem.mutate(
              { ...values, household_id: active.household.id },
              {
                onSuccess: (item) => router.replace(`/items/${item.id}`),
              },
            )
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
