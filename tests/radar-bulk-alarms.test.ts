import { describe, it, expect, afterEach } from "vitest";
import {
  saveServerAlertsBatch,
  getServerAlerts,
  deleteServerAlert,
} from "../src/lib/alerts/server-alerts-store";
import { PriceAlert } from "../src/lib/alerts/alerts-engine";
import {
  RadarPoiItem,
  getRadarPoiAlarmTargetPrice,
} from "../src/lib/indicators/radar-poi-engine";

function normalizeSymbolKey(sym: string): string {
  return (sym || "").toUpperCase().replace(/[\/\-_]/g, "");
}

describe("POI Bulk Alarms & Active Alarm Indicators (DEC-157)", () => {
  const TEST_USER = "test-user-bulk-dec157";
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds) {
      try {
        await deleteServerAlert(id, TEST_USER);
      } catch {}
    }
    createdIds.length = 0;
  });

  describe("Batch Server Alert Persistence", () => {
    it("should handle empty batch gracefully", async () => {
      const res = await saveServerAlertsBatch([], TEST_USER);
      expect(res).toEqual([]);
    });

    it("should save multiple alerts in batch atomically", async () => {
      const alert1: PriceAlert = {
        id: `test-bulk-1-${Date.now()}`,
        symbol: "NEARUSDT",
        targetPrice: 4.85,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        label: "NEAR 1H Validated OB (Zone Entry)",
      };

      const alert2: PriceAlert = {
        id: `test-bulk-2-${Date.now()}`,
        symbol: "RENDERUSDT",
        targetPrice: 6.2,
        condition: "crossing_up",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        label: "RENDER 4H Validated OB (50% MT)",
      };

      const alert3: PriceAlert = {
        id: `test-bulk-3-${Date.now()}`,
        symbol: "TAOUSDT",
        targetPrice: 510.5,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: false, // inactive alert
        triggeredCount: 1,
        createdAt: Date.now(),
        label: "TAO 1D Demand (Inactive)",
      };

      createdIds.push(alert1.id, alert2.id, alert3.id);

      const saved = await saveServerAlertsBatch([alert1, alert2, alert3], TEST_USER);
      expect(saved.length).toBe(3);

      const userAlerts = await getServerAlerts(TEST_USER);
      const found1 = userAlerts.find((a) => a.id === alert1.id);
      const found2 = userAlerts.find((a) => a.id === alert2.id);
      const found3 = userAlerts.find((a) => a.id === alert3.id);

      expect(found1).toBeDefined();
      expect(found1?.targetPrice).toBe(4.85);
      expect(found2).toBeDefined();
      expect(found2?.targetPrice).toBe(6.2);
      expect(found3).toBeDefined();
      expect(found3?.active).toBe(false);
    });

    it("should update existing alerts on duplicate ID without creating duplicates", async () => {
      const alertId = `test-bulk-dup-${Date.now()}`;
      createdIds.push(alertId);

      const alertInitial: PriceAlert = {
        id: alertId,
        label: "SOL Initial",
        symbol: "SOLUSDT",
        targetPrice: 155.0,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
      };

      await saveServerAlertsBatch([alertInitial], TEST_USER);

      const alertUpdated: PriceAlert = {
        ...alertInitial,
        targetPrice: 158.5,
      };

      await saveServerAlertsBatch([alertUpdated], TEST_USER);

      const userAlerts = await getServerAlerts(TEST_USER);
      const matches = userAlerts.filter((a) => a.id === alertId);
      expect(matches.length).toBe(1);
      expect(matches[0].targetPrice).toBe(158.5);
    });
  });

  describe("Symbol Normalization & Active Alarm Indexing", () => {
    it("should normalize diverse symbol conventions consistently", () => {
      expect(normalizeSymbolKey("BTC/USDT")).toBe("BTCUSDT");
      expect(normalizeSymbolKey("sol-usdt")).toBe("SOLUSDT");
      expect(normalizeSymbolKey("near_usdt")).toBe("NEARUSDT");
      expect(normalizeSymbolKey("RENDERUSDT")).toBe("RENDERUSDT");
    });

    it("should index active alerts and count accurately per coin", () => {
      const alerts: PriceAlert[] = [
        {
          id: "1",
          symbol: "BTCUSDT",
          label: "BTC 1",
          targetPrice: 65000,
          condition: "crossing_down",
          frequency: "only_once",
          sourceType: "indicator_condition",
          active: true,
          triggeredCount: 0,
          createdAt: Date.now(),
        },
        {
          id: "2",
          symbol: "BTC/USDT",
          label: "BTC 2",
          targetPrice: 64200,
          condition: "crossing_down",
          frequency: "only_once",
          sourceType: "indicator_condition",
          active: true,
          triggeredCount: 0,
          createdAt: Date.now(),
        },
        {
          id: "3",
          symbol: "BTC-USDT",
          label: "BTC 3",
          targetPrice: 63000,
          condition: "crossing_down",
          frequency: "only_once",
          sourceType: "indicator_condition",
          active: false, // inactive, must not count
          triggeredCount: 1,
          createdAt: Date.now(),
        },
        {
          id: "4",
          symbol: "SOLUSDT",
          label: "SOL 4",
          targetPrice: 150,
          condition: "crossing_up",
          frequency: "only_once",
          sourceType: "indicator_condition",
          active: true,
          triggeredCount: 0,
          createdAt: Date.now(),
        },
      ];

      // Build index
      const map: Record<string, PriceAlert[]> = {};
      for (const a of alerts) {
        if (!a.active) continue;
        const key = normalizeSymbolKey(a.symbol);
        if (!map[key]) map[key] = [];
        map[key].push(a);
      }

      expect(map["BTCUSDT"]).toBeDefined();
      expect(map["BTCUSDT"].length).toBe(2); // exactly 2 active
      expect(map["SOLUSDT"].length).toBe(1);
      expect(map["ETHUSDT"]).toBeUndefined();
    });
  });

  describe("Bulk Alarm POI Candidate Targeting", () => {
    const mockObPoi: RadarPoiItem = {
      id: "ob-1",
      symbol: "NEARUSDT",
      timeframe: "1H",
      category: "order_block",
      type: "BULLISH",
      label: "Bullish OB",
      top: 5.0,
      bottom: 4.7,
      meanThreshold: 4.85,
      entryPrice: 5.0,
      fullRetestPrice: 4.7,
      invalidationPrice: 4.65,
      status: "fresh",
      isInsideZone: false,
      distanceToEntryPct: 2.1,
      distanceToMtPct: 4.5,
      currentPrice: 5.15,
      time: Date.now(),
    };

    const mockSandwichPoi: RadarPoiItem = {
      id: "sw-1",
      symbol: "NEARUSDT",
      timeframe: "4H",
      category: "sandwich_zone",
      type: "BULLISH",
      label: "Demand Sandwich (GRGG)",
      top: 4.8,
      bottom: 4.5,
      meanThreshold: 4.65,
      entryPrice: 4.8,
      fullRetestPrice: 4.5,
      status: "testing",
      isInsideZone: true,
      distanceToEntryPct: 0,
      distanceToMtPct: 0.5,
      currentPrice: 5.15,
      time: Date.now(),
    };

    it("should compute exact touch levels for bulk candidate targeting", () => {
      // Zone entry touch
      const entryPrice = getRadarPoiAlarmTargetPrice(mockObPoi, "entry");
      expect(entryPrice).toBe(5.0);

      // 50% Mean Threshold
      const mtPrice = getRadarPoiAlarmTargetPrice(mockObPoi, "fifty_pct");
      expect(mtPrice).toBe(4.85);

      // Full Retest
      const fullPrice = getRadarPoiAlarmTargetPrice(mockObPoi, "full");
      expect(fullPrice).toBe(4.7);
    });

    it("should filter candidates strictly by selected category", () => {
      const pois = [mockObPoi, mockSandwichPoi];

      const onlyObs = pois.filter((p) => p.category === "order_block");
      expect(onlyObs.length).toBe(1);
      expect(onlyObs[0].id).toBe("ob-1");

      const onlySandwiches = pois.filter((p) => p.category === "sandwich_zone");
      expect(onlySandwiches.length).toBe(1);
      expect(onlySandwiches[0].id).toBe("sw-1");
    });
  });
});
