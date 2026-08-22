import { createClient } from "npm:@supabase/supabase-js@2";

import {
  deliverMessage,
  type DeliveryResult,
  type NotificationChannel,
} from "./delivery.ts";
import {
  formatDigest,
  formatScheduleReminderMessages,
  type DigestRow,
  type ScheduleReminderRow,
} from "./format.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") || undefined;

type Settings = {
  household_id: string;
  enabled: boolean;
  discord_webhook_url: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  lead_time_days: number;
  weekly_digest_enabled: boolean;
  discord_error: string | null;
  telegram_error: string | null;
};

type Claim = ScheduleReminderRow & {
  delivery_id: string;
  household_id: string;
  household_name: string;
  channel: NotificationChannel;
  slot_at: string;
  attempt_count: number;
};

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AdminClient = ReturnType<typeof admin>;

function configuredChannels(
  settings: Settings,
  includeErrored = false,
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (
    settings.discord_webhook_url &&
    (includeErrored || !settings.discord_error)
  ) {
    channels.push("discord");
  }
  if (
    settings.telegram_bot_token &&
    settings.telegram_chat_id &&
    (includeErrored || !settings.telegram_error)
  ) {
    channels.push("telegram");
  }
  return channels;
}

async function setChannelError(
  db: AdminClient,
  householdId: string,
  channel: NotificationChannel,
  result: DeliveryResult,
) {
  if (result.retryable) return;
  const values =
    channel === "discord"
      ? { discord_error: result.delivered ? null : result.error }
      : { telegram_error: result.delivered ? null : result.error };
  const { error } = await db
    .from("notification_settings")
    .update(values)
    .eq("household_id", householdId);
  if (error) throw error;
}

async function digestText(db: AdminClient, settings: Settings): Promise<string> {
  const { data, error } = await db.rpc("notifications_digest", {
    p_household: settings.household_id,
    p_lead_days: settings.lead_time_days,
  });
  if (error) throw error;
  const { data: household } = await db
    .from("households")
    .select("name")
    .eq("id", settings.household_id)
    .single();
  return formatDigest(
    household?.name ?? "Your home",
    (data ?? []) as DigestRow[],
  );
}

async function runWeeklyDigest(db: AdminClient) {
  const { data, error } = await db
    .from("notification_settings")
    .select("*")
    .eq("enabled", true)
    .eq("weekly_digest_enabled", true);
  if (error) throw error;

  let delivered = 0;
  let failed = 0;
  for (const settings of (data ?? []) as Settings[]) {
    try {
      const text = await digestText(db, settings);
      if (!text) continue;
      for (const channel of configuredChannels(settings)) {
        const result = await deliverMessage(channel, settings, text);
        await setChannelError(db, settings.household_id, channel, result);
        if (result.delivered) delivered += 1;
        else failed += 1;
      }
    } catch (caught) {
      failed += 1;
      console.error(
        `notify: weekly digest failed for household ${settings.household_id}`,
        caught,
      );
    }
  }
  return { households: (data ?? []).length, delivered, failed };
}

async function recordResult(
  db: AdminClient,
  claim: Claim,
  result: DeliveryResult,
) {
  const { error } = await db.rpc("record_schedule_notification_result", {
    p_delivery_id: claim.delivery_id,
    p_delivered: result.delivered,
    p_error_code: result.errorCode,
    p_error: result.error,
    p_http_status: result.httpStatus,
    p_retryable: result.retryable,
  });
  if (error) throw error;
}

async function failClaims(
  db: AdminClient,
  claims: Claim[],
  message: string,
) {
  const result: DeliveryResult = {
    delivered: false,
    httpStatus: null,
    errorCode: "network",
    error: message,
    retryable: true,
  };
  await Promise.all(claims.map((claim) => recordResult(db, claim, result)));
}

async function sendClaimGroup(db: AdminClient, claims: Claim[]) {
  const verdicts = await Promise.all(
    claims.map(async (claim) => {
      const { data, error } = await db.rpc(
        "revalidate_schedule_notification_claim",
        { p_delivery_id: claim.delivery_id },
      );
      return { claim, valid: !error && !!data, errored: !!error };
    }),
  );
  const active = verdicts.filter((v) => v.valid).map((v) => v.claim);
  const errored = verdicts.filter((v) => v.errored).map((v) => v.claim);
  const cancelled = claims.length - active.length - errored.length;
  if (errored.length > 0) {
    await failClaims(db, errored, "Claim revalidation failed");
  }
  if (active.length === 0) {
    return { delivered: 0, failed: errored.length, cancelled };
  }

  const first = active[0];
  const { data: settings, error } = await db
    .from("notification_settings")
    .select("*")
    .eq("household_id", first.household_id)
    .single();
  if (error || !settings) {
    await failClaims(db, active, "Notification settings could not be read");
    return { delivered: 0, failed: errored.length + active.length, cancelled };
  }

  const messages = formatScheduleReminderMessages(
    first.household_name,
    active,
    APP_URL,
  );
  let delivered = 0;
  let failed = errored.length;
  for (const message of messages) {
    const result = await deliverMessage(
      first.channel,
      settings as Settings,
      message.text,
    );
    await Promise.all(
      message.rows.map((claim) => recordResult(db, claim, result)),
    );
    if (result.delivered) delivered += message.rows.length;
    else failed += message.rows.length;
  }
  return { delivered, failed, cancelled };
}

async function runScheduleReminders(db: AdminClient) {
  const { data, error } = await db.rpc("claim_schedule_notification_deliveries", {
    p_batch_size: 100,
  });
  if (error) throw error;
  const claims = (data ?? []) as Claim[];
  const groups = new Map<string, Claim[]>();
  for (const claim of claims) {
    const key = `${claim.household_id}:${claim.channel}`;
    const group = groups.get(key);
    if (group) group.push(claim);
    else groups.set(key, [claim]);
  }

  const results = await Promise.all(
    [...groups.values()].map(async (group) => {
      try {
        return await sendClaimGroup(db, group);
      } catch (caught) {
        console.error(
          `notify: schedule reminders failed for household ${group[0].household_id}`,
          caught,
        );
        await failClaims(db, group, "Reminder group processing failed");
        return { delivered: 0, failed: group.length, cancelled: 0 };
      }
    }),
  );

  return results.reduce<{
    claims: number;
    groups: number;
    delivered: number;
    failed: number;
    cancelled: number;
  }>(
    (total, result) => ({
      claims: total.claims,
      groups: total.groups,
      delivered: total.delivered + result.delivered,
      failed: total.failed + result.failed,
      cancelled: total.cancelled + result.cancelled,
    }),
    {
      claims: claims.length,
      groups: groups.size,
      delivered: 0,
      failed: 0,
      cancelled: 0,
    },
  );
}

Deno.serve(async (request) => {
  const db = admin();
  const cronSecret = request.headers.get("x-cron-secret");

  if (cronSecret !== null) {
    if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const mode = body.mode ?? "weekly-digest";
    try {
      if (mode === "weekly-digest") {
        return Response.json({ ok: true, mode, ...(await runWeeklyDigest(db)) });
      }
      if (mode === "schedule-reminders") {
        return Response.json({ ok: true, mode, ...(await runScheduleReminders(db)) });
      }
      return new Response("unknown cron mode", { status: 400 });
    } catch (caught) {
      console.error(`notify: ${mode} failed`, caught);
      return new Response("internal error", { status: 500 });
    }
  }

  const token = (request.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return new Response("unauthorized", { status: 401 });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const householdId: string | undefined = body.household_id;
  if (!householdId) return new Response("household_id required", { status: 400 });

  const { data: ownership } = await db
    .from("household_members")
    .select("household_id")
    .eq("user_id", userData.user.id)
    .eq("household_id", householdId)
    .eq("role", "owner")
    .maybeSingle();
  if (!ownership) return new Response("forbidden", { status: 403 });

  const { data: settings } = await db
    .from("notification_settings")
    .select("*")
    .eq("household_id", householdId)
    .single();
  if (!settings) return new Response("no settings", { status: 404 });

  const channels = configuredChannels(settings as Settings, true);
  if (channels.length === 0) {
    return new Response("no configured channels", { status: 400 });
  }
  const results = await Promise.all(
    channels.map(async (channel) => {
      const result = await deliverMessage(
        channel,
        settings as Settings,
        "Hearth test: your notifications are wired up.",
      );
      await setChannelError(db, householdId, channel, result);
      return { channel, ...result };
    }),
  );
  const ok = results.every((result) => result.delivered);
  return Response.json({ ok, results }, { status: ok ? 200 : 502 });
});
