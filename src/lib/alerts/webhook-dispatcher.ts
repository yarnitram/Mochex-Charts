/**
 * Webhook Dispatcher Engine for Discord & Telegram Alerts (DEC-130)
 * Handles payload formatting, validation, and delivery for Mochex alert events.
 */

import { PriceAlert, AlertLogEntry } from "./alerts-engine";

export type TradingWebhookPlatform = "3commas" | "cornix" | "custom";

export interface TradingWebhookConfig {
  enabled?: boolean;
  platform?: TradingWebhookPlatform;
  webhookUrl?: string;
  secretToken?: string; // 3Commas email_token or Cornix secret
  botId?: string; // 3Commas bot_id
  headers?: Record<string, string>; // optional custom headers
  customTemplate?: string; // custom JSON payload template with {{tokens}}
}

export interface AlertWebhookConfig {
  discordWebhookUrl?: string;
  discordEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramEnabled?: boolean;
  // DEC-148: Automated Trading Webhook Integration
  tradingWebhook?: TradingWebhookConfig;
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
  tradingWebhook?: { ok: boolean; status?: number; platform?: string; error?: string };
}

export const DEFAULT_3COMMAS_TEMPLATE = `{
  "message_type": "bot",
  "bot_id": "{{bot_id}}",
  "email_token": "{{secret_token}}",
  "delay_seconds": 0,
  "pair": "{{pair_underscore}}",
  "action": "{{action_lower}}"
}`;

export const DEFAULT_CORNIX_TEMPLATE = `{
  "secret": "{{secret_token}}",
  "symbol": "{{pair_slash}}",
  "action": "{{action_lower}}",
  "type": "limit",
  "price": {{price}},
  "stopLoss": {{stop_loss}},
  "takeProfits": [{{take_profit_2r}}, {{take_profit_3r}}]
}`;

export const DEFAULT_CUSTOM_TRADING_TEMPLATE = `{
  "ticker": "{{symbol}}",
  "action": "{{action_upper}}",
  "sentiment": "{{sentiment}}",
  "price": {{price}},
  "targetPrice": {{target_price}},
  "poi": "{{poi_label}}",
  "timeframe": "{{timeframe}}",
  "entry": {{price}},
  "stopLoss": {{stop_loss}},
  "takeProfit": {{take_profit_2r}},
  "source": "Mochex POI Radar",
  "timestamp": "{{timestamp}}"
}`;

export function getDefaultTradingWebhookTemplate(platform?: TradingWebhookPlatform): string {
  switch (platform) {
    case "3commas":
      return DEFAULT_3COMMAS_TEMPLATE;
    case "cornix":
      return DEFAULT_CORNIX_TEMPLATE;
    case "custom":
    default:
      return DEFAULT_CUSTOM_TRADING_TEMPLATE;
  }
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
 * Validates Automated Trading Webhook URL structure (DEC-148)
 */
export function isValidTradingWebhookUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  );
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
 * Builds an automated trading webhook payload (3Commas, Cornix, TradingView) with dynamic token interpolation (DEC-148)
 */
export function formatTradingWebhookPayload(
  config: TradingWebhookConfig,
  alert: PriceAlert,
  log: AlertLogEntry
): { payload: any; headers: Record<string, string>; rawBody: string } {
  const isBullish =
    log.condition === "crossing_down" ||
    alert.condition === "crossing_down" ||
    log.label.toLowerCase().includes("bullish") ||
    (log.message && log.message.toLowerCase().includes("bullish"));

  const action = isBullish ? "buy" : "sell";
  const actionUpper = action.toUpperCase();
  const sentiment = isBullish ? "bullish" : "bearish";

  const rawSymbol = log.symbol.toUpperCase();
  const base = rawSymbol.replace(/USDT$/, "");
  const quote = "USDT";
  const pairSlash = `${base}/${quote}`;
  const pairUnderscore = `${quote}_${base}`; // 3Commas convention e.g. USDT_BTC

  const price = log.triggerPrice || log.targetPrice || alert.targetPrice;
  const stopLoss = isBullish ? price * 0.985 : price * 1.015;
  const risk = Math.abs(price - stopLoss);
  const tp2 = isBullish ? price + risk * 2 : price - risk * 2;
  const tp3 = isBullish ? price + risk * 3 : price - risk * 3;

  const tfMatch = log.label.match(/\b(15m|1h|4h|1d)\b/i);
  const timeframe = tfMatch ? tfMatch[0].toUpperCase() : "4H";

  const numPrice = Number(price.toFixed(price >= 1 ? 2 : 4));
  const numTargetPrice = Number(log.targetPrice.toFixed(log.targetPrice >= 1 ? 2 : 4));
  const numStopLoss = Number(stopLoss.toFixed(price >= 1 ? 2 : 4));
  const numTp2 = Number(tp2.toFixed(price >= 1 ? 2 : 4));
  const numTp3 = Number(tp3.toFixed(price >= 1 ? 2 : 4));

  const replacements: Record<string, string | number> = {
    symbol: rawSymbol,
    pair: pairSlash,
    pair_slash: pairSlash,
    pair_underscore: pairUnderscore,
    base,
    quote,
    action,
    action_lower: action,
    action_upper: actionUpper,
    sentiment,
    price: numPrice,
    target_price: numTargetPrice,
    stop_loss: numStopLoss,
    take_profit_2r: numTp2,
    take_profit_3r: numTp3,
    bot_id: config.botId || "0",
    secret_token: config.secretToken || "",
    poi_label: log.label || alert.label || "POI",
    timeframe,
    timestamp: new Date(log.triggeredAt || Date.now()).toISOString(),
  };

  const platform = alert.tradingWebhookOverride?.platform || config.platform || "custom";
  const template =
    alert.tradingWebhookOverride?.customTemplate ||
    config.customTemplate ||
    getDefaultTradingWebhookTemplate(platform);

  let rawBody = template;
  for (const [key, val] of Object.entries(replacements)) {
    rawBody = rawBody.replaceAll(`{{${key}}}`, String(val));
  }

  let payload: any = rawBody;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // If template is plain text signal, keep as string
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers || {}),
  };

  return { payload, headers, rawBody };
}

/**
 * Direct server-side or worker dispatch to Discord Webhook, Telegram Bot, and Automated Trading Webhook (DEC-130, DEC-148)
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

  const tradingUrl = alert.tradingWebhookOverride?.webhookUrl || config.tradingWebhook?.webhookUrl;
  const allowTrading =
    Boolean(config.tradingWebhook?.enabled) &&
    isValidTradingWebhookUrl(tradingUrl) &&
    alert.notifyTradingWebhook !== false;

  if (!allowDiscord && !allowTelegram && !allowTrading) {
    return {};
  }

  const results: DispatchNotificationResult = {};

  // 1. Discord Webhook
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

  // 2. Telegram Bot
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

  // 3. Automated Trading Webhook (3Commas, Cornix, TradingView - DEC-148)
  if (allowTrading && tradingUrl && config.tradingWebhook) {
    const { payload, headers, rawBody } = formatTradingWebhookPayload(
      config.tradingWebhook,
      alert,
      log
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(tradingUrl, {
        method: "POST",
        headers,
        body: typeof payload === "string" ? payload : JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      results.tradingWebhook = {
        ok: res.ok,
        status: res.status,
        platform: config.tradingWebhook.platform || "custom",
        error: !res.ok ? await res.text() : undefined,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      results.tradingWebhook = {
        ok: false,
        platform: config.tradingWebhook.platform || "custom",
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  return results;
}

/**
 * Client helper to dispatch notifications to Discord, Telegram, and Trading Webhook via /api/alerts/notify
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

  const tradingUrl = alert.tradingWebhookOverride?.webhookUrl || config.tradingWebhook?.webhookUrl;
  const allowTrading =
    Boolean(config.tradingWebhook?.enabled) &&
    isValidTradingWebhookUrl(tradingUrl) &&
    alert.notifyTradingWebhook !== false;

  if (!allowDiscord && !allowTelegram && !allowTrading) {
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
          tradingWebhook: allowTrading ? config.tradingWebhook : undefined,
        },
        alert,
        log,
      }),
    });

    if (!res.ok) {
      return {
        discord: allowDiscord ? { ok: false, error: `HTTP ${res.status}` } : undefined,
        telegram: allowTelegram ? { ok: false, error: `HTTP ${res.status}` } : undefined,
        tradingWebhook: allowTrading ? { ok: false, error: `HTTP ${res.status}` } : undefined,
      };
    }

    const data = await res.json();
    return data.results || {};
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to dispatch notification";
    return {
      discord: allowDiscord ? { ok: false, error: errorMsg } : undefined,
      telegram: allowTelegram ? { ok: false, error: errorMsg } : undefined,
      tradingWebhook: allowTrading ? { ok: false, error: errorMsg } : undefined,
    };
  }
}
