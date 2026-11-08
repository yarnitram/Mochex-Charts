/**
 * Server-Side Broker Credentials Store (DEC-156)
 * Atomic file persistence in .data/broker-credentials.json with user isolation.
 */

import fs from "fs";
import path from "path";
import {
  BrokerCredentials,
  MaskedBrokerCredentials,
  SupportedBrokerExchange,
  maskApiKey,
} from "./multi-broker-client";

const DATA_DIR = path.join(process.cwd(), ".data");
const BROKER_FILE = path.join(DATA_DIR, "broker-credentials.json");

function ensureDirectory(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[broker-auth-store] Could not create .data directory:", err);
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
    console.warn(`[broker-auth-store] Error reading ${filePath}:`, err);
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
      console.warn(`[broker-auth-store] Error writing ${filePath}:`, writeErr);
    }
  }
}

// User ID -> Exchange -> BrokerCredentials
export type UserBrokerCredentialsMap = Record<
  string,
  Partial<Record<SupportedBrokerExchange, BrokerCredentials>>
>;

/**
 * Returns all active broker credentials for a user.
 */
export async function getServerBrokerCredentials(
  userId: string
): Promise<Partial<Record<SupportedBrokerExchange, BrokerCredentials>>> {
  const map = readJsonFile<UserBrokerCredentialsMap>(BROKER_FILE, {});
  return map[userId] || {};
}

/**
 * Saves or updates credentials for an exchange.
 */
export async function saveServerBrokerCredentials(
  userId: string,
  creds: BrokerCredentials
): Promise<void> {
  const map = readJsonFile<UserBrokerCredentialsMap>(BROKER_FILE, {});
  if (!map[userId]) {
    map[userId] = {};
  }
  map[userId]![creds.exchange] = {
    ...creds,
    updatedAt: Date.now(),
  };
  writeJsonFile(BROKER_FILE, map);
}

/**
 * Removes credentials for an exchange.
 */
export async function deleteServerBrokerCredentials(
  userId: string,
  exchange: SupportedBrokerExchange
): Promise<void> {
  const map = readJsonFile<UserBrokerCredentialsMap>(BROKER_FILE, {});
  if (map[userId] && map[userId]![exchange]) {
    delete map[userId]![exchange];
    writeJsonFile(BROKER_FILE, map);
  }
}

/**
 * Returns safe masked credentials for client display.
 */
export async function getMaskedBrokerCredentials(
  userId: string
): Promise<Partial<Record<SupportedBrokerExchange, MaskedBrokerCredentials>>> {
  const userCreds = await getServerBrokerCredentials(userId);
  const result: Partial<Record<SupportedBrokerExchange, MaskedBrokerCredentials>> = {};

  (Object.keys(userCreds) as SupportedBrokerExchange[]).forEach((ex) => {
    const c = userCreds[ex];
    if (c) {
      result[ex] = {
        exchange: ex,
        apiKeyMasked: maskApiKey(c.apiKey),
        hasSecret: Boolean(c.apiSecret && c.apiSecret.length > 0),
        testnet: Boolean(c.testnet),
        label: c.label,
        updatedAt: c.updatedAt,
      };
    }
  });

  return result;
}
