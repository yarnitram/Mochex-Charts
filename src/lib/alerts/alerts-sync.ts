"use client";

import { PriceAlert } from "./alerts-engine";

const STORAGE_KEY = "mochex:price_alerts";
const DELETED_IDS_KEY = "mochex:deleted_alert_ids";

/**
 * Loads cached alerts from localStorage
 */
export function loadClientAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists alerts to localStorage
 */
export function saveClientAlerts(alerts: PriceAlert[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {}
}

/**
 * Retrieves the set of explicitly deleted alert IDs for the current session
 */
export function getDeletedAlertIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DELETED_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/**
 * Records alert IDs that were intentionally deleted so they don't resurrect
 */
export function recordDeletedAlertIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getDeletedAlertIds();
    ids.forEach((id) => existing.add(id));
    sessionStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(existing)));
  } catch {}
}

/**
 * Resiliently merges local and server alerts:
 * 1. Honors explicit deletions recorded in the active session.
 * 2. Preserves locally created alerts that may not yet have committed to the server.
 * 3. Incorporates alerts from the server.
 */
export function mergeClientAndServerAlerts(
  localAlerts: PriceAlert[],
  serverAlerts: PriceAlert[]
): PriceAlert[] {
  const deletedIds = getDeletedAlertIds();
  const map = new Map<string, PriceAlert>();

  // 1. Add server alerts (if not marked deleted)
  for (const s of serverAlerts) {
    if (s && s.id && !deletedIds.has(s.id)) {
      map.set(s.id, s);
    }
  }

  // 2. Add local alerts (preserve freshly created ones, or update if local is newer)
  for (const l of localAlerts) {
    if (l && l.id && !deletedIds.has(l.id)) {
      if (!map.has(l.id)) {
        map.set(l.id, l);
      } else {
        const existing = map.get(l.id)!;
        if ((l.createdAt || 0) >= (existing.createdAt || 0)) {
          map.set(l.id, { ...existing, ...l });
        }
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Performs a two-way synchronization:
 * - Fetches server alerts
 * - Merges with local storage
 * - If local storage has alerts that server lacks, re-syncs them to server
 * - Updates localStorage and invokes callback
 */
export async function syncAlerts(
  onUpdate?: (alerts: PriceAlert[]) => void
): Promise<PriceAlert[]> {
  const localAlerts = loadClientAlerts();

  try {
    const res = await fetch("/api/alerts");
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const serverAlerts: PriceAlert[] = Array.isArray(data?.alerts) ? data.alerts : [];

      const merged = mergeClientAndServerAlerts(localAlerts, serverAlerts);
      saveClientAlerts(merged);
      onUpdate?.(merged);

      // Two-way self-healing: if local has alerts that the server does not have, restore them to server
      const serverIdSet = new Set(serverAlerts.map((a) => a.id));
      const missingOnServer = merged.filter((a) => !serverIdSet.has(a.id));
      if (missingOnServer.length > 0) {
        fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alerts: missingOnServer }),
        }).catch(() => {});
      }

      return merged;
    }
  } catch (err) {
    console.warn("[alerts-sync] Network sync notice:", err);
  }

  // Fallback if offline/network error: keep local storage intact without wiping anything
  onUpdate?.(localAlerts);
  return localAlerts;
}
