import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { AttachmentsSection } from "@/components/AttachmentsSection";
import { LifespanBar } from "@/components/LifespanBar";
import { Button, Card, Loading, SectionTitle } from "@/components/ui";
import type { MaintenanceLog } from "@/lib/database.types";
import { formatCents, formatDate } from "@/lib/format";
import { formatYears, lifespanStatus } from "@/lib/lifespan";
import { useDeleteItem, useDeleteLog, useItem, useLogs } from "@/lib/queries";
import { usePalette } from "@/lib/theme";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { data: item, isLoading } = useItem(id);
  const { data: logs = [] } = useLogs(id);
  const deleteItem = useDeleteItem();

  if (isLoading || !item) return <Loading />;

  const status = lifespanStatus(item);
  const totalMaintenance = logs.reduce(
    (sum, log) => sum + (log.cost_cents ?? 0),
    0,
  );

  const confirmDelete = () => {
    const doDelete = () =>
      deleteItem.mutate(
        { id: item.id, household_id: item.household_id },
        { onSuccess: () => router.replace("/") },
      );
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${item.name}" and its maintenance history?`))
        doDelete();
      return;
    }
    Alert.alert("Delete item?", `"${item.name}" and its maintenance history.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  const facts: [string, string][] = [
    ["Category", `${item.category.icon} ${item.category.name}`],
    ["Location", item.location ?? "—"],
    ["Purchased", formatDate(item.purchase_date)],
    ["Price", formatCents(item.price_cents)],
    ["Vendor", item.vendor ?? "—"],
    ["Brand", item.brand ?? "—"],
    ["Model", item.model ?? "—"],
    ["Serial #", item.serial_number ?? "—"],
    ["Warranty until", formatDate(item.warranty_until)],
  ];

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 pb-16">
      <Stack.Screen
        options={{
          headerShown: true,
          title: item.name,
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.ink,
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/items/${item.id}/edit`)}
              className="active:opacity-70"
            >
              <Text style={{ color: palette.accent, fontWeight: "600" }}>
                Edit
              </Text>
            </Pressable>
          ),
        }}
      />

      {status.ratio != null ? (
        <Card className="mb-4">
          <View className="mb-2 flex-row items-baseline justify-between">
            <Text className="text-sm font-medium text-ink">
              {formatYears(status.ageYears)} into ~{status.lifespanYears} years
            </Text>
            {status.replaceBy ? (
              <Text className="text-xs text-ink-dim">
                replace ~{status.replaceBy.getFullYear()}
              </Text>
            ) : null}
          </View>
          <LifespanBar ratio={status.ratio} />
        </Card>
      ) : null}

      <Card>
        {facts
          .filter(([, value]) => value !== "—")
          .map(([label, value], i) => (
            <View
              key={label}
              className={`flex-row justify-between py-2 ${
                i > 0 ? "border-t border-edge" : ""
              }`}
            >
              <Text className="text-sm text-ink-dim">{label}</Text>
              <Text className="ml-4 flex-1 text-right text-sm text-ink">
                {value}
              </Text>
            </View>
          ))}
        {item.notes ? (
          <View className="mt-2 border-t border-edge pt-3">
            <Text className="text-sm text-ink">{item.notes}</Text>
          </View>
        ) : null}
      </Card>

      <View className="flex-row items-baseline justify-between">
        <SectionTitle>Maintenance log</SectionTitle>
        {totalMaintenance > 0 ? (
          <Text className="text-xs text-ink-dim">
            {formatCents(totalMaintenance)} total
          </Text>
        ) : null}
      </View>

      {logs.length === 0 ? (
        <Card className="mb-3">
          <Text className="text-sm text-ink-dim">
            No maintenance recorded yet.
          </Text>
        </Card>
      ) : (
        <Card className="mb-3">
          {logs.map((log, i) => (
            <LogRow key={log.id} log={log} first={i === 0} />
          ))}
        </Card>
      )}
      <Button
        title="Log maintenance"
        onPress={() => router.push(`/items/${item.id}/log`)}
      />

      <AttachmentsSection householdId={item.household_id} itemId={item.id} />

      <View className="mt-10">
        <Button
          title="Delete item"
          variant="danger"
          loading={deleteItem.isPending}
          onPress={confirmDelete}
        />
      </View>
    </ScrollView>
  );
}

function LogRow({ log, first }: { log: MaintenanceLog; first: boolean }) {
  const deleteLog = useDeleteLog();

  const confirmDelete = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Delete this maintenance entry?"))
        deleteLog.mutate(log);
      return;
    }
    Alert.alert("Delete entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteLog.mutate(log),
      },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Long-press to delete"
      onLongPress={confirmDelete}
      className={`py-2.5 ${first ? "" : "border-t border-edge"}`}
    >
      <View className="flex-row items-baseline justify-between">
        <Text className="text-sm font-medium text-ink">
          {formatDate(log.performed_on)}
        </Text>
        {log.cost_cents != null ? (
          <Text className="text-sm text-ink">{formatCents(log.cost_cents)}</Text>
        ) : null}
      </View>
      {log.performed_by ? (
        <Text className="text-xs text-ink-dim">by {log.performed_by}</Text>
      ) : null}
      {log.notes ? (
        <Text className="mt-1 text-sm text-ink-dim">{log.notes}</Text>
      ) : null}
    </Pressable>
  );
}
