"use client";

import { AlertWebhookConfig } from "./webhook-dispatcher";

export const WEBHOOKS_STORAGE_KEY = "mochex:alert_webhooks";

/**
 * Loads cached webhook configuration synchronously from localStorage
 */
export function loadClientWebhooks(): AlertWebhookConfig {
  if (typeof window === "undefined") {
    return {
      discordWebhookUrl: "",
      discordEnabled: false,
      telegramBotToken: "",
      telegramChatId: "",
      telegramEnabled: false,
    };
  }
  try {
    const raw = localStorage.getItem(WEBHOOKS_STORAGE_KEY);
    if (!raw) {
      return {
        discordWebhookUrl: "",
        discordEnabled: false,
        telegramBotToken: "",
        telegramChatId: "",
        telegramEnabled: false,
      };
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        discordWebhookUrl: parsed.discordWebhookUrl || "",
        discordEnabled: Boolean(parsed.discordEnabled && parsed.discordWebhookUrl),
        telegramBotToken: parsed.telegramBotToken || "",
        telegramChatId: parsed.telegramChatId || "",
        telegramEnabled: Boolean(
          parsed.telegramEnabled && parsed.telegramBotToken && parsed.telegramChatId
        ),
        tradingWebhook: parsed.tradingWebhook
          ? {
              enabled: Boolean(parsed.tradingWebhook.enabled && parsed.tradingWebhook.webhookUrl),
              platform: parsed.tradingWebhook.platform || "3commas",
              webhookUrl: parsed.tradingWebhook.webhookUrl || "",
              secretToken: parsed.tradingWebhook.secretToken || "",
              botId: parsed.tradingWebhook.botId || "",
              customTemplate: parsed.tradingWebhook.customTemplate || "",
            }
          : undefined,
      };
    }
  } catch {}
  return {
    discordWebhookUrl: "",
    discordEnabled: false,
    telegramBotToken: "",
    telegramChatId: "",
    telegramEnabled: false,
  };
}

/**
 * Persists webhook configuration to localStorage and emits update event
 */
export function saveClientWebhooks(config: AlertWebhookConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WEBHOOKS_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("mochex:webhooks-updated", { detail: config }));
  } catch {}
}

/**
 * Non-destructively merges local client webhooks with server webhooks.
 * Crucial rule: If the server returns empty values (e.g. cold start, unauthenticated session,
 * or partial config), valid locally cached credentials are NEVER wiped out.
 */
export function mergeClientAndServerWebhooks(
  local: AlertWebhookConfig,
  server: AlertWebhookConfig | null | undefined
): AlertWebhookConfig {
  if (!server || typeof server !== "object") {
    return { ...local };
  }

  // Resolve Discord: prefer whichever has a valid non-empty URL
  const serverHasDiscord = Boolean(server.discordWebhookUrl && server.discordWebhookUrl.trim().length > 0);
  const localHasDiscord = Boolean(local.discordWebhookUrl && local.discordWebhookUrl.trim().length > 0);

  let discordWebhookUrl = "";
  let discordEnabled = false;

  if (serverHasDiscord) {
    discordWebhookUrl = server.discordWebhookUrl!.trim();
    discordEnabled = server.discordEnabled ?? true;
  } else if (localHasDiscord) {
    discordWebhookUrl = local.discordWebhookUrl!.trim();
    discordEnabled = local.discordEnabled ?? true;
  }

  // Resolve Telegram: prefer whichever has bot token and chat ID
  const serverHasTelegram = Boolean(
    server.telegramBotToken &&
      server.telegramBotToken.trim().length > 0 &&
      server.telegramChatId &&
      server.telegramChatId.trim().length > 0
  );
  const localHasTelegram = Boolean(
    local.telegramBotToken &&
      local.telegramBotToken.trim().length > 0 &&
      local.telegramChatId &&
      local.telegramChatId.trim().length > 0
  );

  let telegramBotToken = "";
  let telegramChatId = "";
  let telegramEnabled = false;

  if (serverHasTelegram) {
    telegramBotToken = server.telegramBotToken!.trim();
    telegramChatId = server.telegramChatId!.trim();
    telegramEnabled = server.telegramEnabled ?? true;
  } else if (localHasTelegram) {
    telegramBotToken = local.telegramBotToken!.trim();
    telegramChatId = local.telegramChatId!.trim();
    telegramEnabled = local.telegramEnabled ?? true;
  }

  // Resolve Trading Webhook
  const serverHasTrading = Boolean(
    server.tradingWebhook &&
      server.tradingWebhook.webhookUrl &&
      server.tradingWebhook.webhookUrl.trim().length > 0
  );
  const localHasTrading = Boolean(
    local.tradingWebhook &&
      local.tradingWebhook.webhookUrl &&
      local.tradingWebhook.webhookUrl.trim().length > 0
  );

  let tradingWebhook = undefined;
  if (serverHasTrading) {
    tradingWebhook = { ...server.tradingWebhook! };
  } else if (localHasTrading) {
    tradingWebhook = { ...local.tradingWebhook! };
  }

  return {
    discordWebhookUrl,
    discordEnabled: Boolean(discordEnabled && discordWebhookUrl),
    telegramBotToken,
    telegramChatId,
    telegramEnabled: Boolean(telegramEnabled && telegramBotToken && telegramChatId),
    tradingWebhook,
  };
}

/**
 * Full synchronization lifecycle:
 * 1. Loads local cache immediately.
 * 2. Fetches server webhooks in the background.
 * 3. Merges non-destructively.
 * 4. Saves merged result back to localStorage.
 * 5. If local had credentials that server lacked, automatically back-fills to server.
 */
export async function syncWebhooks(): Promise<AlertWebhookConfig> {
  const local = loadClientWebhooks();

  try {
    const res = await fetch("/api/alerts/webhooks");
    if (res.ok) {
      const data = await res.json();
      const serverConfig = data?.config;
      const merged = mergeClientAndServerWebhooks(local, serverConfig);

      // Persist merged configuration locally
      saveClientWebhooks(merged);

      // If local possessed credentials that server was missing, back-fill to server
      const serverMissingDiscord = !serverConfig?.discordWebhookUrl && Boolean(merged.discordWebhookUrl);
      const serverMissingTelegram = !serverConfig?.telegramBotToken && Boolean(merged.telegramBotToken);
      const serverMissingTrading = !serverConfig?.tradingWebhook?.webhookUrl && Boolean(merged.tradingWebhook?.webhookUrl);

      if (serverMissingDiscord || serverMissingTelegram || serverMissingTrading) {
        fetch("/api/alerts/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        }).catch(() => {});
      }

      return merged;
    }
  } catch {}

  return local;
}
