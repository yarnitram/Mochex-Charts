import { describe, it, expect } from "vitest";
import {
  computeValidatedOrderBlocks,
  getObAlarmTargetPrice,
} from "../src/lib/indicators/validated-ob-engine";
import {
  getUniverseCoins,
  MAJORS_UNIVERSE,
  TOP_50_MEMES,
  TOP_50_AI,
  TOP_150_MEMES,
  TOP_150_AI,
} from "../src/lib/screener/universe-catalog";
import { CandlestickBar } from "../src/lib/mexc/types";

describe("Validated Order Block (OB + FVG) Calculation Engine (DEC-136)", () => {
  const baseTime = 1700000000000;
  const barInterval = 15 * 60 * 1000;

  it("detects Validated Bullish Order Blocks with confirmed FVG on the next 2 candles", () => {
    // Construct candle dataset with Bullish OB at index 1:
    // Candle 0: neutral
    // Candle 1 (OB): Bearish candle (open 100, high 102, low 98, close 99)
    // Candle 2 (Exp 1): Bullish expansion (open 99, high 106, low 99, close 105)
    // Candle 3 (Exp 2): Bullish continuation with FVG (open 105, high 112, low 104, close 110)
    // Note: low[3] (104) > high[1] (102), so FVG gap = 104 - 102 = 2.0 (1.96%)
    // Candle 4: Price remains above zone (open 110, high 114, low 108, close 112)
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { time: baseTime + barInterval, open: 100, high: 102, low: 98, close: 99, volume: 150 },
      { time: baseTime + barInterval * 2, open: 99, high: 106, low: 99, close: 105, volume: 300 },
      { time: baseTime + barInterval * 3, open: 105, high: 112, low: 104, close: 110, volume: 350 },
      { time: baseTime + barInterval * 4, open: 110, high: 114, low: 108, close: 112, volume: 200 },
    ];

    const obs = computeValidatedOrderBlocks(bars, "SOLUSDT", "15m");
    expect(obs.length).toBeGreaterThanOrEqual(1);

    const bullOb = obs.find((o) => o.type === "BULLISH");
    expect(bullOb).toBeDefined();
    expect(bullOb?.top).toBe(102);
    expect(bullOb?.bottom).toBe(98);
    expect(bullOb?.meanThreshold).toBe(100);
    expect(bullOb?.entryPrice).toBe(102);
    expect(bullOb?.fullRetestPrice).toBe(98);
    expect(bullOb?.fvgBottom).toBe(102);
    expect(bullOb?.fvgTop).toBe(104);
    expect(bullOb?.fvgGapPct).toBeGreaterThan(0);
    expect(bullOb?.status).toBe("fresh");
  });

  it("detects Validated Bearish Order Blocks with confirmed FVG on the next 2 candles", () => {
    // Construct candle dataset with Bearish OB at index 1:
    // Candle 1 (OB): Bullish candle (open 200, high 204, low 199, close 203)
    // Candle 2 (Exp 1): Bearish drop (open 203, high 203, low 194, close 195)
    // Candle 3 (Exp 2): Bearish continuation with FVG (open 195, high 197, low 190, close 191)
    // Note: high[3] (197) < low[1] (199), so Bearish FVG gap = 199 - 197 = 2.0
    // Candle 4: Price remains below zone (open 191, high 193, low 188, close 189)
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 200, high: 201, low: 198, close: 199, volume: 100 },
      { time: baseTime + barInterval, open: 200, high: 204, low: 199, close: 203, volume: 150 },
      { time: baseTime + barInterval * 2, open: 203, high: 203, low: 194, close: 195, volume: 400 },
      { time: baseTime + barInterval * 3, open: 195, high: 197, low: 190, close: 191, volume: 450 },
      { time: baseTime + barInterval * 4, open: 191, high: 193, low: 188, close: 189, volume: 200 },
    ];

    const obs = computeValidatedOrderBlocks(bars, "BTCUSDT", "4H");
    expect(obs.length).toBeGreaterThanOrEqual(1);

    const bearOb = obs.find((o) => o.type === "BEARISH");
    expect(bearOb).toBeDefined();
    expect(bearOb?.top).toBe(204);
    expect(bearOb?.bottom).toBe(199);
    expect(bearOb?.meanThreshold).toBe(201.5);
    expect(bearOb?.entryPrice).toBe(199);
    expect(bearOb?.fullRetestPrice).toBe(204);
    expect(bearOb?.status).toBe("fresh");
  });

  it("discards unvalidated Order Blocks where no FVG is formed within 2 candles", () => {
    // Candle 1: Bearish candle (open 100, high 102, low 98, close 99)
    // Candle 2: Bullish candle (open 99, high 103, low 99, close 102)
    // Candle 3: High wick overlaps Candle 1 high: low is 101, which is <= high 102 -> NO GAP
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { time: baseTime + barInterval, open: 100, high: 102, low: 98, close: 99, volume: 150 },
      { time: baseTime + barInterval * 2, open: 99, high: 103, low: 99, close: 102, volume: 120 },
      { time: baseTime + barInterval * 3, open: 102, high: 105, low: 101, close: 104, volume: 130 },
    ];

    const obs = computeValidatedOrderBlocks(bars, "ETHUSDT", "1H");
    expect(obs).toHaveLength(0);
  });

  it("accurately tracks mitigation status (fresh -> testing -> mitigated -> broken)", () => {
    // Bullish OB at index 1: top = 100, bottom = 90, MT = 95
    const baseBars: CandlestickBar[] = [
      { time: baseTime, open: 95, high: 96, low: 94, close: 95, volume: 100 },
      { time: baseTime + barInterval, open: 95, high: 100, low: 90, close: 92, volume: 150 },
      { time: baseTime + barInterval * 2, open: 92, high: 110, low: 92, close: 108, volume: 400 },
      { time: baseTime + barInterval * 3, open: 108, high: 115, low: 105, close: 112, volume: 450 },
    ];

    // Case 1: Fresh (price stays above 100)
    const freshObs = computeValidatedOrderBlocks(
      [...baseBars, { time: baseTime + barInterval * 4, open: 112, high: 116, low: 104, close: 114, volume: 100 }],
      "SOLUSDT",
      "4H"
    );
    expect(freshObs[0].status).toBe("fresh");

    // Case 2: Testing (wick dips into top 100, but stays above 50% MT 95)
    const testingObs = computeValidatedOrderBlocks(
      [...baseBars, { time: baseTime + barInterval * 4, open: 112, high: 112, low: 98, close: 103, volume: 100 }],
      "SOLUSDT",
      "4H"
    );
    expect(testingObs[0].status).toBe("testing");

    // Case 3: Mitigated (wick dips below 50% MT 95, but above bottom 90)
    const mitigatedObs = computeValidatedOrderBlocks(
      [...baseBars, { time: baseTime + barInterval * 4, open: 112, high: 112, low: 93, close: 98, volume: 100 }],
      "SOLUSDT",
      "4H"
    );
    expect(mitigatedObs[0].status).toBe("mitigated");

    // Case 4: Broken (wick violates bottom 90)
    const brokenObs = computeValidatedOrderBlocks(
      [...baseBars, { time: baseTime + barInterval * 4, open: 112, high: 112, low: 88, close: 91, volume: 100 }],
      "SOLUSDT",
      "4H"
    );
    expect(brokenObs).toHaveLength(0); // Broken OBs filtered from radar
  });

  it("calculates exact alarm target prices for touch levels (entry, fifty_pct, full)", () => {
    const sampleOb = {
      id: "sample-1",
      symbol: "BTCUSDT",
      timeframe: "4H",
      type: "BULLISH" as const,
      obIndex: 1,
      obTime: 1000,
      top: 68500,
      bottom: 67500,
      meanThreshold: 68000,
      entryPrice: 68500,
      fullRetestPrice: 67500,
      fvgTop: 69000,
      fvgBottom: 68500,
      fvgGapPct: 0.72,
      fvgTime: 2000,
      status: "fresh" as const,
      isInsideZone: false,
      distanceToEntryPct: 0.5,
      distanceToMtPct: 1.2,
      currentPrice: 68840,
    };

    expect(getObAlarmTargetPrice(sampleOb, "entry")).toBe(68500);
    expect(getObAlarmTargetPrice(sampleOb, "fifty_pct")).toBe(68000);
    expect(getObAlarmTargetPrice(sampleOb, "full")).toBe(67500);
  });

  describe("Curated Universe Catalog", () => {
    it("returns correct coin universes with metadata", () => {
      const majors = getUniverseCoins("majors");
      expect(majors.length).toBe(150);
      expect(majors.find((c) => c.symbol === "BTCUSDT")).toBeDefined();

      const memes = getUniverseCoins("memes");
      expect(memes.length).toBe(150);
      expect(memes.find((c) => c.symbol === "DOGEUSDT")).toBeDefined();
      expect(memes.find((c) => c.symbol === "PEPEUSDT")).toBeDefined();
      expect(memes.find((c) => c.symbol === "WIFUSDT")).toBeDefined();

      const ai = getUniverseCoins("ai");
      expect(ai.length).toBe(150);
      expect(ai.find((c) => c.symbol === "TAOUSDT")).toBeDefined();
      expect(ai.find((c) => c.symbol === "RENDERUSDT")).toBeDefined();
      expect(ai.find((c) => c.symbol === "FETUSDT")).toBeDefined();

      const custom = getUniverseCoins("custom", ["TIAUSDT", "SUIUSDT"]);
      expect(custom).toHaveLength(2);
      expect(custom[0].symbol).toBe("TIAUSDT");
      expect(custom[1].symbol).toBe("SUIUSDT");
      expect(custom[0].marketType).toBe("futures");
      expect(custom[0].contractSymbol).toBe("TIA_USDT");
    });

    it("ensures every curated universe contains 150 unique Crypto Perpetual Futures coins with zero Spot-only or Stock tickers", () => {
      const universes = [
        { name: "majors", coins: MAJORS_UNIVERSE },
        { name: "memes", coins: TOP_150_MEMES },
        { name: "ai", coins: TOP_150_AI },
      ];

      expect(TOP_50_MEMES).toBe(TOP_150_MEMES);
      expect(TOP_50_AI).toBe(TOP_150_AI);

      for (const u of universes) {
        expect(u.coins.length).toBe(150);
        const seen = new Set<string>();
        for (const coin of u.coins) {
          expect(seen.has(coin.symbol)).toBe(false);
          seen.add(coin.symbol);
          expect(coin.marketType).toBe("futures");
          expect(coin.contractSymbol).toBeDefined();
          expect(coin.contractSymbol?.endsWith("_USDT")).toBe(true);
          expect(coin.symbol.endsWith("USDT")).toBe(true);
          expect(coin.symbol.includes("STOCK")).toBe(false);
          expect(/^[\x00-\x7F]+$/.test(coin.symbol)).toBe(true);
        }
      }
    });
  });
});
