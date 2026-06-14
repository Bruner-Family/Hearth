import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Switch, Text, View } from "react-native";

import { Button, Card, ErrorNote, Field } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useDemo } from "@/lib/demo";
import { useHousehold } from "@/lib/household";
import {
  useNotificationSettings,
  useSendTestNotification,
  useUpsertNotificationSettings,
} from "@/lib/queries";
import {
  notificationSettingsFormSchema,
  type NotificationSettingsFormValues,
} from "@/lib/schemas";

const empty = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

export function NotificationsCard() {
  const { enabled: demo } = useDemo();
  const { active } = useHousehold();
  const { session } = useAuth();
  const householdId = active?.household.id;
  const isOwner = active?.role === "owner";
  const { data: settings } = useNotificationSettings(householdId);
  const upsert = useUpsertNotificationSettings();
  const test = useSendTestNotification();
  const [saved, setSaved] = useState(false);

  if (demo || !session) {
    return (
      <Card>
        <Text className="text-sm text-ink-dim">
          Weekly maintenance digests over Discord or Telegram are available once
          you sign in.
        </Text>
      </Card>
    );
  }

  if (!isOwner) {
    return (
      <Card>
        <Text className="text-sm text-ink-dim">
          Only the household owner can change notification settings.
        </Text>
      </Card>
    );
  }

  return (
    <NotificationsForm
      key={householdId}
      householdId={householdId!}
      initial={settings ?? undefined}
      pending={upsert.isPending}
      error={upsert.error?.message}
      saved={saved}
      onSubmit={(values) => {
        setSaved(false);
        upsert.mutate(
          {
            household_id: householdId!,
            enabled: values.enabled,
            discord_webhook_url: empty(values.discord_webhook_url),
            telegram_bot_token: empty(values.telegram_bot_token),
            telegram_chat_id: empty(values.telegram_chat_id),
            lead_time_days: Number(values.lead_time_days),
          },
          { onSuccess: () => setSaved(true) },
        );
      }}
      testState={test}
      onTest={() => test.mutate(householdId!)}
    />
  );
}

function NotificationsForm({
  householdId,
  initial,
  onSubmit,
  pending,
  error,
  saved,
  onTest,
  testState,
}: {
  householdId: string;
  initial?: {
    enabled: boolean;
    discord_webhook_url: string | null;
    telegram_bot_token: string | null;
    telegram_chat_id: string | null;
    lead_time_days: number;
  };
  onSubmit: (v: NotificationSettingsFormValues) => void;
  pending: boolean;
  error?: string;
  saved: boolean;
  onTest: () => void;
  testState: { isPending: boolean; isSuccess: boolean; error: Error | null };
}) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<NotificationSettingsFormValues>({
    resolver: zodResolver(notificationSettingsFormSchema),
    defaultValues: {
      enabled: initial?.enabled ?? true,
      discord_webhook_url: initial?.discord_webhook_url ?? "",
      telegram_bot_token: initial?.telegram_bot_token ?? "",
      telegram_chat_id: initial?.telegram_chat_id ?? "",
      lead_time_days: initial?.lead_time_days != null ? String(initial.lead_time_days) : "14",
    },
  });

  return (
    <Card>
      <Controller
        control={control}
        name="enabled"
        render={({ field: { onChange, value } }) => (
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-ink">Weekly digest</Text>
            <Switch value={value} onValueChange={onChange} />
          </View>
        )}
      />

      <Controller
        control={control}
        name="discord_webhook_url"
        render={({ field: { onChange, onBlur, value } }) => (
          <Field
            label="Discord webhook URL"
            placeholder="https://discord.com/api/webhooks/…"
            autoCapitalize="none"
            inputMode="url"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.discord_webhook_url?.message}
          />
        )}
      />

      <View className="md:flex-row md:gap-3">
        <View className="md:flex-1">
          <Controller
            control={control}
            name="telegram_bot_token"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label="Telegram bot token"
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.telegram_bot_token?.message}
              />
            )}
          />
        </View>
        <View className="md:flex-1">
          <Controller
            control={control}
            name="telegram_chat_id"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label="Telegram chat ID"
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.telegram_chat_id?.message}
              />
            )}
          />
        </View>
      </View>

      <View className="w-40">
        <Controller
          control={control}
          name="lead_time_days"
          render={({ field: { onChange, onBlur, value } }) => (
            <Field
              label="Lead time (days)"
              inputMode="numeric"
              maxLength={3}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.lead_time_days?.message}
              hint="How far ahead to include"
            />
          )}
        />
      </View>

      {error ? <ErrorNote message={error} /> : null}
      {saved ? (
        <Text className="mb-2 text-xs text-ok">Saved.</Text>
      ) : null}
      <Button title="Save" loading={pending} onPress={() => handleSubmit(onSubmit)()} />

      <View className="mt-3">
        <Button
          title="Send test notification"
          variant="secondary"
          loading={testState.isPending}
          onPress={onTest}
        />
        {testState.isSuccess ? (
          <Text className="mt-1 text-xs text-ok">Test sent — check your channel.</Text>
        ) : null}
        {testState.error ? (
          <Text className="mt-1 text-xs text-danger">{testState.error.message}</Text>
        ) : null}
        <Text className="mt-1 text-xs text-ink-dim">
          Save before testing — the test uses your saved settings.
        </Text>
      </View>
    </Card>
  );
}
