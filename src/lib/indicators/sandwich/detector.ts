/**
 * Sandwich Pattern Detector
 *
 * Detects exact 4-candle patterns:
 * - Bearish RGRR with Bearish FVG on GRR (C2.low > C4.high)
 * - Bullish GRGG with Bullish FVG on RGG (C4.low > C2.high)
 *
 * Rules:
 * - Doji (open === close) does not count as green or red
 * - Zone is defined by Candle 2 (Green for RGRR, Red for GRGG)
 * - Zone starts at C2.time and confirms at C4.time
 */

import { Bar } from "@/types/tradingview.d";
import {
  SandwichDirection,
  SandwichPatternType,
  SandwichSettings,
  SandwichTimeframeId,
  SandwichZone,
} from "./types";

export interface PatternCheckResult {
  pattern: SandwichPatternType;
  direction: SandwichDirection;
  c2Index: number;
  c4Index: number;
  top: number;
  bottom: number;
  fvgTop: number;
  fvgBottom: number;
  fvgSize: number;
}

export function isGreen(bar: Bar): boolean {
  return bar.close > bar.open;
}

export function isRed(bar: Bar): boolean {
  return bar.close < bar.open;
}

export function isDoji(bar: Bar): boolean {
  return bar.close === bar.open;
}

/**
 * Checks if 4 consecutive candles ending at index i form a valid Sandwich pattern.
 *
 * @param bars Array of OHLC bars
 * @param i Index of Candle 4 (i >= 3)
 * @param options Detection configuration
 */
export function checkSandwichPatternAt(
  bars: Bar[],
  i: number,
  options: {
    enableRgrr?: boolean;
    enableGrgg?: boolean;
    requireFvg?: boolean;
    minFvgTicks?: number;
    tickSize?: number;
    useBodyOnly?: boolean;
  } = {}
): PatternCheckResult | null {
  if (i < 3 || i >= bars.length) return null;

  const {
    enableRgrr = true,
    enableGrgg = true,
    requireFvg = true,
    minFvgTicks = 0,
    tickSize = 0.01,
    useBodyOnly = false,
  } = options;

  const c1 = bars[i - 3];
  const c2 = bars[i - 2];
  const c3 = bars[i - 1];
  const c4 = bars[i];

  // Any Doji disqualifies both patterns
  if (isDoji(c1) || isDoji(c2) || isDoji(c3) || isDoji(c4)) {
    return null;
  }

  const effectiveMinFvgSize = minFvgTicks > 0 ? minFvgTicks * (tickSize > 0 ? tickSize : 0.01) : 0;

  // 1. Bearish RGRR: C1 Red, C2 Green, C3 Red, C4 Red
  if (enableRgrr && isRed(c1) && isGreen(c2) && isRed(c3) && isRed(c4)) {
    const fvgTop = c2.low;
    const fvgBottom = c4.high;
    const fvgSize = fvgTop - fvgBottom;

    if (requireFvg) {
      if (fvgSize <= 0) return null; // No bearish FVG
      if (fvgSize < effectiveMinFvgSize) return null; // Under minimum threshold
    }

    // Zone comes from Candle 2 (Green candle)
    const top = useBodyOnly ? c2.close : c2.high;
    const bottom = useBodyOnly ? c2.open : c2.low;

    return {
      pattern: "RGRR",
      direction: "bearish",
      c2Index: i - 2,
      c4Index: i,
      top,
      bottom,
      fvgTop,
      fvgBottom,
      fvgSize: Math.max(0, fvgSize),
    };
  }

  // 2. Bullish GRGG: C1 Green, C2 Red, C3 Green, C4 Green
  if (enableGrgg && isGreen(c1) && isRed(c2) && isGreen(c3) && isGreen(c4)) {
    const fvgTop = c4.low;
    const fvgBottom = c2.high;
    const fvgSize = fvgTop - fvgBottom;

    if (requireFvg) {
      if (fvgSize <= 0) return null; // No bullish FVG
      if (fvgSize < effectiveMinFvgSize) return null; // Under minimum threshold
    }

    // Zone comes from Candle 2 (Red candle)
    const top = useBodyOnly ? c2.open : c2.high;
    const bottom = useBodyOnly ? c2.close : c2.low;

    return {
      pattern: "GRGG",
      direction: "bullish",
      c2Index: i - 2,
      c4Index: i,
      top,
      bottom,
      fvgTop,
      fvgBottom,
      fvgSize: Math.max(0, fvgSize),
    };
  }

  return null;
}

/**
 * Scans an array of OHLC bars for all Sandwich patterns.
 */
export function detectAllSandwichPatterns(
  bars: Bar[],
  symbol: string,
  timeframe: SandwichTimeframeId,
  timeframeLabel: string,
  settings: SandwichSettings,
  tickSize: number = 0.01
): SandwichZone[] {
  if (!bars || bars.length < 4) return [];

  const zones: SandwichZone[] = [];

  for (let i = 3; i < bars.length; i++) {
    const check = checkSandwichPatternAt(bars, i, {
      enableRgrr: settings.enableRgrr,
      enableGrgg: settings.enableGrgg,
      requireFvg: settings.requireFvg,
      minFvgTicks: settings.minFvgTicks,
      tickSize,
      useBodyOnly: settings.useBodyOnly,
    });

    if (check) {
      const c2 = bars[check.c2Index];
      const c4 = bars[check.c4Index];

      const zone: SandwichZone = {
        id: `sz_${symbol}_${timeframe}_${c2.time}_${check.pattern}`,
        symbol,
        timeframe,
        timeframeLabel,
        direction: check.direction,
        pattern: check.pattern,
        sourceCandleTime: c2.time,
        confirmedAt: c4.time,
        top: check.top,
        bottom: check.bottom,
        fvgTop: check.fvgTop,
        fvgBottom: check.fvgBottom,
        fvgSize: check.fvgSize,
        isPlus: false,
        matchedSRTimeframes: [],
        status: "active",
        mitigationMode: settings.mitigationMode,
      };

      zones.push(zone);
    }
  }

  return zones;
}
