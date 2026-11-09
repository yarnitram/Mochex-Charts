import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mergeClientAndServerAlerts,
  recordDeletedAlertIds,
  getDeletedAlertIds,
} from "../src/lib/alerts/alerts-sync";
import { PriceAlert } from "../src/lib/alerts/alerts-engine";

describe("Alerts Resilient Sync & Merge Module", () => {
  beforeEach(() => {
    const sessionMap = new Map<string, string>();
    const localMap = new Map<string, string>();

    const makeStorage = (m: Map<string, string>) => ({
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => m.set(k, String(v)),
      removeItem: (k: string) => m.delete(k),
      clear: () => m.clear(),
    });

    (globalThis as any).window = globalThis;
    (globalThis as any).sessionStorage = makeStorage(sessionMap);
    (globalThis as any).localStorage = makeStorage(localMap);
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).sessionStorage;
    delete (globalThis as any).localStorage;
  });

  it("merges client and server alerts without dropping local alerts", () => {
    const localAlert: PriceAlert = {
      id: "local-1",
      symbol: "BTCUSDT",
      targetPrice: 65000,
      condition: "crossing_up",
      frequency: "only_once",
      sourceType: "price",
      label: "BTC Cross Up",
      triggeredCount: 0,
      active: true,
      createdAt: 1000,
    };

    const serverAlert: PriceAlert = {
      id: "server-1",
      symbol: "ETHUSDT",
      targetPrice: 3500,
      condition: "crossing_down",
      frequency: "only_once",
      sourceType: "price",
      label: "ETH Cross Down",
      triggeredCount: 0,
      active: true,
      createdAt: 1000,
    };

    const merged = mergeClientAndServerAlerts([localAlert], [serverAlert]);
    expect(merged.length).toBe(2);
    expect(merged.find((a) => a.id === "local-1")).toBeDefined();
    expect(merged.find((a) => a.id === "server-1")).toBeDefined();
  });

  it("honors explicitly deleted alert IDs and prevents resurrection", () => {
    recordDeletedAlertIds(["deleted-1"]);
    expect(getDeletedAlertIds().has("deleted-1")).toBe(true);

    const resurrectedServerAlert: PriceAlert = {
      id: "deleted-1",
      symbol: "SOLUSDT",
      targetPrice: 150,
      condition: "crossing_up",
      frequency: "only_once",
      sourceType: "price",
      label: "SOL Alert",
      triggeredCount: 0,
      active: true,
      createdAt: 500,
    };

    const validServerAlert: PriceAlert = {
      id: "valid-1",
      symbol: "AVAXUSDT",
      targetPrice: 25,
      condition: "crossing_up",
      frequency: "only_once",
      sourceType: "price",
      label: "AVAX Alert",
      triggeredCount: 0,
      active: true,
      createdAt: 600,
    };

    const merged = mergeClientAndServerAlerts([], [resurrectedServerAlert, validServerAlert]);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("valid-1");
  });

  it("preserves newer updates from client when timestamps match or exceed server", () => {
    const serverAlert: PriceAlert = {
      id: "alert-1",
      symbol: "DOGEUSDT",
      targetPrice: 0.15,
      condition: "crossing_up",
      frequency: "only_once",
      sourceType: "price",
      label: "DOGE Alert",
      triggeredCount: 0,
      active: false,
      createdAt: 1000,
    };

    const localAlert: PriceAlert = {
      id: "alert-1",
      symbol: "DOGEUSDT",
      targetPrice: 0.15,
      condition: "crossing_up",
      frequency: "only_once",
      sourceType: "price",
      label: "DOGE Alert",
      triggeredCount: 0,
      active: true, // User resumed it locally
      createdAt: 1050,
    };

    const merged = mergeClientAndServerAlerts([localAlert], [serverAlert]);
    expect(merged.length).toBe(1);
    expect(merged[0].active).toBe(true);
  });
});
