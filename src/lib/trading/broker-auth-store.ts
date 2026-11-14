/**
 * Server-Side Broker Credentials Store (DEC-156)
 * Atomic file persistence in .data/broker-credentials.json with user isolation.
 */

import {
  BrokerCredentials,
  MaskedBrokerCredentials,
  SupportedBrokerExchange,
  maskApiKey,
} from "./multi-broker-client";
import { readJsonData, writeJsonData } from "../storage/data-dir";

const BROKER_FILE = "broker-credentials.json";

function readJsonFile<T>(filename: string, fallback: T): T {
  return readJsonData(filename, fallback, "broker-auth-store");
}

function writeJsonFile<T>(filename: string, data: T): void {
  writeJsonData(filename, data, "broker-auth-store");
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
