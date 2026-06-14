// Roadmap spec v1.3 — weekly notification fan-out. Two invocation modes:
//   • Cron mode: pg_cron sends `x-cron-secret`; we fan out to every enabled
//     household over its configured webhooks. Empty digest → nothing sent.
//   • Test mode: an owner's request (verified JWT) sends a one-off test
//     message to that household's webhooks so they can confirm the config.
// verify_jwt is off (config.toml); this handler does its own auth.

import { createClient } from "npm:@supabase/supabase-js@2";

import { discordBody, formatDigest, telegramBody, type DigestRow } from "./format.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

type Settings = {
  household_id: string;
  enabled: boolean;
  discord_webhook_url: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  lead_time_days: number;
};

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendToChannels(s: Settings, text: string): Promise<void> {
  const posts: Promise<unknown>[] = [];
  if (s.discord_webhook_url) {
    posts.push(
      fetch(s.discord_webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: discordBody(text),
      }),
    );
  }
  if (s.telegram_bot_token && s.telegram_chat_id) {
    posts.push(
      fetch(`https://api.telegram.org/bot${s.telegram_bot_token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: telegramBody(s.telegram_chat_id, text),
      }),
    );
  }
  await Promise.allSettled(posts);
}

async function digestText(db: ReturnType<typeof admin>, s: Settings): Promise<string> {
  const { data, error } = await db.rpc("notifications_digest", {
    p_household: s.household_id,
    p_lead_days: s.lead_time_days,
  });
  if (error) throw error;
  const { data: hh } = await db
    .from("households").select("name").eq("id", s.household_id).single();
  return formatDigest(hh?.name ?? "Your home", (data ?? []) as DigestRow[]);
}

Deno.serve(async (req) => {
  const db = admin();
  const cronSecret = req.headers.get("x-cron-secret");

  // ---- Cron mode --------------------------------------------------------
  if (cronSecret !== null) {
    if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const { data: rows, error } = await db
      .from("notification_settings").select("*").eq("enabled", true);
    if (error) {
      console.error("notify: failed to read notification_settings", error);
      return new Response("internal error", { status: 500 });
    }
    let sent = 0;
    let failed = 0;
    // Isolate each household: one bad row (RPC error, missing parent, dead
    // webhook) must not abort the weekly fan-out for everyone after it.
    for (const s of (rows ?? []) as Settings[]) {
      try {
        const text = await digestText(db, s);
        if (!text) continue; // quiet by design
        await sendToChannels(s, text);
        sent += 1;
      } catch (e) {
        failed += 1;
        console.error(`notify: digest failed for household ${s.household_id}`, e);
      }
    }
    return Response.json({ ok: true, households: (rows ?? []).length, sent, failed });
  }

  // ---- Test mode (owner-verified) ---------------------------------------
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return new Response("unauthorized", { status: 401 });
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData.user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const householdId: string | undefined = body.household_id;
  if (!householdId) return new Response("household_id required", { status: 400 });

  const { data: owns } = await db
    .from("household_members")
    .select("household_id")
    .eq("user_id", userData.user.id)
    .eq("household_id", householdId)
    .eq("role", "owner")
    .maybeSingle();
  if (!owns) return new Response("forbidden", { status: 403 });

  const { data: s } = await db
    .from("notification_settings").select("*").eq("household_id", householdId).single();
  if (!s) return new Response("no settings", { status: 404 });

  await sendToChannels(s as Settings, "✅ Hearth test — your notifications are wired up.");
  return Response.json({ ok: true });
});
