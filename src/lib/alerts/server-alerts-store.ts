import fs from "fs";
import path from "path";
import { PriceAlert, AlertLogEntry } from "./alerts-engine";
import { AlertWebhookConfig } from "./webhook-dispatcher";

const DATA_DIR = path.join(process.cwd(), ".data");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const WEBHOOKS_FILE = path.join(DATA_DIR, "webhooks.json");
const LOGS_FILE = path.join(DATA_DIR, "alert-logs.json");

function ensureDirectory(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[server-alerts-store] Could not create .data directory:", err);
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  ensureDirectory();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[server-alerts-store] Error reading ${filePath}:`, err);
  }
  return fallback;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDirectory();
  try {
    const tmpPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (writeErr) {
      console.warn(`[server-alerts-store] Error writing ${filePath}:`, writeErr);
    }
  }
}

export type UserAlertsMap = Record<string, PriceAlert[]>;
export type UserWebhooksMap = Record<string, AlertWebhookConfig>;
export type UserAlertLogsMap = Record<string, AlertLogEntry[]>;

/**
 * Returns all alerts created by a user
 */
export async function getServerAlerts(userId: string): Promise<PriceAlert[]> {
  const map = readJsonFile<UserAlertsMap>(ALERTS_FILE, {});
  return map[userId] || [];
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
 * Returns saved webhook configuration for a user
 */
export async function getServerWebhooks(userId: string): Promise<AlertWebhookConfig | null> {
  const map = readJsonFile<UserWebhooksMap>(WEBHOOKS_FILE, {});
  return map[userId] || null;
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
 * Saves webhook configuration for a user
 */
export async function saveServerWebhooks(
  userId: string,
  config: AlertWebhookConfig
): Promise<AlertWebhookConfig> {
  const map = readJsonFile<UserWebhooksMap>(WEBHOOKS_FILE, {});
  map[userId] = config;
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
    const userWebhooks = webhooksMap[userId];

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
