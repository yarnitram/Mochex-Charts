import fs from "fs";
import os from "os";
import path from "path";

const globalMemoryStore = globalThis as unknown as {
  __mochexMemoryDataStore?: Map<string, string>;
  __mochexWarnedDataDirs?: Set<string>;
};

function getMemoryStore(): Map<string, string> {
  if (!globalMemoryStore.__mochexMemoryDataStore) {
    globalMemoryStore.__mochexMemoryDataStore = new Map<string, string>();
  }
  return globalMemoryStore.__mochexMemoryDataStore;
}

function warnOnce(key: string, message: string, err?: unknown): void {
  if (!globalMemoryStore.__mochexWarnedDataDirs) {
    globalMemoryStore.__mochexWarnedDataDirs = new Set<string>();
  }
  if (globalMemoryStore.__mochexWarnedDataDirs.has(key)) return;
  globalMemoryStore.__mochexWarnedDataDirs.add(key);
  console.warn(message, err ?? "");
}

function isDirWritable(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch (err) {
    warnOnce(`unwritable:${dir}`, `[mochex-storage] Directory '${dir}' is not writable, trying fallback:`, err);
    return false;
  }
}

/**
 * Resolves a writable persistence directory for `.data` JSON stores.
 * Checks explicit env overrides first, then `process.cwd()/.data`, and
 * automatically falls back to `os.tmpdir()/mochex-data` in read-only containers
 * (preventing `EACCES: permission denied, mkdir '/app/.data'`).
 */
export function resolveWritableDataDir(): string | null {
  const envDir = (process.env.MOCHEX_DATA_DIR || process.env.DATA_DIR || "").trim();
  const candidates = [
    ...(envDir ? [path.resolve(envDir)] : []),
    path.join(process.cwd(), ".data"),
    path.join(os.tmpdir(), "mochex-data"),
  ];

  for (const dir of candidates) {
    if (isDirWritable(dir)) {
      return dir;
    }
  }
  return null;
}

/**
 * Returns the full path for a persistence JSON file inside the active writable data directory.
 */
export function getDataFilePath(filename: string): string | null {
  const dir = resolveWritableDataDir();
  return dir ? path.join(dir, filename) : null;
}

/**
 * Reads a JSON data file safely with an in-memory fallback if disk is read-only.
 */
export function readJsonData<T>(filename: string, fallback: T, logLabel = "mochex-storage"): T {
  const memStore = getMemoryStore();
  try {
    const filePath = getDataFilePath(filename);
    if (filePath && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as T;
    }
    const memRaw = memStore.get(filename);
    if (memRaw) {
      return JSON.parse(memRaw) as T;
    }
  } catch (err) {
    console.warn(`[${logLabel}] Error reading ${filename}:`, err);
  }
  return fallback;
}

/**
 * Writes a JSON data file atomically into the writable data directory with in-memory fallback.
 * Never throws on container permission errors.
 */
export function writeJsonData<T>(filename: string, data: T, logLabel = "mochex-storage"): boolean {
  const serialized = JSON.stringify(data, null, 2);
  getMemoryStore().set(filename, serialized);

  const filePath = getDataFilePath(filename);
  if (!filePath) {
    warnOnce(`no-disk:${filename}`, `[${logLabel}] No writable directory available; persisted '${filename}' in memory.`);
    return false;
  }

  try {
    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
    fs.writeFileSync(tmpPath, serialized, "utf-8");
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch {
    try {
      fs.writeFileSync(filePath, serialized, "utf-8");
      return true;
    } catch (writeErr) {
      console.warn(`[${logLabel}] Error writing ${filePath}:`, writeErr);
      return false;
    }
  }
}
