import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PriceAlert } from "@/lib/alerts/alerts-engine";
import {
  saveServerAlertsBatch,
  updateServerAlertsBatch,
  deleteServerAlertsBatch,
  getServerAlerts,
} from "@/lib/alerts/server-alerts-store";
import fs from "fs";
import path from "path";

describe("DEC-158: Radar Alerts Page & Separation Suite", () => {
  const testUserId = "test-user-dec-158";

  // Clean test store before and after
  beforeEach(async () => {
    const dataDir = path.join(process.cwd(), ".data");
    const alertsFile = path.join(dataDir, "alerts.json");
    if (fs.existsSync(alertsFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(alertsFile, "utf-8"));
        delete raw[testUserId];
        fs.writeFileSync(alertsFile, JSON.stringify(raw, null, 2));
      } catch {}
    }
  });

  afterEach(async () => {
    const dataDir = path.join(process.cwd(), ".data");
    const alertsFile = path.join(dataDir, "alerts.json");
    if (fs.existsSync(alertsFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(alertsFile, "utf-8"));
        delete raw[testUserId];
        fs.writeFileSync(alertsFile, JSON.stringify(raw, null, 2));
      } catch {}
    }
  });

  // 1. Separation of Chart Alerts vs Radar POI Alarms
  it("strictly separates Chart Drawing/Level alerts from Radar POI alarms", () => {
    const mixedAlerts: PriceAlert[] = [
      {
        id: "alert-chart-1",
        symbol: "BTCUSDT",
        targetPrice: 65000,
        condition: "crossing_up",
        frequency: "only_once",
        sourceType: "price",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        label: "BTC 65k Resistance",
      },
      {
        id: "alert-draw-2",
        symbol: "ETHUSDT",
        targetPrice: 3200,
        condition: "crossing",
        frequency: "only_once",
        sourceType: "price",
        drawingId: "trendline-123",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        label: "Trendline Break",
      },
      {
        id: "bulk-poi-SOLUSDT-1H-order_block-entry-123",
        symbol: "SOLUSDT",
        targetPrice: 155,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        label: "SOL 1H Validated OB (Zone Entry)",
        poiMetadata: {
          poiId: "ob-sol-1",
          category: "order_block",
          direction: "BULLISH",
          timeframe: "1H",
          zoneTop: 156,
          zoneBottom: 154,
        },
      },
      {
        id: "alert-poi-NEARUSDT-4H-sandwich-456",
        symbol: "NEARUSDT",
        targetPrice: 5.2,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 1,
        createdAt: Date.now(),
        label: "NEAR 4H Sandwich Zone ++",
        poiMetadata: {
          poiId: "sw-near-1",
          category: "sandwich_zone",
          direction: "BULLISH",
          timeframe: "4H",
          zoneTop: 5.3,
          zoneBottom: 5.1,
        },
      },
    ];

    const isRadarAlert = (a: PriceAlert) =>
      Boolean(a.poiMetadata || a.id.startsWith("alert-poi-") || a.id.startsWith("bulk-poi-"));

    const chartAlerts = mixedAlerts.filter((a) => !isRadarAlert(a));
    const radarAlerts = mixedAlerts.filter(isRadarAlert);

    expect(chartAlerts).toHaveLength(2);
    expect(chartAlerts.map((a) => a.id)).toEqual(["alert-chart-1", "alert-draw-2"]);

    expect(radarAlerts).toHaveLength(2);
    expect(radarAlerts.map((a) => a.id)).toEqual([
      "bulk-poi-SOLUSDT-1H-order_block-entry-123",
      "alert-poi-NEARUSDT-4H-sandwich-456",
    ]);

    // Ensure mutually exclusive
    const intersection = chartAlerts.filter((c) => radarAlerts.some((r) => r.id === c.id));
    expect(intersection).toHaveLength(0);
  });

  // 2. Multi-Alarm Counting vs Unique Coins Counting (Fixes "only 20 alarms" confusion)
  it("distinguishes total alarms count from unique coins count correctly", () => {
    // 20 coins, each having 3 alarms (OB, Sandwich, FVG) = 60 total alarms
    const coins = Array.from({ length: 20 }, (_, i) => `COIN${i + 1}USDT`);
    const alarms: PriceAlert[] = [];

    coins.forEach((sym) => {
      // 1 OB alarm
      alarms.push({
        id: `bulk-poi-${sym}-1H-order_block-entry`,
        label: `${sym} 1H OB`,
        symbol: sym,
        targetPrice: 100,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        poiMetadata: {
          poiId: `ob-${sym}`,
          category: "order_block",
          direction: "BULLISH",
          timeframe: "1H",
          zoneTop: 102,
          zoneBottom: 98,
        },
      });
      // 1 Sandwich alarm
      alarms.push({
        id: `bulk-poi-${sym}-4H-sandwich_zone-entry`,
        label: `${sym} 4H Sandwich`,
        symbol: sym,
        targetPrice: 95,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        poiMetadata: {
          poiId: `sw-${sym}`,
          category: "sandwich_zone",
          direction: "BULLISH",
          timeframe: "4H",
          zoneTop: 96,
          zoneBottom: 94,
        },
      });
      // 1 FVG alarm
      alarms.push({
        id: `bulk-poi-${sym}-15m-fvg-entry`,
        label: `${sym} 15m FVG`,
        symbol: sym,
        targetPrice: 90,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        poiMetadata: {
          poiId: `fvg-${sym}`,
          category: "fvg",
          direction: "BULLISH",
          timeframe: "15m",
          zoneTop: 91,
          zoneBottom: 89,
        },
      });
    });

    const totalAlarmsCount = alarms.length;
    const uniqueSymbols = new Set(alarms.map((a) => a.symbol.toUpperCase().replace(/[\/\-_]/g, "")));
    const uniqueCoinsCount = uniqueSymbols.size;

    expect(totalAlarmsCount).toBe(60);
    expect(uniqueCoinsCount).toBe(20);
    expect(totalAlarmsCount).not.toBe(uniqueCoinsCount);
  });

  // 3. Timeframe Mapping & POI lookup ("1H" <-> "60", "4H" <-> "240")
  it("resolves POIs across timeframe variations without missing alarms", () => {
    function getPoisForTf(
      poisByTimeframe: Record<string, any[]> | undefined,
      tf: string
    ): any[] {
      if (!poisByTimeframe) return [];
      if (Array.isArray(poisByTimeframe[tf]) && poisByTimeframe[tf].length > 0) {
        return poisByTimeframe[tf];
      }
      const tfMap: Record<string, string[]> = {
        "15m": ["15m", "15"],
        "60": ["60", "1H", "1h", "60m"],
        "1H": ["1H", "60", "1h", "60m"],
        "240": ["240", "4H", "4h", "240m"],
        "4H": ["4H", "240", "4h", "240m"],
        "1D": ["1D", "1d", "D", "1440"],
      };
      const alternatives = tfMap[tf] || [];
      for (const alt of alternatives) {
        if (Array.isArray(poisByTimeframe[alt]) && poisByTimeframe[alt].length > 0) {
          return poisByTimeframe[alt];
        }
      }
      return [];
    }

    // Mock radar data where API returned keys "60" and "240"
    const apiPoisByTimeframe = {
      "15m": [{ id: "poi-15m", category: "fvg" }],
      "60": [{ id: "poi-1h", category: "order_block" }],
      "240": [{ id: "poi-4h", category: "sandwich_zone" }],
      "1D": [{ id: "poi-1d", category: "order_block" }],
    };

    // User selected "1H" in modal
    const result1H = getPoisForTf(apiPoisByTimeframe, "1H");
    expect(result1H).toHaveLength(1);
    expect(result1H[0].id).toBe("poi-1h");

    // User selected "4H" in modal
    const result4H = getPoisForTf(apiPoisByTimeframe, "4H");
    expect(result4H).toHaveLength(1);
    expect(result4H[0].id).toBe("poi-4h");

    // Direct key "15m" and "1D"
    expect(getPoisForTf(apiPoisByTimeframe, "15m")).toHaveLength(1);
    expect(getPoisForTf(apiPoisByTimeframe, "1D")).toHaveLength(1);
  });

  // 4. Batch Operations in server-alerts-store (Batch Save, Batch Update, Batch Delete)
  it("executes batch save, batch update, and batch delete in server store", async () => {
    const batch: PriceAlert[] = [
      {
        id: "test-bulk-1",
        label: "RENDER 1H OB",
        symbol: "RENDERUSDT",
        targetPrice: 6.5,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        poiMetadata: {
          poiId: "ob-render",
          category: "order_block",
          direction: "BULLISH",
          timeframe: "1H",
          zoneTop: 6.6,
          zoneBottom: 6.4,
        },
      },
      {
        id: "test-bulk-2",
        label: "TAO 4H Sandwich",
        symbol: "TAOUSDT",
        targetPrice: 550,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        poiMetadata: {
          poiId: "sw-tao",
          category: "sandwich_zone",
          direction: "BULLISH",
          timeframe: "4H",
          zoneTop: 560,
          zoneBottom: 540,
        },
      },
      {
        id: "test-bulk-3",
        label: "FET 15m FVG",
        symbol: "FETUSDT",
        targetPrice: 1.4,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        poiMetadata: {
          poiId: "fvg-fet",
          category: "fvg",
          direction: "BULLISH",
          timeframe: "15m",
          zoneTop: 1.42,
          zoneBottom: 1.38,
        },
      },
    ];

    // 1. Batch Save
    const saved = await saveServerAlertsBatch(batch, testUserId);
    expect(saved).toHaveLength(3);

    const loaded = await getServerAlerts(testUserId);
    expect(loaded).toHaveLength(3);

    // 2. Batch Update: Pause first two alerts
    const updatedCount = await updateServerAlertsBatch(
      ["test-bulk-1", "test-bulk-2"],
      { active: false },
      testUserId
    );
    expect(updatedCount).toBe(2);

    const afterUpdate = await getServerAlerts(testUserId);
    const alert1 = afterUpdate.find((a) => a.id === "test-bulk-1");
    const alert2 = afterUpdate.find((a) => a.id === "test-bulk-2");
    const alert3 = afterUpdate.find((a) => a.id === "test-bulk-3");

    expect(alert1?.active).toBe(false);
    expect(alert2?.active).toBe(false);
    expect(alert3?.active).toBe(true);

    // 3. Batch Delete: Delete alert1 and alert3
    const deletedCount = await deleteServerAlertsBatch(
      ["test-bulk-1", "test-bulk-3"],
      testUserId
    );
    expect(deletedCount).toBe(2);

    const remaining = await getServerAlerts(testUserId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("test-bulk-2");
  });

  // 5. Unauthenticated fallback user ("default-trader") persistence
  it("persists and retrieves alerts for default-trader session without 401 exceptions", async () => {
    const defaultUserId = "default-trader";
    const sampleAlert: PriceAlert = {
      id: "bulk-poi-SOLUSDT-1H-order_block-entry-default",
      symbol: "SOLUSDT",
      label: "SOL 1H OB (Zone Entry)",
      targetPrice: 155.5,
      condition: "crossing_down",
      frequency: "only_once",
      sourceType: "indicator_condition",
      active: true,
      triggeredCount: 0,
      createdAt: Date.now(),
      poiMetadata: {
        poiId: "ob-sol-default",
        category: "order_block",
        direction: "BULLISH",
        timeframe: "1H",
        zoneTop: 156,
        zoneBottom: 154,
      },
    };

    await saveServerAlertsBatch([sampleAlert], defaultUserId);
    const loaded = await getServerAlerts(defaultUserId);
    const found = loaded.find((a) => a.id === sampleAlert.id);

    expect(found).toBeDefined();
    expect(found?.symbol).toBe("SOLUSDT");
    expect(found?.targetPrice).toBe(155.5);

    // Clean up
    await deleteServerAlertsBatch([sampleAlert.id], defaultUserId);
  });
});

