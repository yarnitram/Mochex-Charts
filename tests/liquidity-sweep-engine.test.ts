import { describe, it, expect } from "vitest";
import {
  detectPoiLiquiditySweep,
  LiquiditySweepInfo,
} from "../src/lib/indicators/liquidity-sweep-engine";
import {
  computeRadarPois,
  RadarPoiItem,
} from "../src/lib/indicators/radar-poi-engine";
import {
  generateRadarCsv,
  generateRadarJson,
  generateRadarClipboardMarkdown,
  ExportableRadarItem,
} from "../src/lib/screener/radar-export";
import { formatTelegramRadarReport } from "../src/lib/telegram/telegram-bot-engine";
import { CandlestickBar } from "../src/lib/mexc/types";

describe("Liquidity Sweep & Fakeout Detection Engine (DEC-145)", () => {
  const baseTime = 1700000000000;
  const barInterval = 15 * 60 * 1000;

  describe("detectPoiLiquiditySweep unit tests", () => {
    it("returns null on insufficient or empty bar history", () => {
      expect(
        detectPoiLiquiditySweep([], {
          type: "BULLISH",
          top: 100,
          bottom: 95,
          meanThreshold: 97.5,
        })
      ).toBeNull();

      const shortBars: CandlestickBar[] = [
        { time: baseTime, open: 100, high: 102, low: 99, close: 101, volume: 10 },
        { time: baseTime + barInterval, open: 101, high: 103, low: 100, close: 102, volume: 10 },
      ];
      expect(
        detectPoiLiquiditySweep(shortBars, {
          type: "BULLISH",
          top: 100,
          bottom: 95,
          meanThreshold: 97.5,
        })
      ).toBeNull();
    });

    it("detects Bullish Demand Sweep (wick below zone bottom, close back inside zone with >= 25% lower wick)", () => {
      // Demand Zone: Bottom = 100, Top = 105
      // Bar low = 98 (sweeps below 100 by 2% -> <= 3.5% max depth)
      // Open = 101, Close = 103, High = 104
      // Total range = 104 - 98 = 6
      // Lower wick = min(open, close) - low = 101 - 98 = 3
      // Lower wick % = (3 / 6) * 100 = 50% (>= 25%)
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 106, high: 108, low: 105, close: 107, volume: 50 },
        { time: baseTime + barInterval, open: 107, high: 107, low: 102, close: 102, volume: 60 },
        { time: baseTime + barInterval * 2, open: 101, high: 104, low: 98, close: 103, volume: 120 },
      ];

      const sweep = detectPoiLiquiditySweep(bars, {
        type: "BULLISH",
        top: 105,
        bottom: 100,
        meanThreshold: 102.5,
      });

      expect(sweep).not.toBeNull();
      expect(sweep?.isSweep).toBe(true);
      expect(sweep?.type).toBe("BULLISH_SWEEP");
      expect(sweep?.sweepPrice).toBe(98);
      expect(sweep?.closePrice).toBe(103);
      expect(sweep?.sweepDepthPct).toBe(2.0);
      expect(sweep?.rejectionWickPct).toBe(50.0);
      expect(sweep?.label).toContain("Bullish Demand Sweep");
    });

    it("detects Bearish Supply Sweep (wick above zone top, close back inside zone with >= 25% upper wick)", () => {
      // Supply Zone: Bottom = 200, Top = 205
      // Bar high = 208 (sweeps above 205 by ~1.46% -> <= 3.5%)
      // Open = 203, Close = 201, Low = 199
      // Total range = 208 - 199 = 9
      // Upper wick = high - max(open, close) = 208 - 203 = 5
      // Upper wick % = (5 / 9) * 100 = 55.6% (>= 25%)
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 198, high: 201, low: 197, close: 200, volume: 50 },
        { time: baseTime + barInterval, open: 200, high: 204, low: 199, close: 202, volume: 60 },
        { time: baseTime + barInterval * 2, open: 203, high: 208, low: 199, close: 201, volume: 140 },
      ];

      const sweep = detectPoiLiquiditySweep(bars, {
        type: "BEARISH",
        top: 205,
        bottom: 200,
        meanThreshold: 202.5,
      });

      expect(sweep).not.toBeNull();
      expect(sweep?.isSweep).toBe(true);
      expect(sweep?.type).toBe("BEARISH_SWEEP");
      expect(sweep?.sweepPrice).toBe(208);
      expect(sweep?.closePrice).toBe(201);
      expect(sweep?.sweepDepthPct).toBeCloseTo(1.46, 1);
      expect(sweep?.rejectionWickPct).toBeCloseTo(55.6, 1);
      expect(sweep?.label).toContain("Bearish Supply Sweep");
    });

    it("rejects candle if sweep is excessively deep (> maxSweepDepthPct breakdown)", () => {
      // Zone bottom = 100
      // Low = 95 -> 5% sweep depth > default 3.5% limit (true breakdown, not sweep)
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 104, high: 105, low: 102, close: 103, volume: 50 },
        { time: baseTime + barInterval, open: 103, high: 104, low: 101, close: 102, volume: 60 },
        { time: baseTime + barInterval * 2, open: 101, high: 102, low: 95, close: 100.5, volume: 150 },
      ];

      const sweep = detectPoiLiquiditySweep(bars, {
        type: "BULLISH",
        top: 105,
        bottom: 100,
        meanThreshold: 102.5,
      });

      expect(sweep).toBeNull();
    });

    it("rejects candle if rejection wick is too small (< minRejectionWickPct)", () => {
      // Zone bottom = 100
      // Low = 99 (1% sweep depth)
      // Open = 100.5, Close = 100.2, High = 104
      // Total range = 104 - 99 = 5
      // Lower wick = min(open, close) - low = 100.2 - 99 = 1.2
      // Lower wick % = (1.2 / 5) * 100 = 24% (< 25% min required)
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 104, high: 105, low: 102, close: 103, volume: 50 },
        { time: baseTime + barInterval, open: 103, high: 104, low: 101, close: 102, volume: 60 },
        { time: baseTime + barInterval * 2, open: 100.5, high: 104, low: 99, close: 100.2, volume: 100 },
      ];

      const sweep = detectPoiLiquiditySweep(bars, {
        type: "BULLISH",
        top: 105,
        bottom: 100,
        meanThreshold: 102.5,
      });

      expect(sweep).toBeNull();
    });

    it("rejects candle if price closed outside the zone without reclaiming", () => {
      // Zone bottom = 100
      // Low = 98, Close = 98.5 (closed below bottom, failed to reclaim)
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 104, high: 105, low: 102, close: 103, volume: 50 },
        { time: baseTime + barInterval, open: 103, high: 104, low: 101, close: 102, volume: 60 },
        { time: baseTime + barInterval * 2, open: 101, high: 102, low: 98, close: 98.5, volume: 150 },
      ];

      const sweep = detectPoiLiquiditySweep(bars, {
        type: "BULLISH",
        top: 105,
        bottom: 100,
        meanThreshold: 102.5,
      });

      expect(sweep).toBeNull();
    });
  });

  describe("Integration with computeRadarPois()", () => {
    it("flags POI status as 'sweep' when a recent candle performed a fakeout sweep", () => {
      // Bullish OB setup followed by a sweep candle
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 98, high: 100, low: 97, close: 99, volume: 100 },
        { time: baseTime + barInterval, open: 99, high: 101, low: 98, close: 100, volume: 100 },
        { time: baseTime + barInterval * 2, open: 100, high: 102, low: 99, close: 101, volume: 100 },
        { time: baseTime + barInterval * 3, open: 101, high: 102, low: 99, close: 100, volume: 100 },
        { time: baseTime + barInterval * 4, open: 100, high: 101, low: 95, close: 96, volume: 150 }, // Base candle -> [95, 101]
        { time: baseTime + barInterval * 5, open: 96, high: 110, low: 96, close: 109, volume: 300 }, // Exp 1
        { time: baseTime + barInterval * 6, open: 109, high: 120, low: 108, close: 118, volume: 400 }, // Exp 2 (FVG)
        { time: baseTime + barInterval * 7, open: 118, high: 122, low: 115, close: 120, volume: 200 },
        { time: baseTime + barInterval * 8, open: 120, high: 121, low: 105, close: 106, volume: 150 },
        // Sweep bar: Dips to 94 (< 95 bottom, ~1.05% depth), reclaims to 97 with lower wick = 96 - 94 = 2 (2 / 4 = 50%)
        { time: baseTime + barInterval * 9, open: 102, high: 102, low: 94, close: 97, volume: 350 },
      ];

      const pois = computeRadarPois(bars, "BTCUSDT", "15m");
      expect(pois.length).toBeGreaterThan(0);

      // Should identify the sweep
      const sweptPoi = pois.find((p) => p.sweep !== null || p.status === "sweep");
      expect(sweptPoi).toBeDefined();
      expect(sweptPoi?.sweep?.isSweep).toBe(true);
      expect(sweptPoi?.sweep?.type).toBe("BULLISH_SWEEP");
      expect(sweptPoi?.status).toBe("sweep");
    });
  });

  describe("Integration with radar-export & Telegram reports", () => {
    const mockSweptPoi: RadarPoiItem = {
      id: "binance-ob-1",
      symbol: "SOLUSDT",
      timeframe: "1h",
      category: "order_block",
      type: "BULLISH",
      label: "Bullish OB (+2C FVG)",
      top: 150,
      bottom: 145,
      meanThreshold: 147.5,
      entryPrice: 150,
      fullRetestPrice: 145,
      currentPrice: 148,
      distanceToEntryPct: 0,
      distanceToMtPct: 0.34,
      isInsideZone: true,
      status: "sweep",
      time: 1700000000000,
      exchange: "binance",
      exchangeLabel: "BINANCE",
      metrics: {
        winRatePct: 75,
        totalTested: 8,
        wins: 6,
        losses: 2,
        avgRr: 1.8,
        confidence: "HIGH",
        sampleDescription: "6W / 2L (8 total)",
      },
      sweep: {
        isSweep: true,
        type: "BULLISH_SWEEP",
        sweepDepthPct: 1.2,
        rejectionWickPct: 45.0,
        sweepPrice: 143.26,
        closePrice: 147.1,
        candleTime: 1700000000000,
        label: "Bullish Demand Sweep (45% Wick)",
      },
    };

    const mockExportItem: ExportableRadarItem = {
      symbol: "SOLUSDT",
      name: "Solana",
      price: 148,
      change24h: 3.5,
      volume24h: 950000000,
      selectedPoi: mockSweptPoi,
    };

    it("includes sweep info in CSV, JSON, and Clipboard markdown exports", () => {
      // 1. CSV
      const csv = generateRadarCsv([mockExportItem]);
      expect(csv).toContain("Liquidity Sweep");
      expect(csv).toContain("Bullish Demand Sweep (45% Wick)");

      // 2. JSON
      const jsonStr = generateRadarJson([mockExportItem]);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.items[0].poi.sweep.isSweep).toBe(true);
      expect(parsed.items[0].poi.sweep.rejectionWickPct).toBe(45);

      // 3. Markdown
      const md = generateRadarClipboardMarkdown([mockExportItem]);
      expect(md).toContain("🧹 SWEEP");
    });

    it("formats Telegram alert message with sweep indicator and supports categoryFilter === 'sweep'", () => {
      const { text: tgMsg } = formatTelegramRadarReport([mockSweptPoi]);
      expect(tgMsg).toContain("SWEEP REVERSAL");

      const { text: tgMsgFiltered } = formatTelegramRadarReport([mockSweptPoi], "sweep");
      expect(tgMsgFiltered).toContain("Institutional Liquidity Sweeps");
      expect(tgMsgFiltered).toContain("SOLUSDT");
    });
  });
});
