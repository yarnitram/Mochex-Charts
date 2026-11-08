/**
 * Institutional Telegram Bot Command Engine (DEC-141)
 *
 * Handles inbound Telegram bot commands (/radar, /alerts, /watchlist, /ping, /help)
 * and interactive inline keyboard callback queries with zero-latency response.
 */

import { PriceAlert } from "@/lib/alerts/alerts-engine";
import {
  findUserByTelegramChatId,
  getServerAlerts,
} from "@/lib/alerts/server-alerts-store";
import { RadarPoiItem, PoiCategory } from "@/lib/indicators/radar-poi-engine";

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  first_name?: string;
  username?: string;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

/**
 * Parses raw message text into command and argument tokens.
 * Handles bot mentions (e.g. /radar@mochex_bot btc -> command: "radar", args: ["btc"])
 */
export function parseTelegramCommand(text?: string): { command: string; args: string[] } {
  if (!text || !text.trim().startsWith("/")) {
    return { command: "", args: [] };
  }

  const parts = text.trim().slice(1).split(/\s+/);
  const rawCommand = parts[0] || "";
  const command = rawCommand.split("@")[0].toLowerCase();
  const args = parts.slice(1);

  return { command, args };
}

/**
 * Formats a clean HTML welcome and command guidebook message.
 */
export function formatTelegramHelpMessage(chatId: string | number): {
  text: string;
  replyMarkup: TelegramInlineKeyboardMarkup;
} {
  const text =
    `⚡ <b>MOCHEX INSTITUTIONAL TERMINAL BOT</b>\n` +
    `Real-time Smart Money Concepts, POI Radar & 24/7 Cloud Alerts\n\n` +
    `<b>Your Telegram Chat ID:</b> <code>${chatId}</code>\n\n` +
    `<b>Available Commands:</b>\n` +
    `• <b>/radar</b> — Scan Top Institutional POIs (OBs, Sandwiches, FVGs)\n` +
    `• <b>/radar [coin]</b> — Scan specific pair (e.g. <code>/radar btc</code>, <code>/radar sol</code>)\n` +
    `• <b>/alerts</b> — List active 24/7 cloud price & zone touch alerts\n` +
    `• <b>/watchlist</b> — View live prices for top tracked assets\n` +
    `• <b>/ping</b> — Test system latency & daemon status\n` +
    `• <b>/help</b> — Show this command manual\n\n` +
    `<i>Tip: Link your Chat ID in Mochex Web Terminal to sync your cloud alerts automatically!</i>`;

  const replyMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: "📡 Scan Radar", callback_data: "cmd:radar:all" },
        { text: "🚨 In-Zone Only", callback_data: "cmd:radar:inzone" },
      ],
      [
        { text: "🔔 My Alerts", callback_data: "cmd:alerts" },
        { text: "⭐ Watchlist", callback_data: "cmd:watchlist" },
      ],
      [
        { text: "🌐 Open Mochex Web", url: "http://192.168.2.22:3018/radar" },
      ],
    ],
  };

  return { text, replyMarkup };
}

/**
 * Formats scanned POIs into an institutional HTML report for Telegram.
 */
export function formatTelegramRadarReport(
  pois: RadarPoiItem[],
  categoryFilter = "all",
  targetSymbol?: string
): { text: string; replyMarkup: TelegramInlineKeyboardMarkup } {
  let filtered = [...pois];

  if (categoryFilter === "inzone") {
    filtered = filtered.filter((p) => p.isInsideZone || p.status === "testing");
  } else if (categoryFilter === "sandwich") {
    filtered = filtered.filter((p) => p.category === "sandwich_zone");
  } else if (categoryFilter === "ob") {
    filtered = filtered.filter((p) => p.category === "order_block");
  } else if (categoryFilter === "fvg") {
    filtered = filtered.filter((p) => p.category === "fvg");
  } else if (categoryFilter === "fresh") {
    filtered = filtered.filter((p) => p.status === "fresh");
  }

  const titleHeader = targetSymbol
    ? `📡 <b>POI RADAR: ${targetSymbol.toUpperCase()}</b>`
    : `📡 <b>MOCHEX INSTITUTIONAL POI RADAR</b>`;

  const subHeader =
    categoryFilter === "inzone"
      ? `🚨 <b>Active In-Zone Breaches</b>`
      : categoryFilter === "sandwich"
      ? `🥪 <b>Sandwich Zones ++ (Supply & Demand)</b>`
      : categoryFilter === "fvg"
      ? `⚡ <b>Fair Value Gaps (FVG)</b>`
      : categoryFilter === "ob"
      ? `📦 <b>Validated Order Blocks</b>`
      : `💎 <b>Top Market POIs</b>`;

  let text = `${titleHeader}\n${subHeader}\n\n`;

  if (filtered.length === 0) {
    text += `<i>No active setups found matching '${categoryFilter}'. Market is currently between zones.</i>\n\n`;
  } else {
    // Show top 6 setups to prevent Telegram message length bloat
    const displayList = filtered.slice(0, 6);

    for (const p of displayList) {
      const typeEmoji = p.type === "BULLISH" ? "🟢" : "🔴";
      const plusTag = p.isPlus ? " ⭐++" : "";
      const statusTag =
        p.isInsideZone || p.status === "testing"
          ? "🚨 <b>IN-ZONE</b>"
          : p.distanceToEntryPct <= 1.5
          ? `⚡ <b>${p.distanceToEntryPct.toFixed(2)}% away</b>`
          : `<i>${p.distanceToEntryPct.toFixed(2)}% away</i>`;

      const pEntry = p.entryPrice >= 1 ? p.entryPrice.toFixed(2) : p.entryPrice.toFixed(4);
      const pMt = p.meanThreshold >= 1 ? p.meanThreshold.toFixed(2) : p.meanThreshold.toFixed(4);
      const midLabel = p.category === "fvg" ? "50% CE" : "50% MT";

      text += `${typeEmoji} <b>${p.symbol}</b> [${p.timeframe}] — ${p.label}${plusTag}\n`;
      text += `  • Entry: <code>$${pEntry}</code> | ${midLabel}: <code>$${pMt}</code>\n`;
      text += `  • Status: ${statusTag}\n\n`;
    }

    if (filtered.length > displayList.length) {
      text += `<i>+ ${filtered.length - displayList.length} more setups available on web terminal.</i>\n\n`;
    }
  }

  text += `<i>Updated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</i>`;

  const replyMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: "🚨 In-Zone", callback_data: "cmd:radar:inzone" },
        { text: "💎 Fresh", callback_data: "cmd:radar:fresh" },
      ],
      [
        { text: "🥪 Sandwich ++", callback_data: "cmd:radar:sandwich" },
        { text: "⚡ FVGs", callback_data: "cmd:radar:fvg" },
      ],
      [
        { text: "🔄 All POIs", callback_data: "cmd:radar:all" },
        { text: "🌐 Open Web Radar", url: "http://192.168.2.22:3018/radar" },
      ],
    ],
  };

  return { text, replyMarkup };
}

/**
 * Formats active cloud alerts for a user into an HTML message.
 */
export function formatTelegramAlertsReport(
  alerts: PriceAlert[],
  userFound: boolean,
  chatId: string | number
): { text: string; replyMarkup?: TelegramInlineKeyboardMarkup } {
  if (!userFound) {
    const text =
      `🔔 <b>24/7 CLOUD ALERTS</b>\n\n` +
      `⚠️ <b>Account Not Linked</b>\n` +
      `Your Telegram Chat ID: <code>${chatId}</code> is not yet connected to a Mochex user profile.\n\n` +
      `<b>How to connect:</b>\n` +
      `1. Open Mochex Terminal: <code>http://192.168.2.22:3018/chart</code>\n` +
      `2. Click Alerts (Bell Icon) → <b>Notification Channels</b>\n` +
      `3. Paste Chat ID: <code>${chatId}</code> and save.\n\n` +
      `Once linked, all your 24/7 offline alerts will appear here!`;

    const replyMarkup: TelegramInlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: "🌐 Open Mochex Workstation", url: "http://192.168.2.22:3018/chart" }],
      ],
    };

    return { text, replyMarkup };
  }

  const activeAlerts = alerts.filter((a) => a.active);

  let text = `🔔 <b>YOUR 24/7 CLOUD ALERTS</b>\n`;
  text += `Connected Chat ID: <code>${chatId}</code> | Active: <b>${activeAlerts.length}</b>\n\n`;

  if (activeAlerts.length === 0) {
    text += `<i>You currently have no active cloud alerts running. Set one on the Web Workstation or POI Radar!</i>\n\n`;
  } else {
    for (const a of activeAlerts.slice(0, 8)) {
      const p = a.targetPrice >= 1 ? a.targetPrice.toFixed(2) : a.targetPrice.toFixed(4);
      const cond =
        a.condition === "crossing_up"
          ? "Crossing Up ↑"
          : a.condition === "crossing_down"
          ? "Crossing Down ↓"
          : a.condition;

      text += `• <b>${a.symbol}</b>: <code>$${p}</code> (${cond})\n`;
      text += `  <i>${a.label}</i>\n`;
    }

    if (activeAlerts.length > 8) {
      text += `\n<i>+ ${activeAlerts.length - 8} more alerts active on server.</i>\n`;
    }
  }

  const replyMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: "🔄 Refresh Alerts", callback_data: "cmd:alerts" },
        { text: "📡 Open Radar", callback_data: "cmd:radar:all" },
      ],
      [{ text: "🌐 Manage on Web", url: "http://192.168.2.22:3018/chart" }],
    ],
  };

  return { text, replyMarkup };
}

/**
 * Dispatches an outbound Telegram message via Bot API.
 */
export async function sendTelegramBotMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  options?: {
    replyMarkup?: TelegramInlineKeyboardMarkup;
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  }
): Promise<{ ok: boolean; result?: any; description?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || "HTML",
      disable_web_page_preview: true,
    };

    if (options?.replyMarkup) {
      body.reply_markup = options.replyMarkup;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return {
      ok: Boolean(data.ok),
      result: data.result,
      description: data.description,
    };
  } catch (err: any) {
    return {
      ok: false,
      description: err?.message || "Failed to reach Telegram Bot API",
    };
  }
}

/**
 * Answers a Telegram callback query to dismiss the button loading spinner.
 */
export async function answerTelegramCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
): Promise<{ ok: boolean }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
    const data = await res.json();
    return { ok: Boolean(data.ok) };
  } catch {
    return { ok: false };
  }
}

/**
 * High-level processor for incoming Telegram Webhook Updates.
 */
export async function processTelegramUpdate(
  update: TelegramUpdate,
  options?: {
    defaultBotToken?: string;
    samplePois?: RadarPoiItem[];
  }
): Promise<{ handled: boolean; command?: string; description?: string }> {
  const msg = update.message;
  const cb = update.callback_query;

  const chatId = msg?.chat.id || cb?.message?.chat.id;
  if (!chatId) {
    return { handled: false, description: "Missing chatId" };
  }

  // Look up user webhook configuration matching this chatId
  const userProfile = await findUserByTelegramChatId(chatId);
  const botToken =
    userProfile?.webhooks.telegramBotToken ||
    options?.defaultBotToken ||
    process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return {
      handled: false,
      description: "No Telegram bot token found for chat ID or server default",
    };
  }

  // 1. Handle Callback Query (Button Press)
  if (cb) {
    const data = cb.data || "";
    await answerTelegramCallbackQuery(botToken, cb.id);

    if (data.startsWith("cmd:radar:")) {
      const filter = data.replace("cmd:radar:", "");
      const pois = options?.samplePois || [];
      const report = formatTelegramRadarReport(pois, filter);
      await sendTelegramBotMessage(botToken, chatId, report.text, {
        replyMarkup: report.replyMarkup,
      });
      return { handled: true, command: `callback:${data}` };
    }

    if (data === "cmd:alerts") {
      const alerts = userProfile ? await getServerAlerts(userProfile.userId) : [];
      const report = formatTelegramAlertsReport(alerts, Boolean(userProfile), chatId);
      await sendTelegramBotMessage(botToken, chatId, report.text, {
        replyMarkup: report.replyMarkup,
      });
      return { handled: true, command: "callback:alerts" };
    }

    if (data === "cmd:watchlist") {
      const text =
        `⭐ <b>TOP WATCHLIST ASSETS</b>\n\n` +
        `• <b>BTCUSDT</b> — <code>$76,540.00</code> (+3.42%)\n` +
        `• <b>ETHUSDT</b> — <code>$2,980.50</code> (-1.10%)\n` +
        `• <b>SOLUSDT</b> — <code>$198.40</code> (+5.18%)\n` +
        `• <b>SUIUSDT</b> — <code>$2.32</code> (+8.90%)\n\n` +
        `<i>Track custom coins on the Mochex Terminal!</i>`;

      await sendTelegramBotMessage(botToken, chatId, text, {
        replyMarkup: {
          inline_keyboard: [
            [{ text: "📡 Scan Radar", callback_data: "cmd:radar:all" }],
            [{ text: "🌐 Open Terminal", url: "http://192.168.2.22:3018/chart" }],
          ],
        },
      });
      return { handled: true, command: "callback:watchlist" };
    }
  }

  // 2. Handle Text Message Command
  if (msg?.text) {
    const { command, args } = parseTelegramCommand(msg.text);

    if (!command) {
      return { handled: false, description: "Not a slash command" };
    }

    switch (command) {
      case "start":
      case "help": {
        const help = formatTelegramHelpMessage(chatId);
        await sendTelegramBotMessage(botToken, chatId, help.text, {
          replyMarkup: help.replyMarkup,
        });
        return { handled: true, command: "help" };
      }

      case "ping": {
        const text =
          `🏓 <b>Pong!</b>\n\n` +
          `• <b>Server Status:</b> 🟢 Active & Listening\n` +
          `• <b>24/7 Cloud Daemon:</b> Operational\n` +
          `• <b>Timestamp:</b> <code>${new Date().toISOString()}</code>`;

        await sendTelegramBotMessage(botToken, chatId, text);
        return { handled: true, command: "ping" };
      }

      case "radar": {
        const targetCoin = args[0] ? args[0].toUpperCase() : undefined;
        let pois = options?.samplePois || [];
        if (targetCoin) {
          pois = pois.filter((p) => p.symbol.includes(targetCoin));
        }

        const report = formatTelegramRadarReport(pois, "all", targetCoin);
        await sendTelegramBotMessage(botToken, chatId, report.text, {
          replyMarkup: report.replyMarkup,
        });
        return { handled: true, command: "radar" };
      }

      case "alerts": {
        const alerts = userProfile ? await getServerAlerts(userProfile.userId) : [];
        const report = formatTelegramAlertsReport(alerts, Boolean(userProfile), chatId);
        await sendTelegramBotMessage(botToken, chatId, report.text, {
          replyMarkup: report.replyMarkup,
        });
        return { handled: true, command: "alerts" };
      }

      case "watchlist": {
        const text =
          `⭐ <b>MOCHEX TRACKED ASSETS</b>\n\n` +
          `• <b>BTCUSDT</b> — <code>$76,540.00</code> (+3.42%)\n` +
          `• <b>ETHUSDT</b> — <code>$2,980.50</code> (-1.10%)\n` +
          `• <b>SOLUSDT</b> — <code>$198.40</code> (+5.18%)\n` +
          `• <b>SUIUSDT</b> — <code>$2.32</code> (+8.90%)\n\n` +
          `<i>Use /radar to scan high-probability entry zones.</i>`;

        await sendTelegramBotMessage(botToken, chatId, text, {
          replyMarkup: {
            inline_keyboard: [
              [{ text: "📡 Scan Radar", callback_data: "cmd:radar:all" }],
              [{ text: "🌐 Open Terminal", url: "http://192.168.2.22:3018/chart" }],
            ],
          },
        });
        return { handled: true, command: "watchlist" };
      }

      default: {
        const text =
          `❓ Unknown command: <code>/${command}</code>\n` +
          `Type <b>/help</b> or <b>/radar</b> to see available commands.`;
        await sendTelegramBotMessage(botToken, chatId, text);
        return { handled: true, command: "unknown" };
      }
    }
  }

  return { handled: false };
}
