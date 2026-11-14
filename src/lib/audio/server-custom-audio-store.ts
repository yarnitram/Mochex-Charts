/**
 * Server-Side Custom Audio Cloud Persistence (DEC-147)
 *
 * Saves custom audio asset metadata and Base64 payloads into `.data/custom-sounds.json`
 * for 24/7 cross-device synchronization and cloud backup.
 */

import { CustomSoundAsset } from "./custom-audio-store";
import { readJsonData, writeJsonData } from "../storage/data-dir";

const CUSTOM_SOUNDS_FILE = "custom-sounds.json";

function readJsonFile<T>(filename: string, fallback: T): T {
  return readJsonData(filename, fallback, "server-custom-audio-store");
}

function writeJsonFile<T>(filename: string, data: T): void {
  writeJsonData(filename, data, "server-custom-audio-store");
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
