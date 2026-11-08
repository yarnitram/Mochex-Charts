import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeIntervalForExchange,
  convertBinanceKlines,
  convertBybitKlines,
  convertMexcKlines,
  SUPPORTED_EXCHANGES,
} from "../src/lib/screener/multi-exchange-client";
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

describe("Multi-Exchange POI Aggregation Engine (DEC-143)", () => {
  const baseTime = 1700000000000;
  const barInterval = 15 * 60 * 1000;

  describe("Interval & Resolution Normalization", () => {
    it("maps standard timeframe strings correctly for MEXC", () => {
      expect(normalizeIntervalForExchange("mexc", "15m")).toBe("15m");
      expect(normalizeIntervalForExchange("mexc", "15")).toBe("15m");
      expect(normalizeIntervalForExchange("mexc", "1H")).toBe("60m");
      expect(normalizeIntervalForExchange("mexc", "60")).toBe("60m");
      expect(normalizeIntervalForExchange("mexc", "4H")).toBe("4h");
      expect(normalizeIntervalForExchange("mexc", "240")).toBe("4h");
      expect(normalizeIntervalForExchange("mexc", "1D")).toBe("1d");
      expect(normalizeIntervalForExchange("mexc", "d")).toBe("1d");
      expect(normalizeIntervalForExchange("mexc", "1m")).toBe("1m");
      expect(normalizeIntervalForExchange("mexc", "5m")).toBe("5m");
      expect(normalizeIntervalForExchange("mexc", "30m")).toBe("30m");
      expect(normalizeIntervalForExchange("mexc", "1W")).toBe("1W");
      expect(normalizeIntervalForExchange("mexc", "1M")).toBe("1M");
    });

    it("maps standard timeframe strings correctly for Binance", () => {
      expect(normalizeIntervalForExchange("binance", "15m")).toBe("15m");
      expect(normalizeIntervalForExchange("binance", "1H")).toBe("1h");
      expect(normalizeIntervalForExchange("binance", "4H")).toBe("4h");
      expect(normalizeIntervalForExchange("binance", "1D")).toBe("1d");
    });

    it("maps standard timeframe strings correctly for Bybit", () => {
      expect(normalizeIntervalForExchange("bybit", "15m")).toBe("15");
      expect(normalizeIntervalForExchange("bybit", "1H")).toBe("60");
      expect(normalizeIntervalForExchange("bybit", "4H")).toBe("240");
      expect(normalizeIntervalForExchange("bybit", "1D")).toBe("D");
    });
  });

  describe("Raw Kline Converters", () => {
    it("parses Binance kline arrays into CandlestickBar format", () => {
      const rawBinance = [
        [1700000000000, "90.5", "95.0", "89.0", "94.2", "1250.5", 1700000899999, "115000"],
        [1700000900000, "94.2", "98.0", "93.5", "97.8", "1800.0", 1700001799999, "170000"],
      ];

      const bars = convertBinanceKlines(rawBinance);
      expect(bars.length).toBe(2);
      expect(bars[0]).toEqual({
        time: 1700000000000,
        open: 90.5,
        high: 95.0,
        low: 89.0,
        close: 94.2,
        volume: 1250.5,
      });
      expect(bars[1].close).toBe(97.8);
    });

    it("parses Bybit V5 kline lists into chronological order", () => {
      // Bybit returns newest first, so [index 0 is newest, index 1 is older]
      const rawBybit = [
        ["1700000900000", "94.2", "98.0", "93.5", "97.8", "1800.0", "170000"], // newest
        ["1700000000000", "90.5", "95.0", "89.0", "94.2", "1250.5", "115000"], // older
      ];

      const bars = convertBybitKlines(rawBybit);
      expect(bars.length).toBe(2);
      // Older candle should be first after reversal
      expect(bars[0].time).toBe(1700000000000);
      expect(bars[0].close).toBe(94.2);
      expect(bars[1].time).toBe(1700000900000);
      expect(bars[1].close).toBe(97.8);
    });

    it("parses MEXC klines array correctly", () => {
      const rawMexc = [
        [1700000000000, "100.0", "105.0", "99.0", "104.0", "500", 1700000899999],
      ];
      const bars = convertMexcKlines(rawMexc);
      expect(bars.length).toBe(1);
      expect(bars[0].close).toBe(104.0);
    });
  });

  describe("POI Engine Multi-Exchange Tagging", () => {
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 90, high: 96, low: 88, close: 95, volume: 100 },
      { time: baseTime + barInterval, open: 95, high: 97, low: 89, close: 91, volume: 150 },
      { time: baseTime + barInterval * 2, open: 91, high: 105, low: 90, close: 104, volume: 300 },
      { time: baseTime + barInterval * 3, open: 104, high: 112, low: 99, close: 110, volume: 350 },
      { time: baseTime + barInterval * 4, open: 110, high: 114, low: 108, close: 112, volume: 200 },
    ];

    it("computes POIs with Binance exchange metadata and prefix", () => {
      const pois = computeRadarPois(bars, "BTCUSDT", "15m", "binance");
      expect(pois.length).toBeGreaterThan(0);

      for (const p of pois) {
        expect(p.exchange).toBe("binance");
        expect(p.exchangeLabel).toBe("Binance Perps");
        expect(p.id.startsWith("binance-")).toBe(true);
      }
    });

    it("computes POIs with Bybit exchange metadata and prefix", () => {
      const pois = computeRadarPois(bars, "ETHUSDT", "1H", "bybit");
      expect(pois.length).toBeGreaterThan(0);

      for (const p of pois) {
        expect(p.exchange).toBe("bybit");
        expect(p.exchangeLabel).toBe("Bybit Perps");
        expect(p.id.startsWith("bybit-")).toBe(true);
      }
    });

    it("defaults to MEXC when exchange is omitted", () => {
      const pois = computeRadarPois(bars, "SOLUSDT", "4H");
      expect(pois.length).toBeGreaterThan(0);
      expect(pois[0].exchange).toBe("mexc");
      expect(pois[0].exchangeLabel).toBe("MEXC Spot");
    });
  });

  describe("Export Suite Multi-Exchange Support", () => {
    const samplePoi: RadarPoiItem = {
      id: "binance-ob-123",
      symbol: "BTCUSDT",
      timeframe: "4H",
      category: "order_block",
      type: "BULLISH",
      label: "BULLISH OB (+2C FVG)",
      top: 68500,
      bottom: 67800,
      meanThreshold: 68150,
      entryPrice: 68500,
      fullRetestPrice: 67800,
      status: "fresh",
      isInsideZone: false,
      distanceToEntryPct: 1.25,
      distanceToMtPct: 1.76,
      currentPrice: 69360,
      time: 1700000000000,
      exchange: "binance",
      exchangeLabel: "Binance Perps",
    };

    const exportItems: ExportableRadarItem[] = [
      {
        symbol: "BTCUSDT",
        name: "Bitcoin",
        price: 69360,
        change24h: 3.45,
        volume24h: 850000000,
        selectedPoi: samplePoi,
        exchange: "binance",
        exchangeLabel: "Binance Perps",
      },
    ];

    it("includes Exchange column in CSV export", () => {
      const csv = generateRadarCsv(exportItems);
      const lines = csv.split("\r\n");
      expect(lines[0].startsWith("Exchange,Symbol")).toBe(true);
      expect(lines[1].startsWith("Binance Perps,BTCUSDT")).toBe(true);
    });

    it("includes exchange properties in JSON export", () => {
      const jsonStr = generateRadarJson(exportItems, {
        universeName: "Majors",
        categoryFilter: "ALL",
        timeframe: "4H",
        totalCoins: 1,
      });
      const parsed = JSON.parse(jsonStr);
      expect(parsed.items[0].exchange).toBe("binance");
      expect(parsed.items[0].exchangeLabel).toBe("Binance Perps");
      expect(parsed.items[0].poi.exchange).toBe("binance");
    });

    it("includes Exchange column in Markdown clipboard export", () => {
      const md = generateRadarClipboardMarkdown(exportItems, {
        universeName: "Majors",
        categoryFilter: "ALL",
        timeframe: "4H",
        totalCoins: 1,
      });
      expect(md).toContain("| Exchange | Ticker | Price |");
      expect(md).toContain("| **BINANCE** | **BTCUSDT** |");
    });
  });

  describe("Telegram Bot Multi-Exchange Output", () => {
    it("renders exchange tag in Telegram message format", () => {
      const poi: RadarPoiItem = {
        id: "bybit-sz-456",
        symbol: "SOLUSDT",
        timeframe: "1H",
        category: "sandwich_zone",
        type: "BULLISH",
        label: "Demand Sandwich (GRGG)",
        top: 155,
        bottom: 150,
        meanThreshold: 152.5,
        entryPrice: 155,
        fullRetestPrice: 150,
        status: "testing",
        isInsideZone: true,
        distanceToEntryPct: 0,
        distanceToMtPct: 0.5,
        currentPrice: 153.2,
        time: 1700000000000,
        exchange: "bybit",
        exchangeLabel: "Bybit Perps",
      };

      const report = formatTelegramRadarReport([poi], "all");
      expect(report.text).toContain("[BYBIT]");
      expect(report.text).toContain("SOLUSDT");
      expect(report.text).toContain("IN-ZONE");
    });
  });
});
