import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  computeLatestEma100And200,
  computeLatestEmaLevels,
  buildEmaTouchAlert,
  resolveTimeframeValue,
} from "../src/lib/alerts/ema-alerts";
import {
  detectEmaSetups,
  selectNonDuplicateAutoEmaAlarms,
} from "../src/lib/alerts/auto-ema-engine";
import {
  evaluateAlertsBatch,
  findDuplicateAlerts,
  PriceAlert,
} from "../src/lib/alerts/alerts-engine";
import {
  saveServerAlert,
  getServerAlerts,
} from "../src/lib/alerts/server-alerts-store";
import { ServerAlertDaemon } from "../src/lib/alerts/server-alert-daemon";
import * as multiExchangeClient from "../src/lib/screener/multi-exchange-client";

describe("EMA 100 & EMA 200 Alerts Engine", () => {
  it("computes EMA 100 and EMA 200 with full warmup and handles insufficient bars", () => {
    const shortCloses = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
    expect(computeLatestEma100And200(shortCloses)).toEqual({
      ema100: null,
      ema200: null,
    });

    const midCloses = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5);
    const midResult = computeLatestEma100And200(midCloses);
    expect(midResult.ema100).not.toBeNull();
    expect(midResult.ema200).toBeNull();

    const fullCloses = Array.from({ length: 220 }, (_, i) => 100 + i * 0.25);
    const fullResult = computeLatestEma100And200(fullCloses);
    expect(fullResult.ema100).not.toBeNull();
    expect(fullResult.ema200).not.toBeNull();
    // In a monotonic uptrend, shorter EMA 100 sits above slower EMA 200
    expect(fullResult.ema100!).toBeGreaterThan(fullResult.ema200!);
  });

  it("builds EMA touch alert with automatic SUPPORT/RESISTANCE direction and normalized timeframe", () => {
    const supportAlert = buildEmaTouchAlert({
      idPrefix: "alert",
      symbol: "BTCUSDT",
      timeframe: "240",
      period: 200,
      emaPrice: 82000,
      currentPrice: 85000,
      now: 1700000000000,
    });

    expect(supportAlert.sourceType).toBe("indicator_condition");
    expect(supportAlert.condition).toBe("crossing_down");
    expect(supportAlert.targetPrice).toBe(82000);
    expect(supportAlert.emaMetadata).toEqual({
      period: 200,
      timeframe: "4H",
      direction: "SUPPORT",
      autoArmed: false,
    });

    const resistanceAlert = buildEmaTouchAlert({
      idPrefix: "bulk",
      symbol: "SOLUSDT",
      timeframe: "1H",
      period: 100,
      emaPrice: 165,
      currentPrice: 150,
      now: 1700000000000,
    });

    expect(resistanceAlert.condition).toBe("crossing_up");
    expect(resistanceAlert.emaMetadata).toEqual({
      period: 100,
      timeframe: "1H",
      direction: "RESISTANCE",
      autoArmed: false,
    });
  });

  it("resolves timeframe map keys across canonical and numeric aliases", () => {
    const map = { "240": { ema100: 10, ema200: 9 } };
    expect(resolveTimeframeValue(map, "4H")).toEqual({ ema100: 10, ema200: 9 });
  });

  it("evaluates EMA indicator_condition crossing alerts cleanly in evaluateAlertsBatch", () => {
    const supportAlert = buildEmaTouchAlert({
      symbol: "ETHUSDT",
      timeframe: "4H",
      period: 100,
      emaPrice: 2500,
      currentPrice: 2600,
      now: 1700000000000,
    });

    const resistanceAlert = buildEmaTouchAlert({
      symbol: "SOLUSDT",
      timeframe: "1D",
      period: 200,
      emaPrice: 180,
      currentPrice: 170,
      now: 1700000000000,
    });

    const notTriggeredEth = evaluateAlertsBatch(
      [supportAlert],
      "ETHUSDT",
      2600,
      2550,
      undefined,
      1700000010000
    );
    expect(notTriggeredEth.triggeredLogs).toHaveLength(0);

    const notTriggeredSol = evaluateAlertsBatch(
      [resistanceAlert],
      "SOLUSDT",
      170,
      175,
      undefined,
      1700000010000
    );
    expect(notTriggeredSol.triggeredLogs).toHaveLength(0);

    const triggeredEth = evaluateAlertsBatch(
      [supportAlert],
      "ETHUSDT",
      2550,
      2490,
      undefined,
      1700000020000
    );
    expect(triggeredEth.triggeredLogs).toHaveLength(1);
    expect(triggeredEth.triggeredLogs[0].symbol).toBe("ETHUSDT");
    expect(triggeredEth.updatedAlerts[0].active).toBe(false);

    const triggeredSol = evaluateAlertsBatch(
      [resistanceAlert],
      "SOLUSDT",
      175,
      182,
      undefined,
      1700000020000
    );
    expect(triggeredSol.triggeredLogs).toHaveLength(1);
    expect(triggeredSol.triggeredLogs[0].symbol).toBe("SOLUSDT");
    expect(triggeredSol.updatedAlerts[0].active).toBe(false);
  });

  it("deduplicates EMA 100/200 alerts sharing symbol, timeframe, and trigger price", () => {
    const first = buildEmaTouchAlert({
      symbol: "BTCUSDT",
      timeframe: "4H",
      period: 200,
      emaPrice: 82500,
      currentPrice: 84000,
      now: 1700000000000,
      randSuffix: 1,
    });
    const dup = buildEmaTouchAlert({
      symbol: "BTCUSDT",
      timeframe: "240",
      period: 200,
      emaPrice: 82500,
      currentPrice: 84000,
      now: 1700000005000,
      randSuffix: 2,
    });
    const otherTf = buildEmaTouchAlert({
      symbol: "BTCUSDT",
      timeframe: "1D",
      period: 200,
      emaPrice: 82500,
      currentPrice: 84000,
      now: 1700000006000,
      randSuffix: 3,
    });

    const { duplicateIds } = findDuplicateAlerts([first, dup, otherTf]);
    expect(duplicateIds).toHaveLength(1);
    expect(duplicateIds[0]).toBe(first.id);
  });
});

describe("ServerAlertDaemon EMA 100/200 dynamic refresh", () => {
  const testUserId = "test-user-ema-refresh";
  const dataDir = path.join(process.cwd(), ".data");
  const alertsFile = path.join(dataDir, "alerts.json");
  let originalAlerts: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(alertsFile)) {
      originalAlerts = fs.readFileSync(alertsFile, "utf-8");
    }
  });

  afterEach(() => {
    if (originalAlerts !== null) {
      fs.writeFileSync(alertsFile, originalAlerts, "utf-8");
    } else if (fs.existsSync(alertsFile)) {
      try {
        const map = JSON.parse(fs.readFileSync(alertsFile, "utf-8"));
        delete map[testUserId];
        fs.writeFileSync(alertsFile, JSON.stringify(map, null, 2), "utf-8");
      } catch {}
    }
    vi.restoreAllMocks();
  });

  it("refreshes active EMA 100/200 alert targetPrice as kline candles evolve", async () => {
    const initialAlert: PriceAlert = buildEmaTouchAlert({
      symbol: "BTCUSDT",
      timeframe: "4H",
      period: 200,
      emaPrice: 50000,
      currentPrice: 60000,
      now: Date.now(),
    });

    await saveServerAlert(initialAlert, testUserId);

    const mockKlines = Array.from({ length: 220 }, (_, i) => ({
      time: 1700000000 + i * 14400,
      open: 60000 + i * 10,
      high: 60100 + i * 10,
      low: 59900 + i * 10,
      close: 60000 + i * 10,
      volume: 100,
    }));

    vi.spyOn(multiExchangeClient, "fetchExchangeKlines").mockResolvedValue(mockKlines);

    const daemon = new ServerAlertDaemon();
    await daemon.refreshActiveAlerts();
    await daemon.refreshDynamicEmaTargets();

    const updatedAlerts = await getServerAlerts(testUserId);
    const updated = updatedAlerts.find((a) => a.id === initialAlert.id);
    expect(updated).toBeDefined();
    expect(updated!.targetPrice).not.toBe(50000);
    expect(updated!.targetPrice).toBeGreaterThan(60000);
    expect(updated!.targetPrice).toBeLessThan(62200);
  });
});

describe("Auto EMA 20/50/100/200 Radar Engine", () => {
  it("computes EMA 20/50/100/200, detects setups within maxDistancePct, and deduplicates auto-arms", () => {
    const bars = Array.from({ length: 220 }, (_, i) => ({
      time: 1700000000000 + i * 3600_000,
      open: 100 + i * 0.05,
      high: 100.5 + i * 0.05,
      low: 99.5 + i * 0.05,
      close: 100 + i * 0.05,
      volume: 1000,
    }));

    const levels = computeLatestEmaLevels(bars.map((b) => b.close));
    expect(levels.ema20).not.toBeNull();
    expect(levels.ema50).not.toBeNull();
    expect(levels.ema100).not.toBeNull();
    expect(levels.ema200).not.toBeNull();

    const setups = detectEmaSetups(
      bars,
      {
        symbol: "SOLUSDT",
        name: "Solana",
        category: "majors",
        mexcRank: 2,
        mexcPrice: bars[bars.length - 1].close,
        mexcVolume24h: 900_000_000,
        mexcChange24h: 2.1,
      },
      "60",
      "bybit",
      { maxDistancePct: 10 }
    );

    expect(setups.map((s) => s.period)).toEqual([20, 50, 100, 200]);
    expect(setups.every((s) => s.timeframe === "1H" && s.exchange === "bybit")).toBe(true);

    const existing = buildEmaTouchAlert({
      idPrefix: "auto",
      symbol: "SOLUSDT",
      timeframe: "1H",
      period: 20,
      emaPrice: levels.ema20!,
      currentPrice: bars[bars.length - 1].close,
      exchange: "bybit",
    });

    const { alertsToArm, skippedDuplicatesCount } = selectNonDuplicateAutoEmaAlarms(
      setups,
      [existing]
    );
    expect(skippedDuplicatesCount).toBe(1);
    expect(alertsToArm).toHaveLength(3);
    expect(alertsToArm.every((a) => a.emaMetadata?.autoArmed === true)).toBe(true);
  });
});
