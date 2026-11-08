import { describe, it, expect } from "vitest";
import {
  calculateCandleDelta,
  calculateCandleCvdSeries,
  detectCvdDivergence,
  computeOrderbookImbalance,
  evaluatePoiOrderFlow,
} from "../src/lib/indicators/orderbook-cvd-engine";
import { CandlestickBar } from "../src/lib/mexc/types";
import { RadarPoiItem } from "../src/lib/indicators/radar-poi-engine";
import { generateRadarCsv, generateRadarJson, ExportableRadarItem } from "../src/lib/screener/radar-export";

describe("Institutional Orderbook Imbalance & CVD Absorption Scanner (DEC-153)", () => {
  const baseTime = 1700000000000;
  const barInterval = 15 * 60 * 1000;

  describe("Intra-Candle Delta Decomposition & CVD Accumulation", () => {
    it("computes positive delta for strong bullish expansion bar", () => {
      const bullBar: CandlestickBar = {
        time: baseTime,
        open: 100,
        high: 110,
        low: 99,
        close: 109,
        volume: 1000,
      };
      const delta = calculateCandleDelta(bullBar);
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeGreaterThan(300);
    });

    it("computes negative delta for strong bearish dump bar", () => {
      const bearBar: CandlestickBar = {
        time: baseTime,
        open: 110,
        high: 111,
        low: 98,
        close: 99,
        volume: 1000,
      };
      const delta = calculateCandleDelta(bearBar);
      expect(delta).toBeLessThan(0);
      expect(delta).toBeLessThan(-300);
    });

    it("returns 0 for zero volume or zero range bars", () => {
      expect(calculateCandleDelta({ time: baseTime, open: 100, high: 100, low: 100, close: 100, volume: 500 })).toBe(0);
      expect(calculateCandleDelta({ time: baseTime, open: 100, high: 105, low: 95, close: 102, volume: 0 })).toBe(0);
    });

    it("accumulates running CVD series across candlestick bars", () => {
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 100, high: 105, low: 99, close: 104, volume: 100 },
        { time: baseTime + barInterval, open: 104, high: 108, low: 103, close: 107, volume: 200 },
        { time: baseTime + barInterval * 2, open: 107, high: 108, low: 101, close: 102, volume: 150 },
      ];

      const cvdSeries = calculateCandleCvdSeries(bars);
      expect(cvdSeries.length).toBe(3);
      expect(cvdSeries[0].cvd).toBe(cvdSeries[0].delta);
      expect(cvdSeries[1].cvd).toBeCloseTo(cvdSeries[0].delta + cvdSeries[1].delta, 2);
    });
  });

  describe("CVD Absorption Divergence Detection on POI Touches", () => {
    const mockBullishPoi: RadarPoiItem = {
      id: "poi-demand-1",
      symbol: "BTCUSDT",
      timeframe: "15m",
      category: "sandwich_zone",
      type: "BULLISH",
      label: "Demand Sandwich",
      top: 100,
      bottom: 95,
      meanThreshold: 97.5,
      entryPrice: 100,
      fullRetestPrice: 95,
      status: "testing",
      isInsideZone: true,
      distanceToEntryPct: 0,
      distanceToMtPct: 2.5,
      currentPrice: 97.5,
      time: baseTime,
    };

    it("detects Bullish Absorption when price declines into Demand while CVD expands positive", () => {
      // Candles where price probes down into demand, but strong lower wicks produce net positive buying delta
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 102, high: 103, low: 100, close: 101, volume: 100 },
        { time: baseTime + barInterval, open: 101, high: 101.5, low: 97.0, close: 100.5, volume: 400 }, // lower wick absorption
        { time: baseTime + barInterval * 2, open: 100.5, high: 101.0, low: 96.5, close: 100.2, volume: 600 },
        { time: baseTime + barInterval * 3, open: 100.2, high: 100.8, low: 96.0, close: 100.0, volume: 800 },
        { time: baseTime + barInterval * 4, open: 100.0, high: 100.6, low: 96.0, close: 99.8, volume: 900 },
      ];

      const div = detectCvdDivergence(bars, mockBullishPoi, 5);
      expect(div).not.toBeNull();
      expect(div?.type).toBe("BULLISH_ABSORPTION");
      expect(div?.slopeDelta).toBeGreaterThan(0);
      expect(div?.label).toContain("Bullish CVD Absorption");
    });

    it("detects Bearish Absorption when price pushes up into Supply while CVD expands negative", () => {
      const mockBearishPoi: RadarPoiItem = {
        ...mockBullishPoi,
        id: "poi-supply-1",
        type: "BEARISH",
        label: "Supply Sandwich",
        top: 105,
        bottom: 100,
        entryPrice: 100,
        fullRetestPrice: 105,
      };

      // Price rallies slightly into supply, but heavy upper wicks create net selling delta
      const bars: CandlestickBar[] = [
        { time: baseTime, open: 98, high: 100, low: 97, close: 99, volume: 100 },
        { time: baseTime + barInterval, open: 99, high: 103, low: 98.5, close: 99.5, volume: 400 }, // long upper wick
        { time: baseTime + barInterval * 2, open: 99.5, high: 104, low: 99.0, close: 100.0, volume: 600 }, // heavy upper wick capping
        { time: baseTime + barInterval * 3, open: 100.0, high: 104.5, low: 99.5, close: 100.2, volume: 750 }, // shooting star
        { time: baseTime + barInterval * 4, open: 100.2, high: 103.5, low: 99.0, close: 99.8, volume: 800 },
      ];

      const div = detectCvdDivergence(bars, mockBearishPoi, 5);
      expect(div).not.toBeNull();
      expect(div?.type).toBe("BEARISH_ABSORPTION");
      expect(div?.slopeDelta).toBeLessThan(0);
    });
  });

  describe("Level 2 Order Book Depth Imbalance Calculation", () => {
    it("identifies heavy resting Bid Wall defense when bids dominate", () => {
      const bids: [number, number][] = [
        [98, 50],
        [97.5, 80],
        [97, 120],
      ];
      const asks: [number, number][] = [
        [98.5, 10],
        [99, 15],
        [99.5, 20],
      ];

      const imb = computeOrderbookImbalance(bids, asks);
      expect(imb.dominantSide).toBe("BID");
      expect(imb.bidRatioPct).toBeGreaterThan(70);
      expect(imb.hasWall).toBe(true);
      expect(imb.wallSide).toBe("BID");
      expect(imb.imbalancePct).toBeGreaterThan(40);
    });

    it("identifies heavy resting Ask Wall capping when asks dominate", () => {
      const bids: [number, number][] = [
        [100, 10],
        [99.5, 15],
      ];
      const asks: [number, number][] = [
        [100.5, 80],
        [101, 120],
      ];

      const imb = computeOrderbookImbalance(bids, asks);
      expect(imb.dominantSide).toBe("ASK");
      expect(imb.askRatioPct).toBeGreaterThan(70);
      expect(imb.hasWall).toBe(true);
      expect(imb.wallSide).toBe("ASK");
    });

    it("evaluates balanced book as BALANCED with no wall", () => {
      const bids: [number, number][] = [[100, 50]];
      const asks: [number, number][] = [[101, 50]];

      const imb = computeOrderbookImbalance(bids, asks);
      expect(imb.dominantSide).toBe("BALANCED");
      expect(imb.hasWall).toBe(false);
      expect(imb.wallSide).toBeNull();
      expect(Math.abs(imb.imbalancePct)).toBeLessThan(1);
    });
  });

  describe("Synthesized Order Flow Evaluation & POI Telemetry", () => {
    const poi: RadarPoiItem = {
      id: "poi-demand-test",
      symbol: "ETHUSDT",
      timeframe: "15m",
      category: "order_block",
      type: "BULLISH",
      label: "Bullish OB",
      top: 2500,
      bottom: 2460,
      meanThreshold: 2480,
      entryPrice: 2500,
      fullRetestPrice: 2460,
      status: "testing",
      isInsideZone: true,
      distanceToEntryPct: 0,
      distanceToMtPct: 0.8,
      currentPrice: 2480,
      time: baseTime,
    };

    const bars: CandlestickBar[] = [
      { time: baseTime, open: 2520, high: 2525, low: 2490, close: 2500, volume: 100 },
      { time: baseTime + barInterval, open: 2500, high: 2510, low: 2470, close: 2495, volume: 400 },
      { time: baseTime + barInterval * 2, open: 2495, high: 2505, low: 2465, close: 2488, volume: 600 },
      { time: baseTime + barInterval * 3, open: 2488, high: 2495, low: 2460, close: 2485, volume: 800 },
    ];

    it("confirms absorption with high score when bids defend demand with bullish divergence", () => {
      const orderbook = {
        bids: [[2480, 50], [2475, 80], [2470, 100]] as [number, number][],
        asks: [[2485, 10], [2490, 15]] as [number, number][],
      };

      const flow = evaluatePoiOrderFlow(bars, poi, orderbook);
      expect(flow.absorptionScore).toBeGreaterThanOrEqual(65);
      expect(flow.isAbsorptionConfirmed).toBe(true);
      expect(["ABSORPTION_CONFIRMED", "LIMIT_WALL_DEFENSE"]).toContain(flow.verdict);
      expect(flow.badgeLabel).toContain("BID");
    });

    it("synthesizes microstructure fallback when raw orderbook is not provided", () => {
      const flow = evaluatePoiOrderFlow(bars, poi);
      expect(flow).toBeDefined();
      expect(flow.imbalance).toBeDefined();
      expect(flow.absorptionScore).toBeGreaterThanOrEqual(0);
      expect(flow.absorptionScore).toBeLessThanOrEqual(100);
      expect(typeof flow.summaryText).toBe("string");
    });
  });

  describe("Export Suite Integration (CSV & JSON)", () => {
    it("includes Order Flow telemetry columns in CSV export", () => {
      const sampleItem: ExportableRadarItem = {
        symbol: "BTCUSDT",
        name: "Bitcoin",
        price: 76500,
        change24h: 3.2,
        volume24h: 120000000,
        selectedPoi: {
          id: "poi-1",
          symbol: "BTCUSDT",
          timeframe: "15m",
          category: "order_block",
          type: "BULLISH",
          label: "Bullish OB",
          top: 76000,
          bottom: 75500,
          meanThreshold: 75750,
          entryPrice: 76000,
          fullRetestPrice: 75500,
          status: "fresh",
          isInsideZone: false,
          distanceToEntryPct: 0.65,
          distanceToMtPct: 0.98,
          currentPrice: 76500,
          time: baseTime,
          orderFlow: {
            imbalance: {
              bidDepthTotal: 70000,
              askDepthTotal: 30000,
              totalDepth: 100000,
              bidRatioPct: 70.0,
              askRatioPct: 30.0,
              imbalancePct: 40.0,
              dominantSide: "BID",
              hasWall: true,
              wallSide: "BID",
            },
            divergence: {
              type: "BULLISH_ABSORPTION",
              label: "🛡️ Bullish CVD Absorption",
              slopeDelta: 240,
              priceDeltaPct: -0.2,
              description: "Market sells absorbed by passive bids",
            },
            absorptionScore: 88,
            isAbsorptionConfirmed: true,
            verdict: "ABSORPTION_CONFIRMED",
            badgeLabel: "🛡️ BID ABSORPTION (70%)",
            summaryText: "Confirmed Bullish Absorption",
          },
        },
      };

      const csv = generateRadarCsv([sampleItem]);
      expect(csv).toContain("Order Flow Verdict");
      expect(csv).toContain("Orderbook Imbalance %");
      expect(csv).toContain("Absorption Score");
      expect(csv).toContain("ABSORPTION_CONFIRMED");
      expect(csv).toContain("88/100");
    });

    it("includes Order Flow metadata in JSON export", () => {
      const sampleItem: ExportableRadarItem = {
        symbol: "SOLUSDT",
        price: 198,
        change24h: 4.5,
        selectedPoi: {
          id: "poi-sol-1",
          symbol: "SOLUSDT",
          timeframe: "1H",
          category: "sandwich_zone",
          type: "BEARISH",
          label: "Supply Sandwich",
          top: 205,
          bottom: 200,
          meanThreshold: 202.5,
          entryPrice: 200,
          fullRetestPrice: 205,
          status: "testing",
          isInsideZone: true,
          distanceToEntryPct: 0,
          distanceToMtPct: 2.2,
          currentPrice: 202.5,
          time: baseTime,
          orderFlow: {
            imbalance: {
              bidDepthTotal: 25000,
              askDepthTotal: 75000,
              totalDepth: 100000,
              bidRatioPct: 25.0,
              askRatioPct: 75.0,
              imbalancePct: -50.0,
              dominantSide: "ASK",
              hasWall: true,
              wallSide: "ASK",
            },
            divergence: null,
            absorptionScore: 75,
            isAbsorptionConfirmed: true,
            verdict: "LIMIT_WALL_DEFENSE",
            badgeLabel: "🧱 ASK WALL (75%)",
            summaryText: "Heavy resting ask liquidity capping zone",
          },
        },
      };

      const jsonStr = generateRadarJson([sampleItem]);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.items[0].poi.orderFlow).toBeDefined();
      expect(parsed.items[0].poi.orderFlow.verdict).toBe("LIMIT_WALL_DEFENSE");
      expect(parsed.items[0].poi.orderFlow.absorptionScore).toBe(75);
    });
  });
});
