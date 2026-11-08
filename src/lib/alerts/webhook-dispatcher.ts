/**
 * Webhook Dispatcher Engine for Discord & Telegram Alerts (DEC-130)
 * Handles payload formatting, validation, and delivery for Mochex alert events.
 */

import { PriceAlert, AlertLogEntry } from "./alerts-engine";

export interface AlertWebhookConfig {
  discordWebhookUrl?: string;
  discordEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramEnabled?: boolean;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

export interface TelegramSendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_web_page_preview?: boolean;
}

export interface DispatchNotificationResult {
  discord?: { ok: boolean; status?: number; error?: string };
  telegram?: { ok: boolean; status?: number; error?: string };
}

/**
 * Validates Discord Webhook URL structure
 */
export function isValidDiscordWebhookUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith("https://discord.com/api/webhooks/") ||
    trimmed.startsWith("https://discordapp.com/api/webhooks/") ||
    trimmed.startsWith("http://localhost:")
  );
}

/**
 * Validates Telegram Bot Token structure (e.g. 123456789:ABC-DEF...)
 */
export function isValidTelegramBotToken(token?: string): boolean {
  if (!token || typeof token !== "string") return false;
  const trimmed = token.trim();
  return /^\d+:[A-Za-z0-9_-]{20,}$/.test(trimmed);
}

/**
 * Validates Telegram Chat ID structure
 */
export function isValidTelegramChatId(chatId?: string): boolean {
  if (!chatId || typeof chatId !== "string") return false;
  const trimmed = chatId.trim();
  return trimmed.length > 0 && (/^-?\d+$/.test(trimmed) || trimmed.startsWith("@"));
}

/**
 * Helper to escape HTML characters for Telegram parse_mode='HTML'
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPriceNumber(price: number): string {
  if (!Number.isFinite(price)) return "0.00";
  return price >= 1 ? price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(4);
}

/**
 * Builds a structured Discord Webhook Payload with institutional formatting
 */
export function formatDiscordPayload(
  alert: PriceAlert,
  log: AlertLogEntry
): DiscordWebhookPayload {
  const pair = log.symbol.replace("USDT", "/USDT");
  const isBullish =
    log.condition === "crossing_up" ||
    log.condition === "strategy_entry_long" ||
    log.condition === "indicator_bullish_cross" ||
    log.condition === "indicator_oversold";
  const isBearish =
    log.condition === "crossing_down" ||
    log.condition === "strategy_entry_short" ||
    log.condition === "indicator_bearish_cross" ||
    log.condition === "indicator_overbought";

  // Hex colors: Green (0x00c087 = 49287), Red (0xff3b30 = 16726832), Gold (0xf5ac37 = 16099895)
  const embedColor = isBullish ? 49287 : isBearish ? 16726832 : 16099895;

  const fields: DiscordEmbedField[] = [
    {
      name: "Trigger Price",
      value: `\`$${formatPriceNumber(log.triggerPrice)}\``,
      inline: true,
    },
    {
      name: "Target Level",
      value: `\`$${formatPriceNumber(log.targetPrice)}\``,
      inline: true,
    },
    {
      name: "Condition",
      value: `**${log.condition.replace(/_/g, " ").toUpperCase()}**`,
      inline: true,
    },
  ];

  if (log.sourceType) {
    fields.push({
      name: "Source",
      value: log.sourceType.replace(/_/g, " ").toUpperCase(),
      inline: true,
    });
  }

  if (log.message) {
    fields.push({
      name: "Signal Note",
      value: log.message,
      inline: false,
    });
  }

  return {
    username: "Mochex Alerts",
    embeds: [
      {
        title: `🚨 [${pair}] Alert Triggered: ${log.label}`,
        description: `Market event detected on **${pair}** at **$${formatPriceNumber(log.triggerPrice)}**.`,
        color: embedColor,
        fields,
        footer: {
          text: "Mochex Institutional Charts • Live Market Intelligence",
        },
        timestamp: new Date(log.triggeredAt).toISOString(),
      },
    ],
  };
}

/**
 * Builds HTML text for Telegram sendMessage
 */
export function formatTelegramMessage(
  alert: PriceAlert,
  log: AlertLogEntry
): string {
  const pair = log.symbol.replace("USDT", "/USDT");
  const conditionStr = log.condition.replace(/_/g, " ").toUpperCase();
  const triggerFmt = formatPriceNumber(log.triggerPrice);
  const targetFmt = formatPriceNumber(log.targetPrice);
  const dateStr = new Date(log.triggeredAt).toUTCString();

  let text = `🚨 <b>[Mochex Alert] ${escapeHtml(pair)}</b>\n\n`;
  text += `<b>Event:</b> ${escapeHtml(log.label)}\n`;
  text += `<b>Condition:</b> <code>${escapeHtml(conditionStr)}</code>\n`;
  text += `<b>Trigger Price:</b> <code>$${triggerFmt}</code>\n`;
  text += `<b>Target Level:</b> <code>$${targetFmt}</code>\n`;
  if (log.sourceType) {
    text += `<b>Source:</b> ${escapeHtml(log.sourceType.replace(/_/g, " ").toUpperCase())}\n`;
  }
  if (log.message) {
    text += `<b>Signal:</b> ${escapeHtml(log.message)}\n`;
  }
  text += `\n⏰ <i>${escapeHtml(dateStr)}</i>`;

  return text;
}

/**
 * Direct server-side or worker dispatch to Discord Webhook and/or Telegram Bot
 */
export async function dispatchDirectWebhooks(
  config: AlertWebhookConfig,
  alert: PriceAlert,
  log: AlertLogEntry
): Promise<DispatchNotificationResult> {
  const allowDiscord =
    Boolean(config.discordEnabled) &&
    isValidDiscordWebhookUrl(config.discordWebhookUrl) &&
    alert.notifyDiscord !== false;

  const allowTelegram =
    Boolean(config.telegramEnabled) &&
    isValidTelegramBotToken(config.telegramBotToken) &&
    isValidTelegramChatId(config.telegramChatId) &&
    alert.notifyTelegram !== false;

  if (!allowDiscord && !allowTelegram) {
    return {};
  }

  const results: DispatchNotificationResult = {};

  if (allowDiscord && config.discordWebhookUrl) {
    const payload = formatDiscordPayload(alert, log);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(config.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      results.discord = {
        ok: res.ok,
        status: res.status,
        error: !res.ok ? await res.text() : undefined,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      results.discord = {
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  if (
    allowTelegram &&
    config.telegramBotToken &&
    config.telegramChatId
  ) {
    const text = formatTelegramMessage(alert, log);
    const tgUrl = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text,
          parse_mode: "HTML",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = (await res.json().catch(() => ({}))) as any;
      results.telegram = {
        ok: res.ok && data?.ok === true,
        status: res.status,
        error: !data?.ok ? data?.description || `HTTP ${res.status}` : undefined,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      results.telegram = {
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  return results;
}

/**
 * Client helper to dispatch notifications to Discord/Telegram via /api/alerts/notify
 */
export async function sendAlertNotifications(
  config: AlertWebhookConfig,
  alert: PriceAlert,
  log: AlertLogEntry
): Promise<DispatchNotificationResult> {
  // Check if per-alert notification flags allow dispatching
  const allowDiscord =
    config.discordEnabled &&
    isValidDiscordWebhookUrl(config.discordWebhookUrl) &&
    alert.notifyDiscord !== false;

  const allowTelegram =
    config.telegramEnabled &&
    isValidTelegramBotToken(config.telegramBotToken) &&
    isValidTelegramChatId(config.telegramChatId) &&
    alert.notifyTelegram !== false;

  if (!allowDiscord && !allowTelegram) {
    return {};
  }

  try {
    const res = await fetch("/api/alerts/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "dispatch",
        config: {
          discordWebhookUrl: allowDiscord ? config.discordWebhookUrl : undefined,
          discordEnabled: allowDiscord,
          telegramBotToken: allowTelegram ? config.telegramBotToken : undefined,
          telegramChatId: allowTelegram ? config.telegramChatId : undefined,
          telegramEnabled: allowTelegram,
        },
        alert,
        log,
      }),
    });

    if (!res.ok) {
      return {
        discord: allowDiscord ? { ok: false, error: `HTTP ${res.status}` } : undefined,
        telegram: allowTelegram ? { ok: false, error: `HTTP ${res.status}` } : undefined,
      };
    }

    const data = await res.json();
    return data.results || {};
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to dispatch notification";
    return {
      discord: allowDiscord ? { ok: false, error: errorMsg } : undefined,
      telegram: allowTelegram ? { ok: false, error: errorMsg } : undefined,
    };
  }
}
