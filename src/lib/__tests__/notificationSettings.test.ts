import { describe, expect, it } from "vitest";

import { notificationSettingsFormSchema } from "@/lib/schemas";

const base = {
  enabled: true,
  discord_webhook_url: "https://discord.com/api/webhooks/1/abc",
  telegram_bot_token: "",
  telegram_chat_id: "",
  lead_time_days: "14",
};

describe("notificationSettingsFormSchema", () => {
  it("accepts a Discord-only config", () => {
    expect(notificationSettingsFormSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a Telegram-only config (token + chat id)", () => {
    const r = notificationSettingsFormSchema.safeParse({
      ...base,
      discord_webhook_url: "",
      telegram_bot_token: "123:abc",
      telegram_chat_id: "456",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an enabled config with no channel", () => {
    const r = notificationSettingsFormSchema.safeParse({
      ...base,
      discord_webhook_url: "",
    });
    expect(r.success).toBe(false);
  });

  it("allows a disabled config with no channel", () => {
    const r = notificationSettingsFormSchema.safeParse({
      ...base,
      enabled: false,
      discord_webhook_url: "",
    });
    expect(r.success).toBe(true);
  });

  it("requires both telegram fields together", () => {
    const r = notificationSettingsFormSchema.safeParse({
      ...base,
      discord_webhook_url: "",
      telegram_bot_token: "123:abc",
      telegram_chat_id: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-URL discord webhook", () => {
    expect(
      notificationSettingsFormSchema.safeParse({ ...base, discord_webhook_url: "not-a-url" }).success,
    ).toBe(false);
  });

  it("rejects lead time outside 1–90", () => {
    expect(notificationSettingsFormSchema.safeParse({ ...base, lead_time_days: "0" }).success).toBe(false);
    expect(notificationSettingsFormSchema.safeParse({ ...base, lead_time_days: "91" }).success).toBe(false);
  });
});
