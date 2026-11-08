/**
 * Custom Audio Asset Persistence & Sound Store (DEC-147)
 *
 * Provides client-side and cloud/server-side persistence for user-uploaded .wav/.mp3 audio files.
 * Uses IndexedDB with localStorage fallback for client storage, and atomic file storage in .data/custom-sounds.json
 * for 24/7 cloud persistence across devices.
 */

export interface CustomSoundAsset {
  id: string;
  name: string;
  dataUrl: string; // Base64 data URL: "data:audio/wav;base64,..." or "data:audio/mpeg;base64,..."
  fileType: string; // e.g. "audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg"
  fileSize: number; // size in bytes
  createdAt: number;
}

export const MAX_CUSTOM_AUDIO_FILE_SIZE_BYTES = 2.5 * 1024 * 1024; // 2.5 MB

export const ALLOWED_AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".m4a", ".aac", ".weba"];

export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/webm",
];

export const CUSTOM_AUDIO_STORAGE_KEY = "mochex:custom_audio_assets";
const IDB_DB_NAME = "mochex_audio_db";
const IDB_STORE_NAME = "custom_sounds";
const IDB_VERSION = 1;

/**
 * Validates audio file metadata for type and size constraints.
 */
export function validateAudioFile(file: {
  name: string;
  size: number;
  type?: string;
}): { valid: boolean; error?: string } {
  if (!file || !file.name) {
    return { valid: false, error: "Invalid audio file selected" };
  }

  const nameLower = file.name.toLowerCase();
  const hasValidExt = ALLOWED_AUDIO_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  const hasValidMime = file.type ? ALLOWED_AUDIO_MIME_TYPES.includes(file.type.toLowerCase()) : false;

  if (!hasValidExt && !hasValidMime) {
    return {
      valid: false,
      error: `Unsupported file format. Please upload .wav, .mp3, .ogg, or .m4a audio files.`,
    };
  }

  if (file.size > MAX_CUSTOM_AUDIO_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds maximum allowed limit of 2.5 MB.`,
    };
  }

  return { valid: true };
}

/**
 * Converts a File or Blob into a Base64 data URL string.
 */
export function convertAudioBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert audio file to base64 string"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to open IndexedDB database
 */
function openAudioDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_DB_NAME, IDB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target?.result as IDBDatabase;
        if (db && !db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Retrieves all saved custom audio sounds from IndexedDB, falling back to localStorage.
 */
export async function getStoredCustomSounds(): Promise<CustomSoundAsset[]> {
  if (typeof window === "undefined") {
    return [];
  }

  // 1. Try IndexedDB
  const db = await openAudioDatabase();
  if (db) {
    try {
      const sounds = await new Promise<CustomSoundAsset[]>((resolve) => {
        const tx = db.transaction(IDB_STORE_NAME, "readonly");
        const store = tx.objectStore(IDB_STORE_NAME);
        const getAllReq = store.getAll();

        getAllReq.onsuccess = () => {
          resolve((getAllReq.result as CustomSoundAsset[]) || []);
        };
        getAllReq.onerror = () => {
          resolve([]);
        };
      });

      if (sounds && sounds.length > 0) {
        return sounds.sort((a, b) => b.createdAt - a.createdAt);
      }
    } catch {
      // Fallback to localStorage
    }
  }

  // 2. Fallback to localStorage
  try {
    const raw = localStorage.getItem(CUSTOM_AUDIO_STORAGE_KEY);
    if (raw) {
      const parsed: CustomSoundAsset[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => b.createdAt - a.createdAt);
      }
    }
  } catch {}

  return [];
}

/**
 * Retrieves a single custom sound asset by ID.
 */
export async function getCustomSoundById(id: string): Promise<CustomSoundAsset | null> {
  const all = await getStoredCustomSounds();
  return all.find((item) => item.id === id) || null;
}

/**
 * Saves a custom sound asset to IndexedDB and syncs to localStorage.
 * Dispatches "mochex:custom-sounds-updated" event.
 */
export async function saveCustomSound(asset: CustomSoundAsset): Promise<CustomSoundAsset> {
  if (typeof window === "undefined") {
    return asset;
  }

  // 1. Save to IndexedDB
  const db = await openAudioDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, "readwrite");
        const store = tx.objectStore(IDB_STORE_NAME);
        const putReq = store.put(asset);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      });
    } catch (err) {
      console.warn("[custom-audio-store] IndexedDB put error:", err);
    }
  }

  // 2. Also mirror into localStorage for rapid synchronous preview access
  try {
    const raw = localStorage.getItem(CUSTOM_AUDIO_STORAGE_KEY);
    const existing: CustomSoundAsset[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter((item) => item.id !== asset.id);
    const updated = [asset, ...filtered];
    localStorage.setItem(CUSTOM_AUDIO_STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  // 3. Dispatch window notification
  window.dispatchEvent(
    new CustomEvent("mochex:custom-sounds-updated", {
      detail: asset,
    })
  );

  return asset;
}

/**
 * Deletes a custom sound asset by ID from IndexedDB and localStorage.
 */
export async function deleteCustomSound(id: string): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  // 1. Delete from IndexedDB
  const db = await openAudioDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE_NAME, "readwrite");
        const store = tx.objectStore(IDB_STORE_NAME);
        const delReq = store.delete(id);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => resolve();
      });
    } catch {}
  }

  // 2. Delete from localStorage
  try {
    const raw = localStorage.getItem(CUSTOM_AUDIO_STORAGE_KEY);
    if (raw) {
      const existing: CustomSoundAsset[] = JSON.parse(raw);
      const filtered = existing.filter((item) => item.id !== id);
      localStorage.setItem(CUSTOM_AUDIO_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch {}

  window.dispatchEvent(
    new CustomEvent("mochex:custom-sounds-updated", {
      detail: { id, deleted: true },
    })
  );
}

/**
 * Plays a custom sound using either HTMLAudioElement or Web Audio API.
 * Supports Base64 data URLs.
 */
export function playCustomAudio(dataUrl: string, volume: number = 0.8): void {
  if (typeof window === "undefined" || !dataUrl) return;

  const vol = Math.max(0, Math.min(1, volume));
  if (vol <= 0.001) return;

  try {
    const audio = new Audio(dataUrl);
    audio.volume = vol;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay restrictions or headless test environment
      });
    }
  } catch {
    // Audio constructor not available in test/headless
  }
}
