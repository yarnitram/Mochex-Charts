import { PriceAlert, AlertLogEntry } from "./alerts-engine";
import { AlertWebhookConfig } from "./webhook-dispatcher";
import { readJsonData, writeJsonData } from "../storage/data-dir";

const ALERTS_FILE = "alerts.json";
const WEBHOOKS_FILE = "webhooks.json";
const LOGS_FILE = "alert-logs.json";

function readJsonFile<T>(filename: string, fallback: T): T {
  return readJsonData(filename, fallback, "server-alerts-store");
}

function writeJsonFile<T>(filename: string, data: T): void {
  writeJsonData(filename, data, "server-alerts-store");
}

export type UserAlertsMap = Record<string, PriceAlert[]>;
export type UserWebhooksMap = Record<string, AlertWebhookConfig>;
export type UserAlertLogsMap = Record<string, AlertLogEntry[]>;

/**
 * Returns all alerts created by a user
 */
export async function getServerAlerts(userId: string): Promise<PriceAlert[]> {
  const map = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  const userAlerts = map[userId] || [];
  // Cross-session resilience: if an authenticated user has no alerts, check if "default-trader" has unauthenticated alerts
  if (
    userAlerts.length === 0 &&
    userId !== "default-trader" &&
    Array.isArray(map["default-trader"]) &&
    map["default-trader"].length > 0
  ) {
    // Migrate default-trader alerts to this user so they don't vanish upon sign-in
    map[userId] = [...map["default-trader"]];
    writeJsonFile(ALERTS_FILE, map);
    return map[userId];
  }
  return userAlerts;
}

/**
 * Saves (creates or replaces) an alert for a user
 */
export async function saveServerAlert(alert: PriceAlert, userId: string): Promise<PriceAlert> {
  const map = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  const userAlerts = map[userId] || [];
  const existingIdx = userAlerts.findIndex((a) => a.id === alert.id);

  if (existingIdx >= 0) {
    userAlerts[existingIdx] = alert;
  } else {
    userAlerts.push(alert);
  }

  map[userId] = userAlerts;
  writeJsonFile(ALERTS_FILE, map);
  return alert;
}

/**
 * Saves multiple alerts in batch for a user
 */
export async function saveServerAlertsBatch(
  alerts: PriceAlert[],
  userId: string
): Promise<PriceAlert[]> {
  if (!alerts || alerts.length === 0) return [];
  const map = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  const userAlerts = map[userId] || [];

  for (const alert of alerts) {
    const existingIdx = userAlerts.findIndex((a) => a.id === alert.id);
    if (existingIdx >= 0) {
      userAlerts[existingIdx] = alert;
    } else {
      userAlerts.push(alert);
    }
  }

  map[userId] = userAlerts;
  writeJsonFile(ALERTS_FILE, map);
  return alerts;
}


/**
 * Updates partial fields of an alert for a user
 */
export async function updateServerAlert(
  alertId: string,
  updates: Partial<PriceAlert>,
  userId: string
): Promise<PriceAlert | null> {
  const map = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  const userAlerts = map[userId] || [];
  const idx = userAlerts.findIndex((a) => a.id === alertId);

  if (idx < 0) {
    return null;
  }

  const updated: PriceAlert = {
    ...userAlerts[idx],
    ...updates,
  };
  userAlerts[idx] = updated;
  map[userId] = userAlerts;
  writeJsonFile(ALERTS_FILE, map);
  return updated;
}

/**
 * Deletes an alert for a user
 */
export async function deleteServerAlert(alertId: string, userId: string): Promise<boolean> {
  const map = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  const userAlerts = map[userId] || [];
  const filtered = userAlerts.filter((a) => a.id !== alertId);

  if (filtered.length === userAlerts.length) {
    return false;
  }

  map[userId] = filtered;
  writeJsonFile(ALERTS_FILE, map);
  return true;
}

/**
 * Deletes multiple alerts in batch for a user (DEC-158)
 */
export async function deleteServerAlertsBatch(
  alertIds: string[],
  userId: string
): Promise<number> {
  if (!alertIds || alertIds.length === 0) return 0;
  const map = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  const userAlerts = map[userId] || [];
  const idSet = new Set(alertIds);
  const remaining = userAlerts.filter((a) => !idSet.has(a.id));
  const count = userAlerts.length - remaining.length;
  if (count > 0) {
    map[userId] = remaining;
    writeJsonFile(ALERTS_FILE, map);
  }
  return count;
}

/**
 * Updates multiple alerts in batch for a user (DEC-158)
 */
export async function updateServerAlertsBatch(
  alertIds: string[],
  updates: Partial<PriceAlert>,
  userId: string
): Promise<number> {
  if (!alertIds || alertIds.length === 0) return 0;
  const map = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  const userAlerts = map[userId] || [];
  const idSet = new Set(alertIds);
  let updatedCount = 0;
  for (let i = 0; i < userAlerts.length; i++) {
    if (idSet.has(userAlerts[i].id)) {
      userAlerts[i] = { ...userAlerts[i], ...updates };
      updatedCount++;
    }
  }
  if (updatedCount > 0) {
    map[userId] = userAlerts;
    writeJsonFile(ALERTS_FILE, map);
  }
  return updatedCount;
}

/**
 * Returns saved webhook configuration for a user with cross-account resilience
 */
export async function getServerWebhooks(userId: string): Promise<AlertWebhookConfig | null> {
  const map = readJsonFile<UserWebhooksMap>(WEBHOOKS_FILE, {});
  const userConfig = map[userId] || null;

  // Cross-account resilience 1: if logged-in user has no webhooks, check if "default-trader" has them
  if (
    (!userConfig || (!userConfig.discordWebhookUrl && !userConfig.telegramBotToken && !userConfig.tradingWebhook?.webhookUrl)) &&
    userId !== "default-trader" &&
    map["default-trader"] &&
    (map["default-trader"].discordWebhookUrl || map["default-trader"].telegramBotToken || map["default-trader"].tradingWebhook?.webhookUrl)
  ) {
    map[userId] = { ...map["default-trader"] };
    writeJsonFile(WEBHOOKS_FILE, map);
    return map[userId];
  }

  // Cross-account resilience 2: if default-trader has no webhooks, check if any authenticated user configured webhooks
  if (
    (!userConfig || (!userConfig.discordWebhookUrl && !userConfig.telegramBotToken && !userConfig.tradingWebhook?.webhookUrl)) &&
    userId === "default-trader"
  ) {
    const populated = Object.entries(map).find(
      ([k, v]) => k !== "default-trader" && (v.discordWebhookUrl || v.telegramBotToken || v.tradingWebhook?.webhookUrl)
    );
    if (populated) {
      map["default-trader"] = { ...populated[1] };
      writeJsonFile(WEBHOOKS_FILE, map);
      return map["default-trader"];
    }
  }

  return userConfig;
}

/**
 * Finds user profile and webhook configuration matching a Telegram Chat ID (DEC-141)
 */
export async function findUserByTelegramChatId(chatId: string | number): Promise<{
  userId: string;
  webhooks: AlertWebhookConfig;
} | null> {
  const map = readJsonFile<UserWebhooksMap>(WEBHOOKS_FILE, {});
  const target = String(chatId).trim();
  if (!target) return null;

  for (const [userId, config] of Object.entries(map)) {
    if (config.telegramChatId && String(config.telegramChatId).trim() === target) {
      return { userId, webhooks: config };
    }
  }
  return null;
}

/**
 * Saves webhook configuration for a user and keeps fallback profile synchronized
 */
export async function saveServerWebhooks(
  userId: string,
  config: AlertWebhookConfig
): Promise<AlertWebhookConfig> {
  const map = readJsonFile<UserWebhooksMap>(WEBHOOKS_FILE, {});
  map[userId] = config;

  // Always keep default-trader in sync so unauthenticated browsing doesn't lose credentials
  if (userId !== "default-trader") {
    map["default-trader"] = { ...config };
  }

  writeJsonFile(WEBHOOKS_FILE, map);
  return config;
}

/**
 * Returns alert history logs for a user
 */
export async function getServerAlertLogs(userId: string): Promise<AlertLogEntry[]> {
  const map = readJsonFile<UserAlertLogsMap>(LOGS_FILE, {});
  return map[userId] || [];
}

/**
 * Appends a triggered alert log for a user (capped to latest 100 entries)
 */
export async function appendServerAlertLog(userId: string, log: AlertLogEntry): Promise<void> {
  const map = readJsonFile<UserAlertLogsMap>(LOGS_FILE, {});
  const logs = map[userId] || [];
  // Prepend newest log and cap at 100
  const updatedLogs = [log, ...logs.filter((l) => l.id !== log.id)].slice(0, 100);
  map[userId] = updatedLogs;
  writeJsonFile(LOGS_FILE, map);
}

export interface ActiveAlertContext {
  alert: PriceAlert;
  userId: string;
  webhooks?: AlertWebhookConfig;
}

/**
 * Retrieves all active alerts across all users along with their webhook credentials
 * Used by 24/7 ServerAlertDaemon
 */
export async function getAllActiveServerAlerts(): Promise<ActiveAlertContext[]> {
  const alertsMap = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  const webhooksMap = readJsonFile<UserWebhooksMap>(WEBHOOKS_FILE, {});

  const activeAlerts: ActiveAlertContext[] = [];

  for (const [userId, alerts] of Object.entries(alertsMap)) {
    if (!Array.isArray(alerts)) continue;
    const userWebhooks =
      webhooksMap[userId] ||
      webhooksMap["default-trader"] ||
      Object.values(webhooksMap).find((w) => w && (w.discordWebhookUrl || w.telegramBotToken));

    for (const alert of alerts) {
      if (alert && alert.active) {
        activeAlerts.push({
          alert,
          userId,
          webhooks: userWebhooks,
        });
      }
    }
  }

  return activeAlerts;
}
