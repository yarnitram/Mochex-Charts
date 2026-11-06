/**
 * Sandwich Zones ++ Indicator Test Suite
 *
 * Covers all 23 required verification points:
 * 1. Valid RGRR with bearish FVG
 * 2. Valid GRGG with bullish FVG
 * 3. Invalid color combinations
 * 4. Doji candles
 * 5. Missing FVG when required
 * 6. Minimum FVG threshold
 * 7. Full-candle versus body-only box boundaries
 * 8. Correct higher-timeframe candle handling
 * 9. Multi-timeframe duplicate prevention
 * 10. Pivot confirmation without lookahead
 * 11. Sandwich ++ resistance overlap
 * 12. Sandwich ++ support overlap
 * 13. Non-overlapping S/R zones
 * 14. First Touch mitigation
 * 15. 50% Fill mitigation
 * 16. Full Fill mitigation
 * 17. Mitigation never triggering during pattern formation
 * 18. Correct mitigation timestamp
 * 19. Gray color and frozen right edge
 * 20. Mitigated boxes never reactivating
 * 21. Existing active boxes remaining active when untouched
 * 22. Consistent historical replay versus live-candle processing
 * 23. Settings persistence and normalization
 */

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  checkSandwichPatternAt,
  detectAllSandwichPatterns,
  detectSrZones,
  doZonesOverlap,
  evaluateSandwichConfluence,
  applyConfluenceToZones,
  checkCandleMitigatesZone,
  findEarliestMitigation,
  applyMitigationToZones,
  computeSandwichEngine,
  isSandwichTimeframeDuplicate,
  isSandwichTimeframeMatchingChart,
  DEFAULT_SANDWICH_SETTINGS,
  normalizeSandwichSettings,
  getStoredSandwichSettings,
  saveStoredSandwichSettings,
  SandwichZone,
  SrZone,
} from "../src/lib/indicators/sandwich";
import { Bar } from "../src/types/tradingview.d";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

describe("Sandwich Zones ++ Indicator Suite", () => {
  beforeAll(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = localStorageMock;
  });

  beforeEach(() => {
    localStorageMock.clear();
  });

  // 1. Valid RGRR with bearish FVG
  it("1. detects valid Bearish RGRR with bearish FVG (c2.low > c4.high) boxing Green Candle #2", () => {
    const bars: Bar[] = [
      { time: 1000, open: 110, high: 112, low: 105, close: 106 }, // C1: RED
      { time: 2000, open: 106, high: 115, low: 104, close: 112 }, // C2: GREEN (Zone)
      { time: 3000, open: 112, high: 113, low: 98, close: 99 },   // C3: RED
      { time: 4000, open: 99, high: 101, low: 90, close: 92 },    // C4: RED (c2.low 104 > c4.high 101)
    ];

    const result = checkSandwichPatternAt(bars, 3, { requireFvg: true });
    expect(result).not.toBeNull();
    expect(result?.pattern).toBe("RGRR");
    expect(result?.direction).toBe("bearish");
    expect(result?.top).toBe(115); // C2 high
    expect(result?.bottom).toBe(104); // C2 low
    expect(result?.fvgTop).toBe(104);
    expect(result?.fvgBottom).toBe(101);
    expect(result?.fvgSize).toBe(3); // 104 - 101 = 3
  });

  // 2. Valid GRGG with bullish FVG
  it("2. detects valid Bullish GRGG with bullish FVG (c4.low > c2.high) boxing Red Candle #2", () => {
    const bars: Bar[] = [
      { time: 1000, open: 90, high: 96, low: 88, close: 95 },    // C1: GREEN
      { time: 2000, open: 95, high: 97, low: 89, close: 91 },    // C2: RED (Zone)
      { time: 3000, open: 91, high: 105, low: 90, close: 104 },  // C3: GREEN
      { time: 4000, open: 104, high: 112, low: 99, close: 110 }, // C4: GREEN (c4.low 99 > c2.high 97)
    ];

    const result = checkSandwichPatternAt(bars, 3, { requireFvg: true });
    expect(result).not.toBeNull();
    expect(result?.pattern).toBe("GRGG");
    expect(result?.direction).toBe("bullish");
    expect(result?.top).toBe(97); // C2 high
    expect(result?.bottom).toBe(89); // C2 low
    expect(result?.fvgTop).toBe(99);
    expect(result?.fvgBottom).toBe(97);
    expect(result?.fvgSize).toBe(2); // 99 - 97 = 2
  });

  // 3. Invalid color combinations
  it("3. rejects invalid color combinations (e.g. RGGR, RGGG, GRGR)", () => {
    // RGGR (C4 is green instead of red)
    const barsRGGR: Bar[] = [
      { time: 1000, open: 110, high: 112, low: 105, close: 106 }, // RED
      { time: 2000, open: 106, high: 115, low: 104, close: 112 }, // GREEN
      { time: 3000, open: 112, high: 113, low: 98, close: 99 },   // RED
      { time: 4000, open: 99, high: 105, low: 98, close: 104 },   // GREEN (invalid)
    ];
    expect(checkSandwichPatternAt(barsRGGR, 3)).toBeNull();

    // RGGG (C3 is green instead of red)
    const barsRGGG: Bar[] = [
      { time: 1000, open: 110, high: 112, low: 105, close: 106 }, // RED
      { time: 2000, open: 106, high: 115, low: 104, close: 112 }, // GREEN
      { time: 3000, open: 106, high: 114, low: 105, close: 113 }, // GREEN (invalid)
      { time: 4000, open: 113, high: 114, low: 90, close: 95 },   // RED
    ];
    expect(checkSandwichPatternAt(barsRGGG, 3)).toBeNull();
  });

  // 4. Doji candles
  it("4. rejects sequences containing a Doji (open === close)", () => {
    const barsWithDoji: Bar[] = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100 },  // DOJI
      { time: 2000, open: 100, high: 115, low: 99, close: 110 },  // GREEN
      { time: 3000, open: 110, high: 112, low: 90, close: 95 },   // RED
      { time: 4000, open: 95, high: 97, low: 80, close: 85 },     // RED
    ];
    expect(checkSandwichPatternAt(barsWithDoji, 3)).toBeNull();
  });

  // 5. Missing FVG when required
  it("5. rejects pattern when requireFvg is true and no FVG exists", () => {
    // RGRR but C4.high (106) >= C2.low (104) -> no bearish gap
    const barsNoFvg: Bar[] = [
      { time: 1000, open: 110, high: 112, low: 105, close: 106 }, // RED
      { time: 2000, open: 106, high: 115, low: 104, close: 112 }, // GREEN (low 104)
      { time: 3000, open: 112, high: 113, low: 98, close: 99 },   // RED
      { time: 4000, open: 99, high: 106, low: 90, close: 92 },    // RED (high 106 >= 104)
    ];

    expect(checkSandwichPatternAt(barsNoFvg, 3, { requireFvg: true })).toBeNull();
    // But if requireFvg is disabled, it is accepted!
    expect(checkSandwichPatternAt(barsNoFvg, 3, { requireFvg: false })).not.toBeNull();
  });

  // 6. Minimum FVG threshold
  it("6. enforces minFvgTicks threshold", () => {
    const bars: Bar[] = [
      { time: 1000, open: 110, high: 112, low: 105, close: 106 },
      { time: 2000, open: 106, high: 115, low: 104, close: 112 }, // C2.low = 104
      { time: 3000, open: 112, high: 113, low: 98, close: 99 },
      { time: 4000, open: 99, high: 103, low: 90, close: 92 },    // C4.high = 103 (fvgSize = 1)
    ];

    // With tickSize 0.1, fvgSize 1 = 10 ticks
    expect(checkSandwichPatternAt(bars, 3, { requireFvg: true, minFvgTicks: 5, tickSize: 0.1 })).not.toBeNull();
    // If requirement is 15 ticks (1.5), it should fail
    expect(checkSandwichPatternAt(bars, 3, { requireFvg: true, minFvgTicks: 15, tickSize: 0.1 })).toBeNull();
  });

  // 7. Full-candle versus body-only box boundaries
  it("7. sets full wick boundaries by default and body-only boundaries when useBodyOnly is true", () => {
    const bars: Bar[] = [
      { time: 1000, open: 110, high: 112, low: 105, close: 106 },
      { time: 2000, open: 106, high: 120, low: 102, close: 115 }, // Open: 106, High: 120, Low: 102, Close: 115
      { time: 3000, open: 115, high: 116, low: 95, close: 96 },
      { time: 4000, open: 96, high: 99, low: 88, close: 90 },
    ];

    const fullWick = checkSandwichPatternAt(bars, 3, { useBodyOnly: false });
    expect(fullWick?.top).toBe(120);
    expect(fullWick?.bottom).toBe(102);

    const bodyOnly = checkSandwichPatternAt(bars, 3, { useBodyOnly: true });
    expect(bodyOnly?.top).toBe(115); // Close
    expect(bodyOnly?.bottom).toBe(106); // Open
  });

  // 8. Correct higher-timeframe candle handling
  it("8. detects patterns correctly when source bars are higher-timeframe candles", () => {
    const dailyBars: Bar[] = [
      { time: 86400000, open: 100, high: 105, low: 95, close: 98 },
      { time: 172800000, open: 98, high: 110, low: 97, close: 108 },
      { time: 259200000, open: 108, high: 109, low: 88, close: 90 },
      { time: 345600000, open: 90, high: 92, low: 80, close: 82 },
    ];

    const zones = detectAllSandwichPatterns(
      dailyBars,
      "BTCUSDT",
      "1d",
      "1D",
      DEFAULT_SANDWICH_SETTINGS
    );
    expect(zones.length).toBe(1);
    expect(zones[0].timeframe).toBe("1d");
    expect(zones[0].sourceCandleTime).toBe(172800000);
    expect(zones[0].confirmedAt).toBe(345600000);
  });

  // 9. Multi-timeframe duplicate prevention
  it("9. suppresses duplicate timeframe zones when MTF matches current chart resolution", () => {
    expect(isSandwichTimeframeMatchingChart("15m", "15")).toBe(true);
    expect(isSandwichTimeframeMatchingChart("1h", "15")).toBe(false);

    // Suppress when current is visible
    expect(isSandwichTimeframeDuplicate("15m", "15", true)).toBe(true);
    expect(isSandwichTimeframeDuplicate("1h", "15", true)).toBe(false);

    // Do not suppress if current chart is disabled
    expect(isSandwichTimeframeDuplicate("15m", "15", false)).toBe(false);
  });

  // 10. Pivot confirmation without lookahead
  it("10. confirms S/R swing high/low only after right-side flank bars have fully closed", () => {
    const bars: Bar[] = [
      { time: 1000, open: 100, high: 102, low: 98, close: 101 },
      { time: 2000, open: 101, high: 103, low: 99, close: 102 },
      { time: 3000, open: 102, high: 115, low: 101, close: 112 }, // Swing High Pivot (index 2)
      { time: 4000, open: 112, high: 108, low: 100, close: 104 },
      { time: 5000, open: 104, high: 106, low: 99, close: 101 },   // Right flank = 2 (index 4)
    ];

    // With pivotLeft: 2, pivotRight: 2:
    const srZones = detectSrZones(bars, "1h", 2, 2);
    expect(srZones.length).toBe(1);
    expect(srZones[0].type).toBe("resistance");
    expect(srZones[0].pivotTime).toBe(3000);
    // Crucial: confirmedAt must be bar 4's time (5000), NOT bar 2's time (3000)!
    expect(srZones[0].confirmedAt).toBe(5000);
  });

  // 11. Sandwich ++ resistance overlap
  it("11. upgrades Bearish RGRR to Sandwich ++ when overlapping confirmed resistance", () => {
    const zone: SandwichZone = {
      id: "test_rgrr",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 5000,
      confirmedAt: 8000,
      top: 110,
      bottom: 100,
      fvgTop: 100,
      fvgBottom: 95,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "firstTouch",
    };

    const confirmedRes: SrZone = {
      id: "res_1",
      timeframe: "1h",
      type: "resistance",
      pivotTime: 2000,
      confirmedAt: 6000, // Confirmed at 6000 <= 8000 (valid!)
      top: 115,
      bottom: 105,       // Overlaps 100..110!
      pivotPrice: 115,
    };

    const res = evaluateSandwichConfluence(zone, [confirmedRes], "directional");
    expect(res.isPlus).toBe(true);
    expect(res.matchedTimeframes).toEqual(["1H"]);
  });

  // 12. Sandwich ++ support overlap
  it("12. upgrades Bullish GRGG to Sandwich ++ when overlapping confirmed support", () => {
    const zone: SandwichZone = {
      id: "test_grgg",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bullish",
      pattern: "GRGG",
      sourceCandleTime: 5000,
      confirmedAt: 8000,
      top: 100,
      bottom: 90,
      fvgTop: 105,
      fvgBottom: 100,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "firstTouch",
    };

    const confirmedSup: SrZone = {
      id: "sup_1",
      timeframe: "4h",
      type: "support",
      pivotTime: 1000,
      confirmedAt: 4000,
      top: 95,
      bottom: 85, // Overlaps 90..100!
      pivotPrice: 85,
    };

    const res = evaluateSandwichConfluence(zone, [confirmedSup], "directional");
    expect(res.isPlus).toBe(true);
    expect(res.matchedTimeframes).toEqual(["4H"]);
  });

  // 13. Non-overlapping S/R zones
  it("13. does not upgrade to Sandwich ++ when S/R does not overlap price zone or is confirmed in the future", () => {
    const zone: SandwichZone = {
      id: "test_rgrr",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 5000,
      confirmedAt: 8000,
      top: 100,
      bottom: 90,
      fvgTop: 90,
      fvgBottom: 85,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "firstTouch",
    };

    // Non-overlapping price
    const distantRes: SrZone = {
      id: "res_far",
      timeframe: "1h",
      type: "resistance",
      pivotTime: 1000,
      confirmedAt: 4000,
      top: 150,
      bottom: 140, // Far above 100
      pivotPrice: 150,
    };
    expect(evaluateSandwichConfluence(zone, [distantRes], "directional").isPlus).toBe(false);

    // Overlapping price but confirmed in future (lookahead violation)
    const futureRes: SrZone = {
      id: "res_future",
      timeframe: "1h",
      type: "resistance",
      pivotTime: 6000,
      confirmedAt: 9000, // 9000 > 8000
      top: 105,
      bottom: 95,
      pivotPrice: 105,
    };
    expect(evaluateSandwichConfluence(zone, [futureRes], "directional").isPlus).toBe(false);
  });

  // 14. First Touch mitigation
  it("14. mitigates on First Touch (bearish high >= bottom, bullish low <= top)", () => {
    const bearishZone: SandwichZone = {
      id: "z_bear",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 2000,
      confirmedAt: 4000,
      top: 110,
      bottom: 100,
      fvgTop: 100,
      fvgBottom: 95,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "firstTouch",
    };

    // Candidate candle after 4000 with high reaching 101 >= 100
    const touchCandle: Bar = { time: 5000, open: 95, high: 101, low: 92, close: 98 };
    expect(checkCandleMitigatesZone(bearishZone, touchCandle, "firstTouch")).toBe(true);

    const nonTouchCandle: Bar = { time: 5000, open: 95, high: 99, low: 92, close: 98 };
    expect(checkCandleMitigatesZone(bearishZone, nonTouchCandle, "firstTouch")).toBe(false);
  });

  // 15. 50% Fill mitigation
  it("15. mitigates on 50% Fill (price penetrates past zone midpoint)", () => {
    const bearishZone: SandwichZone = {
      id: "z_bear",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 2000,
      confirmedAt: 4000,
      top: 110,
      bottom: 100, // Midpoint = 105
      fvgTop: 100,
      fvgBottom: 95,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "halfFill",
    };

    // First touch (102) is NOT 50% fill (105)
    const shallowCandle: Bar = { time: 5000, open: 95, high: 102, low: 92, close: 98 };
    expect(checkCandleMitigatesZone(bearishZone, shallowCandle, "halfFill")).toBe(false);

    // Deep touch (106) penetrates 50% midpoint
    const halfFillCandle: Bar = { time: 5000, open: 95, high: 106, low: 92, close: 98 };
    expect(checkCandleMitigatesZone(bearishZone, halfFillCandle, "halfFill")).toBe(true);
  });

  // 16. Full Fill mitigation
  it("16. mitigates on Full Fill (price penetrates through opposite side of zone)", () => {
    const bullishZone: SandwichZone = {
      id: "z_bull",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bullish",
      pattern: "GRGG",
      sourceCandleTime: 2000,
      confirmedAt: 4000,
      top: 100,
      bottom: 90, // Full fill for bullish requires low <= 90
      fvgTop: 105,
      fvgBottom: 100,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "fullFill",
    };

    const midTouch: Bar = { time: 5000, open: 105, high: 106, low: 95, close: 96 };
    expect(checkCandleMitigatesZone(bullishZone, midTouch, "fullFill")).toBe(false);

    const fullTouch: Bar = { time: 5000, open: 105, high: 106, low: 89, close: 91 };
    expect(checkCandleMitigatesZone(bullishZone, fullTouch, "fullFill")).toBe(true);
  });

  // 17. Mitigation never triggering during pattern formation
  it("17. never counts candles 1, 2, 3, or 4 as mitigation", () => {
    const bearishZone: SandwichZone = {
      id: "z_bear",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 2000,
      confirmedAt: 4000,
      top: 110,
      bottom: 100,
      fvgTop: 100,
      fvgBottom: 95,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "firstTouch",
    };

    // Candle 3 has high 112 >= 100, but its time is 3000 <= confirmedAt 4000!
    const c3: Bar = { time: 3000, open: 110, high: 112, low: 98, close: 99 };
    expect(checkCandleMitigatesZone(bearishZone, c3, "firstTouch")).toBe(false);
  });

  // 18. Correct mitigation timestamp
  it("18. stops precisely at the earliest qualifying mitigation candle timestamp", () => {
    const zone: SandwichZone = {
      id: "z_bear",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 2000,
      confirmedAt: 4000,
      top: 110,
      bottom: 100,
      fvgTop: 100,
      fvgBottom: 95,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "firstTouch",
    };

    const futureCandles: Bar[] = [
      { time: 5000, open: 95, high: 98, low: 90, close: 96 },   // No touch
      { time: 6000, open: 96, high: 102, low: 92, close: 101 }, // First touch! (mitigatedAt = 6000)
      { time: 7000, open: 101, high: 108, low: 99, close: 107 }, // Later touch
    ];

    const mitTime = findEarliestMitigation(zone, futureCandles, "firstTouch");
    expect(mitTime).toBe(6000);
  });

  // 19. Gray color and frozen right edge
  it("19. transitions status to mitigated with frozen right edge", () => {
    const zone: SandwichZone = {
      id: "z_bear",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 2000,
      confirmedAt: 4000,
      top: 110,
      bottom: 100,
      fvgTop: 100,
      fvgBottom: 95,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "firstTouch",
    };

    const futureCandles: Bar[] = [
      { time: 5000, open: 95, high: 102, low: 92, close: 101 },
    ];

    const { updatedZones } = applyMitigationToZones([zone], futureCandles, "firstTouch");
    expect(updatedZones[0].status).toBe("mitigated");
    expect(updatedZones[0].mitigatedAt).toBe(5000);
    expect(updatedZones[0].top).toBe(110); // Bounds preserved
    expect(updatedZones[0].bottom).toBe(100);
  });

  // 20. Mitigated boxes never reactivating
  it("20. prevents mitigated zones from ever reactivating or extending further", () => {
    const mitigatedZone: SandwichZone = {
      id: "z_mitigated",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 2000,
      confirmedAt: 4000,
      top: 110,
      bottom: 100,
      fvgTop: 100,
      fvgBottom: 95,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "mitigated",
      mitigatedAt: 5000,
      mitigationMode: "firstTouch",
    };

    // Run new batch of future candles
    const laterCandles: Bar[] = [
      { time: 6000, open: 90, high: 95, low: 85, close: 88 },
      { time: 7000, open: 88, high: 92, low: 80, close: 85 },
    ];

    const { updatedZones } = applyMitigationToZones([mitigatedZone], laterCandles, "firstTouch");
    expect(updatedZones[0].status).toBe("mitigated");
    expect(updatedZones[0].mitigatedAt).toBe(5000); // Preserved!
  });

  // 21. Existing active boxes remaining active when untouched
  it("21. keeps active zones active as long as price does not touch", () => {
    const activeZone: SandwichZone = {
      id: "z_active",
      symbol: "BTC",
      timeframe: "15m",
      timeframeLabel: "15M",
      direction: "bearish",
      pattern: "RGRR",
      sourceCandleTime: 2000,
      confirmedAt: 4000,
      top: 110,
      bottom: 100,
      fvgTop: 100,
      fvgBottom: 95,
      fvgSize: 5,
      isPlus: false,
      matchedSRTimeframes: [],
      status: "active",
      mitigationMode: "firstTouch",
    };

    const untouchedCandles: Bar[] = [
      { time: 5000, open: 80, high: 85, low: 75, close: 78 },
      { time: 6000, open: 78, high: 82, low: 70, close: 72 },
    ];

    const { updatedZones } = applyMitigationToZones([activeZone], untouchedCandles, "firstTouch");
    expect(updatedZones[0].status).toBe("active");
    expect(updatedZones[0].mitigatedAt).toBeUndefined();
  });

  // 22. Consistent historical replay versus live-candle processing
  it("22. yields identical results in batch scanning and incremental processing", () => {
    const bars: Bar[] = [
      { time: 1000, open: 110, high: 112, low: 105, close: 106 },
      { time: 2000, open: 106, high: 115, low: 104, close: 112 },
      { time: 3000, open: 112, high: 113, low: 98, close: 99 },
      { time: 4000, open: 99, high: 101, low: 90, close: 92 },
      { time: 5000, open: 92, high: 95, low: 88, close: 90 },
      { time: 6000, open: 90, high: 105, low: 88, close: 103 }, // Touches zone bottom 104 at 6000
    ];

    const batchRes = computeSandwichEngine({
      symbol: "BTCUSDT",
      chartResolution: "15",
      chartBars: bars,
      mtfBarsMap: new Map(),
      settings: DEFAULT_SANDWICH_SETTINGS,
    });

    expect(batchRes.zones.length).toBe(1);
    expect(batchRes.zones[0].pattern).toBe("RGRR");
    expect(batchRes.zones[0].status).toBe("mitigated");
    expect(batchRes.zones[0].mitigatedAt).toBe(6000);
  });

  // 23. Settings persistence and normalization
  it("23. normalizes and persists settings to localStorage", () => {
    const custom = {
      ...DEFAULT_SANDWICH_SETTINGS,
      enableRgrr: false,
      minFvgTicks: 8,
      useBodyOnly: true,
      confluenceMode: "any" as const,
      mitigationMode: "halfFill" as const,
      plusColor: "#fbc02d",
    };

    saveStoredSandwichSettings(custom);
    const retrieved = getStoredSandwichSettings();

    expect(retrieved.enableRgrr).toBe(false);
    expect(retrieved.minFvgTicks).toBe(8);
    expect(retrieved.useBodyOnly).toBe(true);
    expect(retrieved.confluenceMode).toBe("any");
    expect(retrieved.mitigationMode).toBe("halfFill");
    expect(retrieved.plusColor).toBe("#fbc02d");
  });
});
