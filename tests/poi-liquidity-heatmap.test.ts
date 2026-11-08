import { describe, it, expect } from "vitest";
import {
  computePoiWeight,
  computePoiLiquidityHeatmap,
  attachLiquidityToPoi,
  attachLiquidityToPois,
} from "../src/lib/indicators/poi-liquidity-heatmap";
import { RadarPoiItem } from "../src/lib/indicators/radar-poi-engine";
import {
  generateRadarCsv,
  generateRadarJson,
  ExportableRadarItem,
} from "../src/lib/screener/radar-export";
import { formatTelegramRadarReport } from "../src/lib/telegram/telegram-bot-engine";

describe("Dynamic Multi-Timeframe POI Heatmap Overlay & Liquidity Density Ribbon Engine (DEC-149)", () => {
  const basePoi: RadarPoiItem = {
    id: "poi-1",
    symbol: "BTCUSDT",
    timeframe: "15m",
    category: "order_block",
    type: "BULLISH",
    label: "BULLISH OB",
    top: 65200,
    bottom: 65000,
    meanThreshold: 65100,
    entryPrice: 65200,
    fullRetestPrice: 65000,
    invalidationPrice: 64950,
    distanceToEntryPct: 0.5,
    distanceToRetestPct: 0.8,
    isInsideZone: false,
    status: "fresh",
    isFresh: true,
    isTested: false,
    isMitigated: false,
    timestamp: Date.now(),
  };

  describe("computePoiWeight unit tests", () => {
    it("assigns higher weights to macro timeframes (1D > 4H > 1H > 15m)", () => {
      const weight15m = computePoiWeight({ ...basePoi, timeframe: "15m" });
      const weight1H = computePoiWeight({ ...basePoi, timeframe: "1H" });
      const weight4H = computePoiWeight({ ...basePoi, timeframe: "4H" });
      const weight1D = computePoiWeight({ ...basePoi, timeframe: "1D" });

      expect(weight1D).toBeGreaterThan(weight4H);
      expect(weight4H).toBeGreaterThan(weight1H);
      expect(weight1H).toBeGreaterThan(weight15m);
    });

    it("applies category hierarchy bonuses (Sandwich ++ > OB > FVG)", () => {
      const weightFvg = computePoiWeight({ ...basePoi, category: "fvg" });
      const weightOb = computePoiWeight({ ...basePoi, category: "order_block" });
      const weightSandwich = computePoiWeight({ ...basePoi, category: "sandwich_zone", isPlus: true });

      expect(weightSandwich).toBeGreaterThan(weightOb);
      expect(weightOb).toBeGreaterThan(weightFvg);
    });

    it("multiplies weight for confluent and swept zones, while discounting mitigated zones", () => {
      const freshWeight = computePoiWeight({ ...basePoi, status: "fresh" });
      const sweptWeight = computePoiWeight({
        ...basePoi,
        status: "sweep",
        sweep: {
          type: "BULLISH_SWEEP",
          label: "BULLISH REVERSAL SWEEP",
          rejectionWickPct: 65,
          liquidityPrice: 64900,
          sweepCandleTime: Date.now(),
        },
      });
      const mitigatedWeight = computePoiWeight({ ...basePoi, status: "mitigated", isMitigated: true });
      const confluentWeight = computePoiWeight({
        ...basePoi,
        confluence: {
          score: 3,
          timeframes: ["15m", "1H", "4H"],
          label: "3x Confluence",
          clusterTop: 65200,
          clusterBottom: 65000,
          clusterMid: 65100,
          description: "Triple MTF cluster",
        },
      });

      expect(sweptWeight).toBeGreaterThan(freshWeight);
      expect(mitigatedWeight).toBeLessThan(freshWeight);
      expect(confluentWeight).toBeGreaterThan(freshWeight * 2);
    });
  });

  describe("computePoiLiquidityHeatmap unit tests", () => {
    it("handles empty POI array gracefully", () => {
      const emptyHeatmap = computePoiLiquidityHeatmap("BTCUSDT", []);
      expect(emptyHeatmap.bins).toEqual([]);
      expect(emptyHeatmap.peaks).toEqual([]);
      expect(emptyHeatmap.totalBullishWeight).toBe(0);
      expect(emptyHeatmap.totalBearishWeight).toBe(0);
    });

    it("discretizes price ranges into bins and computes density percentiles", () => {
      const pois: RadarPoiItem[] = [
        {
          ...basePoi,
          id: "poi-demand-1",
          type: "BULLISH",
          timeframe: "4H",
          top: 65000,
          bottom: 64500,
          meanThreshold: 64750,
        },
        {
          ...basePoi,
          id: "poi-demand-2",
          type: "BULLISH",
          timeframe: "1D",
          top: 64800,
          bottom: 64400,
          meanThreshold: 64600,
        },
        {
          ...basePoi,
          id: "poi-supply-1",
          type: "BEARISH",
          category: "fvg",
          timeframe: "15m",
          top: 67000,
          bottom: 66800,
          meanThreshold: 66900,
        },
      ];

      const heatmap = computePoiLiquidityHeatmap("BTCUSDT", pois, { binsCount: 30 });
      expect(heatmap.symbol).toBe("BTCUSDT");
      expect(heatmap.binsCount).toBe(30);
      expect(heatmap.bins.length).toBe(30);
      expect(heatmap.minPrice).toBeLessThanOrEqual(64400);
      expect(heatmap.maxPrice).toBeGreaterThanOrEqual(67000);

      // Verify demand dominance since 4H + 1D demand outweighs 15m supply
      expect(heatmap.totalBullishWeight).toBeGreaterThan(heatmap.totalBearishWeight);
      expect(heatmap.demandDominancePct).toBeGreaterThan(50);
      expect(heatmap.sentimentBias).toBe("STRONG_DEMAND");

      // Verify at least one bin achieves ultra tier (>= 75th percentile)
      const maxDensityBin = heatmap.bins.reduce(
        (max, b) => (b.densityPercentile > max.densityPercentile ? b : max),
        heatmap.bins[0]
      );
      expect(maxDensityBin.densityPercentile).toBe(100);
      expect(maxDensityBin.tier).toBe("ultra");

      // Peak magnets detected
      expect(heatmap.peaks.length).toBeGreaterThan(0);
      expect(heatmap.peaks[0].bias).toBe("BULLISH_DEMAND");
    });
  });

  describe("attachLiquidityToPoi unit tests", () => {
    it("attaches accurate PoiLiquiditySummary to each individual POI", () => {
      const poiA: RadarPoiItem = {
        ...basePoi,
        id: "poi-a",
        timeframe: "1D",
        category: "sandwich_zone",
        top: 65500,
        bottom: 65000,
      };
      const poiB: RadarPoiItem = {
        ...basePoi,
        id: "poi-b",
        timeframe: "15m",
        category: "fvg",
        top: 68000,
        bottom: 67900,
      };

      const enriched = attachLiquidityToPois([poiA, poiB]);
      expect(enriched.length).toBe(2);

      const enrichedA = enriched.find((p) => p.id === "poi-a");
      const enrichedB = enriched.find((p) => p.id === "poi-b");

      expect(enrichedA?.liquidity).toBeDefined();
      expect(enrichedB?.liquidity).toBeDefined();

      // Macro Sandwich zone should have significantly higher density percentile than isolated 15m FVG
      expect(enrichedA!.liquidity!.densityPercentile).toBeGreaterThan(enrichedB!.liquidity!.densityPercentile);
      expect(["ultra", "high"]).toContain(enrichedA!.liquidity!.tier);
    });

    it("handles single POI attachLiquidityToPoi gracefully", () => {
      const single = { ...basePoi, id: "single-1" };
      const summary = attachLiquidityToPoi(single);
      expect(summary.densityPercentile).toBe(100);
      expect(summary.tier).toBe("ultra");
      expect(summary.isPeakMagnet).toBe(true);
    });
  });

  describe("Screener Export Integration (DEC-149)", () => {
    it("includes Liquidity Density %, Tier, and Peak Magnet in CSV output", () => {
      const mockExportItem: ExportableRadarItem = {
        symbol: "SOLUSDT",
        name: "Solana",
        price: 185.5,
        change24h: 3.2,
        volume24h: 450000000,
        selectedPoi: {
          ...basePoi,
          symbol: "SOLUSDT",
          liquidity: {
            densityPercentile: 92.4,
            tier: "ultra",
            isPeakMagnet: true,
            demandDominancePct: 80,
            sentimentBias: "STRONG_DEMAND",
          },
        },
      };

      const csv = generateRadarCsv([mockExportItem]);
      expect(csv).toContain("Liquidity Density %");
      expect(csv).toContain("Liquidity Tier");
      expect(csv).toContain("Peak Magnet");
      expect(csv).toContain("92.4%");
      expect(csv).toContain("ULTRA");
      expect(csv).toContain("YES (Peak Magnet)");
    });

    it("serializes liquidity summary inside JSON export", () => {
      const mockExportItem: ExportableRadarItem = {
        symbol: "SOLUSDT",
        name: "Solana",
        price: 185.5,
        change24h: 3.2,
        volume24h: 450000000,
        selectedPoi: {
          ...basePoi,
          symbol: "SOLUSDT",
          liquidity: {
            densityPercentile: 78.5,
            tier: "ultra",
            isPeakMagnet: false,
            demandDominancePct: 65,
            sentimentBias: "STRONG_DEMAND",
          },
        },
      };

      const json = generateRadarJson([mockExportItem], {
        universeName: "All Ecosystems",
        categoryFilter: "ALL",
        timeframe: "1H",
        totalCoins: 1,
      });

      const parsed = JSON.parse(json);
      expect(parsed.items[0].poi.liquidity).toBeDefined();
      expect(parsed.items[0].poi.liquidity.densityPercentile).toBe(78.5);
      expect(parsed.items[0].poi.liquidity.tier).toBe("ultra");
    });
  });

  describe("Telegram Bot Integration (DEC-149)", () => {
    it("formats liquidity density badge into Telegram reports", () => {
      const mockPoi: RadarPoiItem = {
        ...basePoi,
        symbol: "AVAXUSDT",
        liquidity: {
          densityPercentile: 88,
          tier: "ultra",
          isPeakMagnet: true,
          demandDominancePct: 85,
          sentimentBias: "STRONG_DEMAND",
        },
      };

      const report = formatTelegramRadarReport([mockPoi], "liquidity");

      expect(report.text).toContain("💧 <b>88% Liq</b>");
      expect(report.text).toContain("High Institutional Liquidity Magnets");
    });
  });
});
