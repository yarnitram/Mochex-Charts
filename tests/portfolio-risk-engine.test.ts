import { describe, it, expect } from "vitest";
import {
  classifyCryptoSector,
  calculatePearsonCorrelation,
  calculateReturnsSeries,
  calculateBtcCorrelationFromBars,
  estimateBtcCorrelation,
  getCorrelationTier,
  evaluatePoiCorrelationRisk,
  evaluatePortfolioRiskHeat,
  ScannedCandidateForRisk,
} from "@/lib/indicators/portfolio-risk-engine";
import { CandlestickBar } from "@/lib/mexc/types";

describe("Multi-Asset Portfolio Risk Heat & Correlated POI Exposure Engine (DEC-155)", () => {
  describe("classifyCryptoSector", () => {
    it("correctly identifies Layer 1 / Majors", () => {
      expect(classifyCryptoSector("BTCUSDT").id).toBe("majors_l1");
      expect(classifyCryptoSector("ETHUSDT").id).toBe("majors_l1");
      expect(classifyCryptoSector("SOLUSDT").id).toBe("majors_l1");
      expect(classifyCryptoSector("SUIUSDT").id).toBe("majors_l1");
      expect(classifyCryptoSector("AVAXUSDT").id).toBe("majors_l1");
    });

    it("correctly identifies AI tokens", () => {
      expect(classifyCryptoSector("TAOUSDT").id).toBe("ai");
      expect(classifyCryptoSector("RENDERUSDT").id).toBe("ai");
      expect(classifyCryptoSector("FETUSDT").id).toBe("ai");
      expect(classifyCryptoSector("ICPUSDT").id).toBe("ai");
      expect(classifyCryptoSector("ACTUSDT").id).toBe("ai");
    });

    it("correctly identifies Meme coins", () => {
      expect(classifyCryptoSector("DOGEUSDT").id).toBe("memes");
      expect(classifyCryptoSector("PEPEUSDT").id).toBe("memes");
      expect(classifyCryptoSector("WIFUSDT").id).toBe("memes");
      expect(classifyCryptoSector("BONKUSDT").id).toBe("memes");
      expect(classifyCryptoSector("PNUTUSDT").id).toBe("memes");
    });

    it("correctly identifies DeFi tokens", () => {
      expect(classifyCryptoSector("UNIUSDT").id).toBe("defi");
      expect(classifyCryptoSector("AAVEUSDT").id).toBe("defi");
      expect(classifyCryptoSector("PENDLEUSDT").id).toBe("defi");
      expect(classifyCryptoSector("JUPUSDT").id).toBe("defi");
    });

    it("correctly identifies Infra & DePIN tokens", () => {
      expect(classifyCryptoSector("FILUSDT").id).toBe("infra_depin");
      expect(classifyCryptoSector("LINKUSDT").id).toBe("infra_depin");
      expect(classifyCryptoSector("HNTUSDT").id).toBe("infra_depin");
    });

    it("falls back to other for unknown tokens", () => {
      expect(classifyCryptoSector("UNKNOWNTOKENUSDT").id).toBe("other");
    });
  });

  describe("calculatePearsonCorrelation", () => {
    it("returns +1.0 for perfectly positively correlated series", () => {
      const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const b = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
      const corr = calculatePearsonCorrelation(a, b);
      expect(corr).toBe(1);
    });

    it("returns -1.0 for perfectly negatively correlated series", () => {
      const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const b = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      const corr = calculatePearsonCorrelation(a, b);
      expect(corr).toBe(-1);
    });

    it("returns close to 0 for orthogonal series", () => {
      const a = [1, -1, 1, -1, 1, -1, 1, -1];
      const b = [1, 1, -1, -1, 1, 1, -1, -1];
      const corr = calculatePearsonCorrelation(a, b);
      expect(Math.abs(corr)).toBeLessThan(0.3);
    });

    it("safely handles series with zero variance (identical values)", () => {
      const a = [5, 5, 5, 5, 5, 5];
      const b = [1, 2, 3, 4, 5, 6];
      expect(calculatePearsonCorrelation(a, b)).toBe(0);
    });

    it("returns 0 for arrays shorter than 5 elements", () => {
      expect(calculatePearsonCorrelation([1, 2], [2, 4])).toBe(0);
    });
  });

  describe("calculateReturnsSeries", () => {
    it("calculates percentage changes from prices", () => {
      const prices = [100, 110, 99];
      const ret = calculateReturnsSeries(prices);
      expect(ret.length).toBe(2);
      expect(ret[0]).toBeCloseTo(0.1, 4);
      expect(ret[1]).toBeCloseTo(-0.1, 4);
    });

    it("handles empty or single item arrays", () => {
      expect(calculateReturnsSeries([])).toEqual([]);
      expect(calculateReturnsSeries([100])).toEqual([]);
    });
  });

  describe("calculateBtcCorrelationFromBars", () => {
    it("computes correlation using candlestick bars", () => {
      const btcBars: CandlestickBar[] = [
        { time: 100, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { time: 200, open: 101, high: 105, low: 100, close: 104, volume: 1200 },
        { time: 300, open: 104, high: 104, low: 98, close: 99, volume: 1500 },
        { time: 400, open: 99, high: 103, low: 98, close: 102, volume: 1100 },
        { time: 500, open: 102, high: 107, low: 101, close: 106, volume: 1300 },
        { time: 600, open: 106, high: 109, low: 105, close: 108, volume: 1400 },
      ];

      // Mirror moves (high correlation)
      const altBars: CandlestickBar[] = btcBars.map((b) => ({
        ...b,
        close: b.close * 2.5,
      }));

      const corr = calculateBtcCorrelationFromBars(altBars, btcBars);
      expect(corr).toBeGreaterThan(0.95);
    });
  });

  describe("estimateBtcCorrelation & getCorrelationTier", () => {
    it("returns 1.0 for BTC", () => {
      expect(estimateBtcCorrelation("BTCUSDT", 2.5, 2.5)).toBe(1.0);
    });

    it("elevates correlation when asset moves in same direction as BTC", () => {
      const corrSame = estimateBtcCorrelation("SOLUSDT", 5.0, 3.0);
      const corrOpposite = estimateBtcCorrelation("SOLUSDT", -5.0, 3.0);
      expect(corrSame).toBeGreaterThan(corrOpposite);
    });

    it("correctly maps qualitative correlation tiers", () => {
      expect(getCorrelationTier(0.85)).toBe("HIGH");
      expect(getCorrelationTier(0.55)).toBe("MODERATE");
      expect(getCorrelationTier(0.15)).toBe("LOW");
      expect(getCorrelationTier(-0.45)).toBe("INVERSE");
    });
  });

  describe("evaluatePoiCorrelationRisk", () => {
    it("produces complete correlation telemetry for an individual POI item", () => {
      const riskInfo = evaluatePoiCorrelationRisk(
        "TAOUSDT",
        "BULLISH",
        0.8, // 0.8% distance (in-zone)
        0.78, // high BTC correlation
        4 // 4 other AI bullish peers
      );

      expect(riskInfo.sector).toBe("ai");
      expect(riskInfo.sectorBadge).toBe("🤖 AI Tokens");
      expect(riskInfo.correlationTier).toBe("HIGH");
      expect(riskInfo.clusterExposureScore).toBeGreaterThanOrEqual(60);
      expect(riskInfo.correlatedPeersCount).toBe(4);
    });
  });

  describe("evaluatePortfolioRiskHeat", () => {
    it("reports LOW risk for well-balanced, non-clustered candidate sets", () => {
      const candidates: ScannedCandidateForRisk[] = [
        { symbol: "BTCUSDT", direction: "BULLISH", distancePct: 4.5, change24h: 1.2 },
        { symbol: "ETHUSDT", direction: "BEARISH", distancePct: 5.0, change24h: -0.8 },
        { symbol: "SOLUSDT", direction: "BULLISH", distancePct: 3.8, change24h: 1.5 },
        { symbol: "UNIUSDT", direction: "BEARISH", distancePct: 4.0, change24h: -1.0 },
      ];

      const summary = evaluatePortfolioRiskHeat(candidates, 1.2);
      expect(summary.totalActivePois).toBe(4);
      expect(summary.directionalBias).toBe("NEUTRAL");
      expect(summary.riskTier).toBe("LOW");
      expect(summary.overallRiskScore).toBeLessThan(35);
      expect(summary.warningMessages[0]).toContain("Balanced");
    });

    it("flags EXTREME / ELEVATED risk for crowded directional clusters with simultaneous proximity", () => {
      // 6 Layer 1 & AI tokens all bullish, all within < 1.0% distance (simultaneous zone breach)
      const candidates: ScannedCandidateForRisk[] = [
        { symbol: "BTCUSDT", direction: "BULLISH", distancePct: 0.5, isInZone: true, change24h: 4.5 },
        { symbol: "ETHUSDT", direction: "BULLISH", distancePct: 0.8, change24h: 5.0 },
        { symbol: "SOLUSDT", direction: "BULLISH", distancePct: 0.6, change24h: 6.2 },
        { symbol: "AVAXUSDT", direction: "BULLISH", distancePct: 0.9, change24h: 4.8 },
        { symbol: "SUIUSDT", direction: "BULLISH", distancePct: 0.7, change24h: 5.5 },
        { symbol: "NEARUSDT", direction: "BULLISH", distancePct: 0.4, isInZone: true, change24h: 5.1 },
      ];

      const summary = evaluatePortfolioRiskHeat(candidates, 4.5);
      expect(summary.directionalBias).toBe("HEAVY_BULLISH");
      expect(summary.directionalSkewPct).toBe(100);
      expect(summary.nearProximityPoisCount).toBe(6);
      expect(summary.overallRiskScore).toBeGreaterThanOrEqual(70);
      expect(["ELEVATED", "EXTREME"]).toContain(summary.riskTier);
      expect(summary.warningMessages.some((m) => m.includes("Directional Crowding"))).toBe(true);
      expect(summary.warningMessages.some((m) => m.includes("Simultaneous Exposure"))).toBe(true);
      expect(summary.sizingRecommendation).toContain("reduced sizing");
    });

    it("accurately detects sector-specific concentration in AI and Meme coins", () => {
      const candidates: ScannedCandidateForRisk[] = [
        { symbol: "TAOUSDT", direction: "BULLISH", distancePct: 0.5, change24h: 3.5 },
        { symbol: "RENDERUSDT", direction: "BULLISH", distancePct: 0.8, change24h: 4.0 },
        { symbol: "FETUSDT", direction: "BULLISH", distancePct: 0.9, change24h: 3.8 },
        { symbol: "ICPUSDT", direction: "BULLISH", distancePct: 1.1, change24h: 2.9 },
        { symbol: "BTCUSDT", direction: "BEARISH", distancePct: 3.5, change24h: 0.5 },
      ];

      const summary = evaluatePortfolioRiskHeat(candidates, 0.5);
      const aiMetrics = summary.sectorBreakdown.ai;

      expect(aiMetrics.totalCoins).toBe(4);
      expect(aiMetrics.bullishCount).toBe(4);
      expect(aiMetrics.nearProximityCount).toBe(4);
      expect(aiMetrics.sectorHeatScore).toBeGreaterThanOrEqual(50);
      expect(summary.warningMessages.some((m) => m.includes("Artificial Intelligence"))).toBe(true);
    });
  });
});
