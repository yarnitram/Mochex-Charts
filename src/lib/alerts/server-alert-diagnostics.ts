import fs from "fs";
import path from "path";
import {
  AlertDeliveryResults,
  AlertLogEntry,
  ChannelDeliveryResult,
  PriceAlert,
} from "./alerts-engine";
import { AlertWebhookConfig } from "./webhook-dispatcher";

const DATA_DIR = path.join(process.cwd(), ".data");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const WEBHOOKS_FILE = path.join(DATA_DIR, "webhooks.json");
const LOGS_FILE = path.join(DATA_DIR, "alert-logs.json");
const MAX_LOGS_PER_USER = 150;

function readJsonRecord<T>(filePath: string): Record<string, T> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, T>;
    }
  } catch {
    // Corrupted or mid-write JSON file falls back safely
  }
  return {};
}

function writeJsonRecord<T>(filePath: string, data: Record<string, T>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Masks sensitive tokens in a Discord webhook URL before exposing diagnostics to UI.
 */
export function maskDiscordWebhookUrl(url?: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 4 && parts[1] === "webhooks") {
      const id = parts[2];
      const token = parts[3];
      const tail = token.length > 4 ? token.slice(-4) : "****";
      return `${parsed.origin}/api/webhooks/${id}/...${tail}`;
    }
    return `${parsed.origin}/...`;
  } catch {
    return trimmed.length > 16 ? `${trimmed.slice(0, 12)}...${trimmed.slice(-4)}` : "***";
  }
}

/**
 * Inserts or updates an alert log entry in `.data/alert-logs.json` so webhook delivery
 * results (HTTP status / errors / skipped reasons) are durably preserved on disk.
 */
export function upsertServerAlertLog(userId: string, entry: AlertLogEntry): AlertLogEntry {
  const store = readJsonRecord<AlertLogEntry[]>(LOGS_FILE);
  const existing = Array.isArray(store[userId]) ? store[userId] : [];
  const idx = existing.findIndex((item) => item.id === entry.id);

  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...entry };
  } else {
    existing.unshift(entry);
  }

  store[userId] = existing
    .sort((a, b) => (b.triggeredAt || 0) - (a.triggeredAt || 0))
    .slice(0, MAX_LOGS_PER_USER);

  writeJsonRecord(LOGS_FILE, store);
  return entry;
}

/**
 * Reads persisted alert & delivery logs for the specified user (newest first).
 */
export function getUserServerAlertLogs(userId: string): AlertLogEntry[] {
  const store = readJsonRecord<AlertLogEntry[]>(LOGS_FILE);
  const entries = Array.isArray(store[userId]) ? store[userId] : [];
  return [...entries].sort((a, b) => (b.triggeredAt || 0) - (a.triggeredAt || 0));
}

/**
 * Clears all alert delivery logs for the specified user.
 */
export function clearUserServerAlertLogs(userId: string): void {
  const store = readJsonRecord<AlertLogEntry[]>(LOGS_FILE);
  store[userId] = [];
  writeJsonRecord(LOGS_FILE, store);
}

/**
 * Normalizes raw dispatch results + alert/webhook flags into explicit channel outcomes
 * so the Logs dashboard always explains whether Discord sent, failed, or was skipped.
 */
export function buildAlertDeliveryResults(
  webhooks: AlertWebhookConfig | null | undefined,
  alert: Pick<PriceAlert, "notifyDiscord" | "notifyTelegram" | "notifyTradingWebhook">,
  rawDispatchResult?: Record<string, unknown> | null,
  dispatchError?: unknown
): AlertDeliveryResults {
  const attemptedAt = Date.now();
  const errMsg = dispatchError instanceof Error ? dispatchError.message : dispatchError ? String(dispatchError) : undefined;

  const parseRaw = (channelResult: unknown): ChannelDeliveryResult | undefined => {
    if (!channelResult || typeof channelResult !== "object") return undefined;
    const obj = channelResult as { ok?: unknown; status?: unknown; error?: unknown };
    return {
      ok: Boolean(obj.ok),
      status: typeof obj.status === "number" ? obj.status : undefined,
      error: typeof obj.error === "string" ? obj.error : undefined,
    };
  };

  let discord: ChannelDeliveryResult;
  if (alert.notifyDiscord === false) {
    discord = { ok: false, skipped: true, skippedReason: "Discord disabled on this alert" };
  } else if (!webhooks || !webhooks.discordWebhookUrl?.trim()) {
    discord = { ok: false, skipped: true, skippedReason: "No Discord Webhook URL saved on server" };
  } else if (!webhooks.discordEnabled) {
    discord = { ok: false, skipped: true, skippedReason: "Discord channel toggle is disabled" };
  } else if (errMsg) {
    discord = { ok: false, error: errMsg };
  } else {
    discord = parseRaw(rawDispatchResult?.discord) ?? {
      ok: false,
      error: "Discord dispatch did not return a status",
    };
  }

  let telegram: ChannelDeliveryResult;
  if (alert.notifyTelegram === false) {
    telegram = { ok: false, skipped: true, skippedReason: "Telegram disabled on this alert" };
  } else if (!webhooks || !webhooks.telegramBotToken?.trim() || !webhooks.telegramChatId?.trim()) {
    telegram = { ok: false, skipped: true, skippedReason: "No Telegram credentials saved on server" };
  } else if (!webhooks.telegramEnabled) {
    telegram = { ok: false, skipped: true, skippedReason: "Telegram channel toggle is disabled" };
  } else if (errMsg) {
    telegram = { ok: false, error: errMsg };
  } else {
    telegram = parseRaw(rawDispatchResult?.telegram) ?? {
      ok: false,
      error: "Telegram dispatch did not return a status",
    };
  }

  let tradingWebhook: ChannelDeliveryResult | undefined;
  if (alert.notifyTradingWebhook && webhooks?.tradingWebhook?.enabled) {
    tradingWebhook = parseRaw(rawDispatchResult?.tradingWebhook) ?? (errMsg ? { ok: false, error: errMsg } : undefined);
  }

  return {
    discord,
    telegram,
    ...(tradingWebhook ? { tradingWebhook } : {}),
    attemptedAt,
  };
}

export interface ServerAlertDiagnosticsSummary {
  userId: string;
  userTotalAlerts: number;
  userActiveAlerts: number;
  userDiscordAlerts: number;
  userTelegramAlerts: number;
  globalActiveAlerts: number;
  discordConfigured: boolean;
  discordEnabled: boolean;
  maskedDiscordUrl: string;
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  logsCount: number;
  discordSuccessCount: number;
  discordFailureCount: number;
}

/**
 * Builds a secret-safe server diagnostic summary comparing user alerts, webhook channels,
 * and historical Discord delivery outcomes stored on disk.
 */
export function getServerDiagnosticsSummary(userId: string): ServerAlertDiagnosticsSummary {
  const alertsStore = readJsonRecord<PriceAlert[]>(ALERTS_FILE);
  const webhooksStore = readJsonRecord<AlertWebhookConfig>(WEBHOOKS_FILE);
  const logs = getUserServerAlertLogs(userId);

  const userAlerts = Array.isArray(alertsStore[userId]) ? alertsStore[userId] : [];
  const activeUserAlerts = userAlerts.filter((a) => a.active);

  let globalActiveAlerts = 0;
  for (const list of Object.values(alertsStore)) {
    if (Array.isArray(list)) {
      globalActiveAlerts += list.filter((a) => a.active).length;
    }
  }

  const userWebhook = webhooksStore[userId];
  const discordConfigured = Boolean(userWebhook?.discordWebhookUrl?.trim());
  const discordEnabled = Boolean(discordConfigured && userWebhook?.discordEnabled);
  const telegramConfigured = Boolean(
    userWebhook?.telegramBotToken?.trim() && userWebhook?.telegramChatId?.trim()
  );
  const telegramEnabled = Boolean(telegramConfigured && userWebhook?.telegramEnabled);

  let discordSuccessCount = 0;
  let discordFailureCount = 0;
  for (const entry of logs) {
    const res = entry.deliveryResults?.discord;
    if (!res) continue;
    if (res.ok) discordSuccessCount++;
    else if (!res.skipped) discordFailureCount++;
  }

  return {
    userId,
    userTotalAlerts: userAlerts.length,
    userActiveAlerts: activeUserAlerts.length,
    userDiscordAlerts: activeUserAlerts.filter((a) => a.notifyDiscord !== false).length,
    userTelegramAlerts: activeUserAlerts.filter((a) => a.notifyTelegram !== false).length,
    globalActiveAlerts,
    discordConfigured,
    discordEnabled,
    maskedDiscordUrl: maskDiscordWebhookUrl(userWebhook?.discordWebhookUrl),
    telegramConfigured,
    telegramEnabled,
    logsCount: logs.length,
    discordSuccessCount,
    discordFailureCount,
  };
}
