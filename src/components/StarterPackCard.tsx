import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button, Card } from "@/components/ui";
import { todayISO } from "@/lib/format";
import { useCreateSchedule } from "@/lib/queries";
import { addMonths, formatCadence, nextAnchorOccurrence } from "@/lib/schedule";
import { STARTER_PACK, starterPackDismissedKey } from "@/lib/starterPack";

/**
 * Offered once per household, until adopted or skipped (AsyncStorage flag).
 * Hidden as soon as the household has any schedule of its own.
 */
export function StarterPackCard({
  householdId,
  hasSchedules,
}: {
  householdId: string;
  hasSchedules: boolean;
}) {
  const createSchedule = useCreateSchedule();
  // null = flag not loaded yet (render nothing to avoid a flash).
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(STARTER_PACK.map((_, i) => i)),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(starterPackDismissedKey(householdId)).then((v) =>
      setDismissed(v === "1"),
    );
  }, [householdId]);

  if (hasSchedules || dismissed !== false) return null;

  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(starterPackDismissedKey(householdId), "1").catch(
      () => {},
    );
  };

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const adopt = async () => {
    setSaving(true);
    try {
      const today = todayISO();
      for (const [i, task] of STARTER_PACK.entries()) {
        if (!selected.has(i)) continue;
        await createSchedule.mutateAsync({
          household_id: householdId,
          item_id: null,
          name: task.name,
          interval_months: task.interval_months,
          anchor_month: task.anchor_month,
          // Quiet by default: interval tasks start their clock today;
          // seasonal tasks wait for their month.
          next_due:
            task.anchor_month != null
              ? nextAnchorOccurrence(task.anchor_month, today)
              : addMonths(today, task.interval_months!),
          notes: null,
        });
      }
      dismiss();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-4">
      <Text className="mb-1 text-sm font-semibold text-ink">
        🍂 Seasonal starter pack
      </Text>
      <Text className="mb-3 text-sm text-ink-dim">
        Common house tasks to get the due list going — keep the ones that fit.
      </Text>
      {STARTER_PACK.map((task, i) => {
        const on = selected.has(i);
        return (
          <Pressable
            key={task.name}
            accessibilityRole="button"
            className="flex-row items-center gap-3 py-2 active:opacity-70"
            onPress={() => toggle(i)}
          >
            <View
              className={`h-5 w-5 items-center justify-center rounded border ${
                on ? "border-accent bg-accent" : "border-edge bg-card"
              }`}
            >
              {on ? (
                <Text className="text-xs font-bold text-on-accent">✓</Text>
              ) : null}
            </View>
            <Text className="flex-1 text-sm text-ink">{task.name}</Text>
            <Text className="text-xs text-ink-dim">{formatCadence(task)}</Text>
          </Pressable>
        );
      })}
      <View className="mt-3 flex-row gap-3">
        <View className="flex-1">
          <Button title="No thanks" variant="secondary" onPress={dismiss} />
        </View>
        <View className="flex-1">
          <Button
            title={`Add ${selected.size} task${selected.size === 1 ? "" : "s"}`}
            loading={saving}
            disabled={selected.size === 0}
            onPress={() => void adopt()}
          />
        </View>
      </View>
    </Card>
  );
}
