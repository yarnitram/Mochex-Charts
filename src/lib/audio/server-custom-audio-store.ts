/**
 * Server-Side Custom Audio Cloud Persistence (DEC-147)
 *
 * Saves custom audio asset metadata and Base64 payloads into `.data/custom-sounds.json`
 * for 24/7 cross-device synchronization and cloud backup.
 */

import fs from "fs";
import path from "path";
import { CustomSoundAsset } from "./custom-audio-store";

const DATA_DIR = path.join(process.cwd(), ".data");
const CUSTOM_SOUNDS_FILE = path.join(DATA_DIR, "custom-sounds.json");

function ensureDirectory(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[server-custom-audio-store] Could not create .data directory:", err);
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
    console.warn(`[server-custom-audio-store] Error reading ${filePath}:`, err);
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
      console.warn(`[server-custom-audio-store] Error writing ${filePath}:`, writeErr);
    }
  }
}

export type UserCustomSoundsMap = Record<string, CustomSoundAsset[]>;

/**
 * Returns all custom audio assets for a user (or global guest/dev).
 */
export async function getServerCustomSounds(userId: string = "default"): Promise<CustomSoundAsset[]> {
  const map = readJsonFile<UserCustomSoundsMap>(CUSTOM_SOUNDS_FILE, {});
  const userSounds = map[userId] || [];
  return userSounds.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Saves or updates a custom audio asset in cloud storage.
 */
export async function saveServerCustomSound(
  userId: string = "default",
  asset: CustomSoundAsset
): Promise<CustomSoundAsset> {
  const map = readJsonFile<UserCustomSoundsMap>(CUSTOM_SOUNDS_FILE, {});
  const existing = map[userId] || [];
  const filtered = existing.filter((item) => item.id !== asset.id);
  map[userId] = [asset, ...filtered];
  writeJsonFile(CUSTOM_SOUNDS_FILE, map);
  return asset;
}

/**
 * Deletes a custom audio asset from cloud storage.
 */
export async function deleteServerCustomSound(
  userId: string = "default",
  soundId: string
): Promise<void> {
  const map = readJsonFile<UserCustomSoundsMap>(CUSTOM_SOUNDS_FILE, {});
  const existing = map[userId] || [];
  map[userId] = existing.filter((item) => item.id !== soundId);
  writeJsonFile(CUSTOM_SOUNDS_FILE, map);
}
