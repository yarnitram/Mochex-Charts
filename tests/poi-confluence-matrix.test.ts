import { describe, it, expect } from "vitest";
import {
  normalizeTfLabel,
  doZonesOverlap,
  computePoiConfluence,
  attachConfluenceToPois,
} from "../src/lib/indicators/poi-confluence-matrix";
import { RadarPoiItem } from "../src/lib/indicators/radar-poi-engine";
import {
  generateRadarCsv,
  generateRadarJson,
  generateRadarClipboardMarkdown,
  ExportableRadarItem,
} from "../src/lib/screener/radar-export";
import { formatTelegramRadarReport } from "../src/lib/telegram/telegram-bot-engine";

describe("Multi-Timeframe (MTF) POI Confluence Matrix & Cluster Engine (DEC-146)", () => {
  describe("normalizeTfLabel unit tests", () => {
    it("normalizes diverse timeframe representations into canonical labels", () => {
      expect(normalizeTfLabel("15")).toBe("15m");
      expect(normalizeTfLabel("15m")).toBe("15m");
      expect(normalizeTfLabel("15M")).toBe("15m");
      expect(normalizeTfLabel("60")).toBe("1H");
      expect(normalizeTfLabel("1h")).toBe("1H");
      expect(normalizeTfLabel("240")).toBe("4H");
      expect(normalizeTfLabel("4h")).toBe("4H");
      expect(normalizeTfLabel("1d")).toBe("1D");
      expect(normalizeTfLabel("d")).toBe("1D");
    });
  });

  describe("doZonesOverlap unit tests", () => {
    it("detects partial and fully nested overlapping price bands", () => {
      // Partial overlap: Zone A [100, 105], Zone B [103, 108]
      expect(doZonesOverlap(105, 100, 108, 103)).toBe(true);

      // Fully nested: Zone A [102, 104] inside Zone B [100, 108]
      expect(doZonesOverlap(104, 102, 108, 100)).toBe(true);

      // Distant zones (no overlap): Zone A [100, 105], Zone B [110, 115]
      expect(doZonesOverlap(105, 100, 115, 110)).toBe(false);

      // Touching boundary within buffer tolerance: Zone A [100, 105], Zone B [105.1, 110]
      expect(doZonesOverlap(105, 100, 110, 105.1, 0.25)).toBe(true);
    });
  });

  describe("computePoiConfluence & attachConfluenceToPois", () => {
    const poi15m: RadarPoiItem = {
      id: "mexc-ob-15m-1",
      symbol: "ETHUSDT",
      timeframe: "15m",
      category: "order_block",
      type: "BULLISH",
      label: "BULLISH OB (+2C FVG)",
      top: 2520,
      bottom: 2500,
      meanThreshold: 2510,
      entryPrice: 2520,
      fullRetestPrice: 2500,
      currentPrice: 2530,
      distanceToEntryPct: 0.39,
      distanceToMtPct: 0.79,
      isInsideZone: false,
      status: "fresh",
      time: 1700000000000,
    };

    const poi1h: RadarPoiItem = {
      id: "mexc-fvg-1h-1",
      symbol: "ETHUSDT",
      timeframe: "1h",
      category: "fvg",
      type: "BULLISH",
      label: "Bullish FVG (Demand)",
      top: 2540,
      bottom: 2510,
      meanThreshold: 2525,
      entryPrice: 2540,
      fullRetestPrice: 2510,
      currentPrice: 2530,
      distanceToEntryPct: 0,
      distanceToMtPct: 0.19,
      isInsideZone: true,
      status: "testing",
      time: 1700000000000,
    };

    const poi4h: RadarPoiItem = {
      id: "mexc-sz-4h-1",
      symbol: "ETHUSDT",
      timeframe: "4h",
      category: "sandwich_zone",
      type: "BULLISH",
      label: "Demand Sandwich (GRGG) ++",
      isPlus: true,
      top: 2560,
      bottom: 2490,
      meanThreshold: 2525,
      entryPrice: 2560,
      fullRetestPrice: 2490,
      currentPrice: 2530,
      distanceToEntryPct: 0,
      distanceToMtPct: 0.19,
      isInsideZone: true,
      status: "testing",
      time: 1700000000000,
    };

    it("returns null when no cross-timeframe overlap exists", () => {
      // Single POI in isolation
      const confluence = computePoiConfluence(poi15m, [poi15m]);
      expect(confluence).toBeNull();

      // Opposite direction POIs (BULLISH demand does not confluence with BEARISH supply)
      const oppositeBearishPoi: RadarPoiItem = {
        ...poi1h,
        id: "mexc-sz-1h-bear",
        type: "BEARISH",
        label: "Supply Sandwich (RGRR)",
      };
      expect(computePoiConfluence(poi15m, [poi15m, oppositeBearishPoi])).toBeNull();
    });

    it("computes 2x MTF Confluence when two distinct timeframes overlap", () => {
      const confluence = computePoiConfluence(poi15m, [poi15m, poi1h]);
      expect(confluence).not.toBeNull();
      expect(confluence?.score).toBe(2);
      expect(confluence?.tier).toBe("2x");
      expect(confluence?.label).toBe("⚡ 2x MTF");
      expect(confluence?.timeframes).toEqual(["15m", "1H"]);
      expect(confluence?.contributingPoisCount).toBe(2);
      expect(confluence?.description).toContain("15m");
      expect(confluence?.description).toContain("1H");
    });

    it("computes 3x MTF Confluence when 15m + 1H + 4H zones overlap and identifies nested nesting", () => {
      const confluence15m = computePoiConfluence(poi15m, [poi15m, poi1h, poi4h]);
      expect(confluence15m).not.toBeNull();
      expect(confluence15m?.score).toBe(3);
      expect(confluence15m?.tier).toBe("3x_PLUS");
      expect(confluence15m?.label).toBe("🔥 3x MTF");
      expect(confluence15m?.timeframes).toEqual(["15m", "1H", "4H"]);
      expect(confluence15m?.contributingPoisCount).toBe(3);
      // 15m zone [2500, 2520] is completely inside 4H zone [2490, 2560]
      expect(confluence15m?.isNested).toBe(true);
    });

    it("attaches confluence to every POI in the pool via attachConfluenceToPois", () => {
      const enriched = attachConfluenceToPois([poi15m, poi1h, poi4h]);
      expect(enriched.length).toBe(3);
      expect(enriched[0].confluence?.score).toBe(3);
      expect(enriched[1].confluence?.score).toBe(3);
      expect(enriched[2].confluence?.score).toBe(3);
    });
  });

  describe("Integration with Export Suite & Telegram alerts", () => {
    const mockConfluencedPoi: RadarPoiItem = {
      id: "binance-ob-1",
      symbol: "SOLUSDT",
      timeframe: "15m",
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
      status: "testing",
      time: 1700000000000,
      exchange: "binance",
      exchangeLabel: "BINANCE",
      confluence: {
        score: 3,
        tier: "3x_PLUS",
        timeframes: ["15m", "1H", "4H"],
        label: "🔥 3x MTF",
        contributingPoisCount: 3,
        description: "15m Bullish OB + 1H FVG + 4H Demand Sandwich",
        clusterTop: 150,
        clusterBottom: 146,
        isNested: true,
      },
    };

    const mockExportItem: ExportableRadarItem = {
      symbol: "SOLUSDT",
      name: "Solana",
      price: 148,
      change24h: 4.2,
      volume24h: 1200000000,
      selectedPoi: mockConfluencedPoi,
    };

    it("includes MTF confluence in CSV, JSON, and Clipboard markdown exports", () => {
      // 1. CSV
      const csv = generateRadarCsv([mockExportItem]);
      expect(csv).toContain("MTF Confluence");
      expect(csv).toContain("🔥 3x MTF");
      expect(csv).toContain("15m+1H+4H");

      // 2. JSON
      const jsonStr = generateRadarJson([mockExportItem]);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.items[0].poi.confluence.score).toBe(3);
      expect(parsed.items[0].poi.confluence.label).toBe("🔥 3x MTF");

      // 3. Markdown
      const md = generateRadarClipboardMarkdown([mockExportItem]);
      expect(md).toContain("[🔥 3x MTF]");
    });

    it("formats Telegram alert report with confluence tag and filters by categoryFilter === 'confluence'", () => {
      const { text: tgMsg } = formatTelegramRadarReport([mockConfluencedPoi]);
      expect(tgMsg).toContain("🔥 3x MTF");
      expect(tgMsg).toContain("15m·1H·4H");

      const { text: tgMsgFiltered } = formatTelegramRadarReport([mockConfluencedPoi], "confluence");
      expect(tgMsgFiltered).toContain("Multi-Timeframe Confluence Setups");
      expect(tgMsgFiltered).toContain("SOLUSDT");
    });
  });
});
