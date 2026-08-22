import { describe, expect, it, vi } from "vitest";

import { deliverMessage } from "../../../supabase/functions/notify/delivery";

const settings = {
  discord_webhook_url: "https://discord.example/webhook",
  telegram_bot_token: "token",
  telegram_chat_id: "chat",
};

const response = (status: number) => new Response(null, { status });

describe("deliverMessage", () => {
  it("counts an accepted HTTP response as delivered", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(204));
    const result = await deliverMessage("discord", settings, "hello", fetcher);
    expect(result).toMatchObject({ delivered: true, httpStatus: 204 });
  });

  it("classifies rate limits and server errors as retryable", async () => {
    const rateLimited = await deliverMessage(
      "discord",
      settings,
      "hello",
      vi.fn().mockResolvedValue(response(429)),
    );
    const serverError = await deliverMessage(
      "discord",
      settings,
      "hello",
      vi.fn().mockResolvedValue(response(503)),
    );
    expect(rateLimited).toMatchObject({ errorCode: "rate_limited", retryable: true });
    expect(serverError).toMatchObject({ errorCode: "server", retryable: true });
  });

  it("classifies authorization and client errors as permanent", async () => {
    const authorization = await deliverMessage(
      "telegram",
      settings,
      "hello",
      vi.fn().mockResolvedValue(response(401)),
    );
    const clientError = await deliverMessage(
      "telegram",
      settings,
      "hello",
      vi.fn().mockResolvedValue(response(422)),
    );
    expect(authorization).toMatchObject({
      errorCode: "authorization",
      retryable: false,
    });
    expect(clientError).toMatchObject({ errorCode: "client", retryable: false });
  });

  it("distinguishes network failures from timeouts", async () => {
    const network = await deliverMessage(
      "discord",
      settings,
      "hello",
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    const timeout = await deliverMessage(
      "discord",
      settings,
      "hello",
      () => new Promise<Response>(() => {}),
      1,
    );
    expect(network.errorCode).toBe("network");
    expect(timeout.errorCode).toBe("timeout");
  });

  it("keeps channel results independent", async () => {
    const [discord, telegram] = await Promise.all([
      deliverMessage(
        "discord",
        settings,
        "hello",
        vi.fn().mockResolvedValue(response(204)),
      ),
      deliverMessage(
        "telegram",
        settings,
        "hello",
        vi.fn().mockResolvedValue(response(500)),
      ),
    ]);
    expect(discord.delivered).toBe(true);
    expect(telegram).toMatchObject({ delivered: false, errorCode: "server" });
  });
});
