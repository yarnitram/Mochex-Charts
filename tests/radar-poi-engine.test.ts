import { describe, it, expect } from "vitest";
import {
  computeRadarPois,
  isUnmitigatedValidatedOb,
  RadarPoiItem,
} from "../src/lib/indicators/radar-poi-engine";
import { CandlestickBar } from "../src/lib/mexc/types";

describe("Radar POI Engine (Order Blocks & Sandwich Zones) (DEC-137)", () => {
  const baseTime = 1700000000000;
  const barInterval = 15 * 60 * 1000;

  it("detects both Validated Order Blocks and Bullish Demand Sandwich (GRGG) in candidate bars", () => {
    // Construct candle dataset that produces:
    // 1) Bullish Order Block at index 1: Bearish candle followed by 2 expansion candles with FVG
    // 2) Bullish Sandwich (GRGG):
    //    c0 (Green): open 90, high 96, low 88, close 95
    //    c1 (Red): open 95, high 97, low 89, close 91
    //    c2 (Green): open 91, high 105, low 90, close 104
    //    c3 (Green): open 104, high 112, low 99, close 110 (c3.low 99 > c1.high 97)
    //    c4: current live candle open 110, high 114, low 108, close 112
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 90, high: 96, low: 88, close: 95, volume: 100 },
      { time: baseTime + barInterval, open: 95, high: 97, low: 89, close: 91, volume: 150 },
      { time: baseTime + barInterval * 2, open: 91, high: 105, low: 90, close: 104, volume: 300 },
      { time: baseTime + barInterval * 3, open: 104, high: 112, low: 99, close: 110, volume: 350 },
      { time: baseTime + barInterval * 4, open: 110, high: 114, low: 108, close: 112, volume: 200 },
    ];

    const pois = computeRadarPois(bars, "SOLUSDT", "15m");
    expect(pois.length).toBeGreaterThan(0);

    // Verify presence of Sandwich Zone
    const sandwichPois = pois.filter((p) => p.category === "sandwich_zone");
    expect(sandwichPois.length).toBeGreaterThanOrEqual(1);

    const demandZone = sandwichPois.find((p) => p.pattern === "GRGG");
    expect(demandZone).toBeDefined();
    expect(demandZone?.type).toBe("BULLISH");
    expect(demandZone?.top).toBe(97);
    expect(demandZone?.bottom).toBe(89);
    expect(demandZone?.meanThreshold).toBe(93);
    expect(demandZone?.entryPrice).toBe(97);
    expect(demandZone?.fullRetestPrice).toBe(89);
    expect(demandZone?.currentPrice).toBe(112);
    expect(demandZone?.distanceToEntryPct).toBeGreaterThan(0);
    expect(demandZone?.status).toBe("fresh");

    // Verify presence of Validated Order Block
    const obPois = pois.filter((p) => p.category === "order_block");
    expect(obPois.length).toBeGreaterThanOrEqual(1);
    expect(obPois[0].type).toBe("BULLISH");
  });

  it("detects Bearish Supply Sandwich (RGRR) with proper boundary and mean threshold calculations", () => {
    // c0 (Red): open 110, high 112, low 105, close 106
    // c1 (Green): open 106, high 115, low 104, close 112
    // c2 (Red): open 112, high 113, low 98, close 99
    // c3 (Red): open 99, high 101, low 90, close 92 (c1.low 104 > c3.high 101)
    // c4: current live candle open 92, high 94, low 88, close 90
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 110, high: 112, low: 105, close: 106, volume: 100 },
      { time: baseTime + barInterval, open: 106, high: 115, low: 104, close: 112, volume: 150 },
      { time: baseTime + barInterval * 2, open: 112, high: 113, low: 98, close: 99, volume: 300 },
      { time: baseTime + barInterval * 3, open: 99, high: 101, low: 90, close: 92, volume: 350 },
      { time: baseTime + barInterval * 4, open: 92, high: 94, low: 88, close: 90, volume: 200 },
    ];

    const pois = computeRadarPois(bars, "BTCUSDT", "1H");
    const supplySandwich = pois.find(
      (p) => p.category === "sandwich_zone" && p.pattern === "RGRR"
    );

    expect(supplySandwich).toBeDefined();
    expect(supplySandwich?.type).toBe("BEARISH");
    expect(supplySandwich?.top).toBe(115);
    expect(supplySandwich?.bottom).toBe(104);
    expect(supplySandwich?.meanThreshold).toBe(109.5);
    // For bearish, entry price is the bottom of the supply zone (104)
    expect(supplySandwich?.entryPrice).toBe(104);
    // Full retest price is the top of the supply zone (115)
    expect(supplySandwich?.fullRetestPrice).toBe(115);
    expect(supplySandwich?.currentPrice).toBe(90);
    // Distance from current price (90) to entry (104): (104 - 90) / 90 * 100 = 15.55%
    expect(supplySandwich?.distanceToEntryPct).toBeCloseTo(15.55, 1);
  });

  it("identifies testing status when current price is inside the zone", () => {
    // Current price inside the supply zone [104, 115]
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 110, high: 112, low: 105, close: 106, volume: 100 },
      { time: baseTime + barInterval, open: 106, high: 115, low: 104, close: 112, volume: 150 },
      { time: baseTime + barInterval * 2, open: 112, high: 113, low: 98, close: 99, volume: 300 },
      { time: baseTime + barInterval * 3, open: 99, high: 101, low: 90, close: 92, volume: 350 },
      { time: baseTime + barInterval * 4, open: 92, high: 108, low: 91, close: 107, volume: 200 },
    ];

    const pois = computeRadarPois(bars, "ETHUSDT", "4H");
    const supplySandwich = pois.find(
      (p) => p.category === "sandwich_zone" && p.pattern === "RGRR"
    );

    expect(supplySandwich).toBeDefined();
    expect(supplySandwich?.isInsideZone).toBe(true);
    expect(supplySandwich?.status).toBe("testing");
  });

  it("detects Standalone Fair Value Gaps (FVG) with 50% Consequent Encroachment (DEC-138)", () => {
    // Bullish FVG: Bar 2 low (110) > Bar 0 high (102). Gap is [102, 110].
    // Bar 3: price remains above gap at 115 without creating a new FVG
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 100, high: 102, low: 99, close: 101, volume: 100 },
      { time: baseTime + barInterval, open: 101, high: 113, low: 101, close: 108, volume: 250 },
      { time: baseTime + barInterval * 2, open: 108, high: 116, low: 110, close: 114, volume: 300 },
      { time: baseTime + barInterval * 3, open: 114, high: 118, low: 112, close: 115, volume: 200 },
    ];

    const pois = computeRadarPois(bars, "SOLUSDT", "15m");
    const fvgPoi = pois.find((p) => p.category === "fvg");

    expect(fvgPoi).toBeDefined();
    expect(fvgPoi?.type).toBe("BULLISH");
    expect(fvgPoi?.top).toBe(110);
    expect(fvgPoi?.bottom).toBe(102);
    expect(fvgPoi?.meanThreshold).toBe(106); // 50% Consequent Encroachment (CE)
    expect(fvgPoi?.entryPrice).toBe(110);
    expect(fvgPoi?.fullRetestPrice).toBe(102);
    expect(fvgPoi?.currentPrice).toBe(115);
    // Distance to entry (110): (115 - 110) / 115 * 100 = 4.348%
    expect(fvgPoi?.distanceToEntryPct).toBeCloseTo(4.35, 1);
  });

  it("marks any shallow >0% hit on a Validated OB as touched/mitigated and enforces 0% hit eligibility", () => {
    // Bullish OB at idx 0: Red candle [97..101]
    // C1 (idx 1): Green displacement 98..106
    // C2 (idx 2): Green confirm 106..112 (C2.low=104 > C0.high=101)
    // C3 (idx 3): Shallow wick down to 100.5 (hits OB top 101 without reaching 50% MT 99), then bounces above 104
    const bars: CandlestickBar[] = [
      { time: baseTime, open: 100, high: 101, low: 97, close: 98, volume: 100 },
      { time: baseTime + barInterval, open: 98, high: 106, low: 98, close: 106, volume: 300 },
      { time: baseTime + barInterval * 2, open: 106, high: 112, low: 104, close: 111, volume: 300 },
      { time: baseTime + barInterval * 3, open: 111, high: 111, low: 100.5, close: 108, volume: 250 },
    ];

    const pois = computeRadarPois(bars, "BTCUSDT", "1H");
    const obPoi = pois.find((p) => p.category === "order_block");
    expect(obPoi).toBeDefined();
    expect(obPoi?.touched).toBe(true);
    expect(obPoi?.status).toBe("mitigated");
    expect(isUnmitigatedValidatedOb(obPoi!)).toBe(false);

    // Fresh untouched (0% hit) bar slice before C3
    // Fresh untouched (0% hit) 4-bar slice where bar 3 stays strictly above OB [97..101]
    const freshBars: CandlestickBar[] = [
      ...bars.slice(0, 3),
      { time: baseTime + barInterval * 3, open: 111, high: 115, low: 105, close: 114, volume: 250 },
    ];
    const freshPois = computeRadarPois(freshBars, "BTCUSDT", "1H");
    const freshOb = freshPois.find((p) => p.category === "order_block");
    expect(freshOb).toBeDefined();
    expect(freshOb?.touched).toBe(false);
    expect(freshOb?.status).toBe("fresh");
    expect(isUnmitigatedValidatedOb(freshOb!)).toBe(true);
  });
});
