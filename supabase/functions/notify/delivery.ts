export type NotificationChannel = "discord" | "telegram";

export type DeliverySettings = {
  discord_webhook_url: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
};

export type DeliveryResult = {
  delivered: boolean;
  httpStatus: number | null;
  errorCode:
    | "network"
    | "timeout"
    | "rate_limited"
    | "client"
    | "server"
    | "authorization"
    | "configuration"
    | null;
  error: string | null;
  retryable: boolean;
};

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export function discordBody(text: string): string {
  return JSON.stringify({ content: text });
}

export function telegramBody(chatId: string, text: string): string {
  return JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true });
}

function failed(
  errorCode: NonNullable<DeliveryResult["errorCode"]>,
  error: string,
  retryable: boolean,
  httpStatus: number | null = null,
): DeliveryResult {
  return { delivered: false, httpStatus, errorCode, error, retryable };
}

export async function deliverMessage(
  channel: NotificationChannel,
  settings: DeliverySettings,
  text: string,
  fetcher: Fetcher = fetch,
  timeoutMs = 10_000,
): Promise<DeliveryResult> {
  let url: string;
  let body: string;

  if (channel === "discord") {
    if (!settings.discord_webhook_url) {
      return failed("configuration", "Discord webhook is not configured", false);
    }
    url = settings.discord_webhook_url;
    body = discordBody(text);
  } else {
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
      return failed("configuration", "Telegram is not fully configured", false);
    }
    url = `https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`;
    body = telegramBody(settings.telegram_chat_id, text);
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error("delivery-timeout"));
        }, timeoutMs);
      }),
    ]);

    if (response.ok) {
      return {
        delivered: true,
        httpStatus: response.status,
        errorCode: null,
        error: null,
        retryable: false,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return failed(
        "authorization",
        `Provider rejected authorization with HTTP ${response.status}`,
        false,
        response.status,
      );
    }
    if (response.status === 404) {
      return failed(
        "configuration",
        "Provider endpoint was not found",
        false,
        response.status,
      );
    }
    if (response.status === 408) {
      return failed("timeout", "Provider returned HTTP 408", true, response.status);
    }
    if (response.status === 429) {
      return failed(
        "rate_limited",
        "Provider rate limit reached",
        true,
        response.status,
      );
    }
    if (response.status >= 500) {
      return failed(
        "server",
        `Provider returned HTTP ${response.status}`,
        true,
        response.status,
      );
    }
    return failed(
      "client",
      `Provider rejected the request with HTTP ${response.status}`,
      false,
      response.status,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "delivery-timeout") {
      return failed("timeout", "Provider request timed out", true);
    }
    return failed("network", "Provider request failed", true);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
