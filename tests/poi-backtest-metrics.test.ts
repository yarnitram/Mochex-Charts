import { describe, it, expect } from "vitest";
import {
  calculateHistoricalPoiMetrics,
  PoiHistoricalMetrics,
} from "../src/lib/indicators/poi-backtest-metrics";
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

describe("Historical POI Win-Rate & Reaction Statistical Metrics (DEC-144)", () => {
  const baseTime = 1700000000000;
  const barInterval = 15 * 60 * 1000;

  it("handles short/empty bar datasets gracefully with INSUFFICIENT_DATA", () => {
    const emptyMetrics = calculateHistoricalPoiMetrics([]);
    expect(emptyMetrics.totalTested).toBe(0);
    expect(emptyMetrics.winRatePct).toBe(0);
    expect(emptyMetrics.confidence).toBe("INSUFFICIENT_DATA");

    const shortBars: CandlestickBar[] = [
      { time: baseTime, open: 100, high: 105, low: 99, close: 103, volume: 10 },
      { time: baseTime + barInterval, open: 103, high: 108, low: 101, close: 107, volume: 10 },
    ];
    const shortMetrics = calculateHistoricalPoiMetrics(shortBars);
    expect(shortMetrics.confidence).toBe("INSUFFICIENT_DATA");
  });

  it("correctly identifies successful reactions (bounces to target R:R) and calculates win rate", () => {
    // Construct candle history with a Bullish OB that subsequently gets tapped and hits target:
    // 1) Initial trend and Bullish OB formation:
    //    Bar 0..3: Neutral
    //    Bar 4: Bearish base candle (Open 100, High 101, Low 95, Close 96) -> Validated Bullish OB zone [95, 101]
    //    Bar 5: Strong green expansion (Open 96, High 110, Low 96, Close 109)
    //    Bar 6: Strong green expansion with FVG (Open 109, High 120, Low 108, Close 118) (Bar 6 Low 108 > Bar 4 High 101)
    //    Bar 7: High push (Open 118, High 122, Low 115, Close 120)
    // 2) Retracement tap into 50% Mean Threshold (MT = 98):
    //    Bar 8: Pullback (Open 120, High 121, Low 105, Close 106)
    //    Bar 9: Tap into zone (Open 106, High 107, Low 97, Close 102) -> Touched 97 <= MT (98)
    // 3) Strong reaction bounce reaching target:
    //    Risk: Trigger 98 - SL (95 * 0.998 = 94.81) = 3.19
    //    Target 1.5R: 98 + (3.19 * 1.5) = 102.785
    //    Bar 10: Bounce (Open 102, High 106, Low 101, Close 105) -> High 106 >= 102.79 -> WIN!
    //    Bar 11..18: Continued bull trend
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 98, high: 100, low: 97, close: 99, volume: 100 },
      { time: baseTime + barInterval, open: 99, high: 101, low: 98, close: 100, volume: 100 },
      { time: baseTime + barInterval * 2, open: 100, high: 102, low: 99, close: 101, volume: 100 },
      { time: baseTime + barInterval * 3, open: 101, high: 102, low: 99, close: 100, volume: 100 },
      { time: baseTime + barInterval * 4, open: 100, high: 101, low: 95, close: 96, volume: 150 }, // OB Base
      { time: baseTime + barInterval * 5, open: 96, high: 110, low: 96, close: 109, volume: 300 }, // Exp 1
      { time: baseTime + barInterval * 6, open: 109, high: 120, low: 108, close: 118, volume: 400 }, // Exp 2 with FVG
      { time: baseTime + barInterval * 7, open: 118, high: 122, low: 115, close: 120, volume: 200 },
      { time: baseTime + barInterval * 8, open: 120, high: 121, low: 105, close: 106, volume: 150 },
      { time: baseTime + barInterval * 9, open: 106, high: 107, low: 97, close: 102, volume: 250 }, // Tap
      { time: baseTime + barInterval * 10, open: 102, high: 106, low: 101, close: 105, volume: 350 }, // Reaction Win
      { time: baseTime + barInterval * 11, open: 105, high: 112, low: 104, close: 110, volume: 200 },
      { time: baseTime + barInterval * 12, open: 110, high: 115, low: 109, close: 114, volume: 150 },
      { time: baseTime + barInterval * 13, open: 114, high: 116, low: 112, close: 115, volume: 120 },
      { time: baseTime + barInterval * 14, open: 115, high: 117, low: 113, close: 116, volume: 110 },
      { time: baseTime + barInterval * 15, open: 116, high: 118, low: 114, close: 117, volume: 100 },
    ];

    const metrics = calculateHistoricalPoiMetrics(bars, { targetRr: 1.5 });
    expect(metrics.totalTested).toBeGreaterThanOrEqual(1);
    expect(metrics.wins).toBeGreaterThanOrEqual(1);
    expect(metrics.winRatePct).toBeGreaterThanOrEqual(50);
    expect(metrics.sampleDescription).toContain("reacted");
  });

  it("automatically attaches historical reaction metrics to POIs computed by computeRadarPois", () => {
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 90, high: 96, low: 88, close: 95, volume: 100 },
      { time: baseTime + barInterval, open: 95, high: 97, low: 89, close: 91, volume: 150 },
      { time: baseTime + barInterval * 2, open: 91, high: 105, low: 90, close: 104, volume: 300 },
      { time: baseTime + barInterval * 3, open: 104, high: 112, low: 99, close: 110, volume: 350 },
      { time: baseTime + barInterval * 4, open: 110, high: 114, low: 108, close: 112, volume: 200 },
    ];

    const pois = computeRadarPois(bars, "SOLUSDT", "15m");
    expect(pois.length).toBeGreaterThan(0);

    for (const p of pois) {
      expect(p.metrics).toBeDefined();
      expect(typeof p.metrics?.winRatePct).toBe("number");
      expect(typeof p.metrics?.totalTested).toBe("number");
      expect(typeof p.metrics?.confidence).toBe("string");
    }
  });

  it("exports reaction win-rate columns in CSV, JSON, and Markdown clipboard formats", () => {
    const sampleMetrics: PoiHistoricalMetrics = {
      winRatePct: 78,
      totalTested: 9,
      wins: 7,
      losses: 2,
      avgRr: 1.8,
      confidence: "HIGH",
      sampleDescription: "78% (7/9 reacted)",
    };

    const samplePoi: RadarPoiItem = {
      id: "mexc-ob-test",
      symbol: "ETHUSDT",
      timeframe: "4H",
      category: "order_block",
      type: "BULLISH",
      label: "BULLISH OB (+2C FVG)",
      top: 2500,
      bottom: 2450,
      meanThreshold: 2475,
      entryPrice: 2500,
      fullRetestPrice: 2450,
      status: "fresh",
      isInsideZone: false,
      distanceToEntryPct: 1.5,
      distanceToMtPct: 2.5,
      currentPrice: 2537.5,
      time: 1700000000000,
      exchange: "mexc",
      exchangeLabel: "MEXC Spot",
      metrics: sampleMetrics,
    };

    const exportItems: ExportableRadarItem[] = [
      {
        symbol: "ETHUSDT",
        name: "Ethereum",
        price: 2537.5,
        change24h: 2.1,
        volume24h: 50000000,
        selectedPoi: samplePoi,
        exchange: "mexc",
        exchangeLabel: "MEXC Spot",
      },
    ];

    // CSV test
    const csv = generateRadarCsv(exportItems);
    expect(csv).toContain("Reaction Win-Rate %");
    expect(csv).toContain("78%");
    expect(csv).toContain("78% (7/9 reacted)");

    // JSON test
    const jsonStr = generateRadarJson(exportItems, {
      universeName: "Majors",
      categoryFilter: "ALL",
      timeframe: "4H",
      totalCoins: 1,
    });
    const parsed = JSON.parse(jsonStr);
    expect(parsed.items[0].poi.metrics.winRatePct).toBe(78);
    expect(parsed.items[0].poi.metrics.confidence).toBe("HIGH");

    // Markdown test
    const md = generateRadarClipboardMarkdown(exportItems, {
      universeName: "Majors",
      categoryFilter: "ALL",
      timeframe: "4H",
      totalCoins: 1,
    });
    expect(md).toContain("Win Rate");
    expect(md).toContain("78% (7/9)");
  });

  it("includes win-rate statistics in Telegram Bot Radar messages", () => {
    const poiWithMetrics: RadarPoiItem = {
      id: "binance-sz-123",
      symbol: "BTCUSDT",
      timeframe: "4H",
      category: "sandwich_zone",
      type: "BULLISH",
      label: "Demand Sandwich (GRGG)",
      top: 68000,
      bottom: 67200,
      meanThreshold: 67600,
      entryPrice: 68000,
      fullRetestPrice: 67200,
      status: "fresh",
      isInsideZone: false,
      distanceToEntryPct: 1.1,
      distanceToMtPct: 1.7,
      currentPrice: 68750,
      time: 1700000000000,
      exchange: "binance",
      exchangeLabel: "Binance Perps",
      metrics: {
        winRatePct: 83,
        totalTested: 6,
        wins: 5,
        losses: 1,
        avgRr: 2.1,
        confidence: "HIGH",
        sampleDescription: "83% (5/6 reacted)",
      },
    };

    const report = formatTelegramRadarReport([poiWithMetrics], "all");
    expect(report.text).toContain("83%");
    expect(report.text).toContain("(5/6)");
  });
});
