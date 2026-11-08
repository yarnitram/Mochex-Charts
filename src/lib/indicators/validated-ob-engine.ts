import { CandlestickBar } from "@/lib/mexc/types";

export type OrderBlockType = "BULLISH" | "BEARISH";
export type OrderBlockStatus = "fresh" | "testing" | "mitigated" | "broken";
export type OrderBlockTouchLevel = "entry" | "fifty_pct" | "full";

export interface ValidatedOrderBlock {
  id: string;
  symbol: string;
  timeframe: string;
  type: OrderBlockType;
  obIndex: number;
  obTime: number;
  // Price boundaries
  top: number;
  bottom: number;
  meanThreshold: number; // 50% equilibrium level
  entryPrice: number;    // Bullish: top, Bearish: bottom
  fullRetestPrice: number; // Bullish: bottom, Bearish: top
  // FVG confluence details (formed on candle i + 2 next candles)
  fvgTop: number;
  fvgBottom: number;
  fvgGapPct: number;
  fvgTime: number;
  // Status and proximity
  status: OrderBlockStatus;
  isInsideZone: boolean;
  distanceToEntryPct: number; // % distance from current price to entryPrice
  distanceToMtPct: number;    // % distance from current price to meanThreshold
  currentPrice: number;
}

export interface ObDetectionOptions {
  minGapPct?: number;       // Minimum FVG gap size % (default: 0.05%)
  minObBodyPct?: number;    // Minimum OB candle body size % (default: 0.05%)
  includeMitigated?: boolean; // Whether to include already mitigated OBs
  maxLookbackBars?: number; // Maximum historical bars to inspect (default: 250)
}

/**
 * Computes Validated Order Blocks (OB) with strict FVG formation on the next 2 candles.
 *
 * Pattern Rules:
 * - Bullish OB: Bearish candle at i followed by an impulsive bullish move where
 *   Bar[i+2].low > Bar[i].high, creating an unmitigated Bullish Fair Value Gap.
 * - Bearish OB: Bullish candle at i followed by an impulsive bearish move where
 *   Bar[i+2].high < Bar[i].low, creating an unmitigated Bearish Fair Value Gap.
 */
export function computeValidatedOrderBlocks(
  bars: CandlestickBar[],
  symbol: string,
  timeframe: string,
  options: ObDetectionOptions = {}
): ValidatedOrderBlock[] {
  if (!bars || bars.length < 4) return [];

  const minGapPct = options.minGapPct ?? 0.05;
  const minObBodyPct = options.minObBodyPct ?? 0.02;
  const includeMitigated = options.includeMitigated ?? true;
  const maxLookback = options.maxLookbackBars ?? 250;

  const startIndex = Math.max(0, bars.length - maxLookback);
  const currentBar = bars[bars.length - 1];
  const currentPrice = currentBar.close;

  const detectedBlocks: ValidatedOrderBlock[] = [];

  // Iterate up to bars.length - 3 to allow 2 candles for FVG confirmation
  for (let i = startIndex; i < bars.length - 2; i++) {
    const obBar = bars[i];
    const expBar1 = bars[i + 1];
    const expBar2 = bars[i + 2];

    const obBody = Math.abs(obBar.close - obBar.open);
    const obBodyPct = obBar.open > 0 ? (obBody / obBar.open) * 100 : 0;
    if (obBodyPct < minObBodyPct) continue;

    // 1. BULLISH ORDER BLOCK CANDIDATE
    // Candle i is bearish (or neutral), followed by expansion where Bar[i+2].low > Bar[i].high
    const isBearishCandle = obBar.close <= obBar.open;
    const isBullishExpansion = expBar1.close > expBar1.open || expBar2.close > expBar2.open;

    if (isBearishCandle && isBullishExpansion && expBar2.low > obBar.high) {
      const top = obBar.high;
      const bottom = obBar.low;
      const meanThreshold = (top + bottom) / 2;
      const fvgTop = expBar2.low;
      const fvgBottom = obBar.high;
      const fvgGapPct = ((fvgTop - fvgBottom) / fvgBottom) * 100;

      if (fvgGapPct >= minGapPct) {
        // Evaluate mitigation status across subsequent bars
        let status: OrderBlockStatus = "fresh";

        for (let k = i + 3; k < bars.length; k++) {
          const testBar = bars[k];
          if (testBar.low < bottom) {
            status = "broken";
            break;
          } else if (testBar.low <= meanThreshold) {
            status = "mitigated";
          } else if (testBar.low <= top) {
            if (status !== "mitigated") {
              status = "testing";
            }
          }
        }

        if (includeMitigated || status !== "broken") {
          const isInsideZone = currentPrice >= bottom && currentPrice <= top;
          const distanceToEntryPct =
            currentPrice > top
              ? ((currentPrice - top) / currentPrice) * 100
              : currentPrice < bottom
              ? ((bottom - currentPrice) / currentPrice) * 100
              : 0;

          const distanceToMtPct =
            Math.abs(currentPrice - meanThreshold) / currentPrice * 100;

          detectedBlocks.push({
            id: `ob-bull-${symbol}-${timeframe}-${obBar.time}`,
            symbol: symbol.toUpperCase(),
            timeframe,
            type: "BULLISH",
            obIndex: i,
            obTime: obBar.time,
            top,
            bottom,
            meanThreshold,
            entryPrice: top,
            fullRetestPrice: bottom,
            fvgTop,
            fvgBottom,
            fvgGapPct,
            fvgTime: expBar2.time,
            status,
            isInsideZone,
            distanceToEntryPct,
            distanceToMtPct,
            currentPrice,
          });
        }
      }
    }

    // 2. BEARISH ORDER BLOCK CANDIDATE
    // Candle i is bullish (or neutral), followed by expansion where Bar[i+2].high < Bar[i].low
    const isBullishCandle = obBar.close >= obBar.open;
    const isBearishExpansion = expBar1.close < expBar1.open || expBar2.close < expBar2.open;

    if (isBullishCandle && isBearishExpansion && expBar2.high < obBar.low) {
      const top = obBar.high;
      const bottom = obBar.low;
      const meanThreshold = (top + bottom) / 2;
      const fvgTop = obBar.low;
      const fvgBottom = expBar2.high;
      const fvgGapPct = ((fvgTop - fvgBottom) / fvgBottom) * 100;

      if (fvgGapPct >= minGapPct) {
        // Evaluate mitigation status across subsequent bars
        let status: OrderBlockStatus = "fresh";

        for (let k = i + 3; k < bars.length; k++) {
          const testBar = bars[k];
          if (testBar.high > top) {
            status = "broken";
            break;
          } else if (testBar.high >= meanThreshold) {
            status = "mitigated";
          } else if (testBar.high >= bottom) {
            if (status !== "mitigated") {
              status = "testing";
            }
          }
        }

        if (includeMitigated || status !== "broken") {
          const isInsideZone = currentPrice >= bottom && currentPrice <= top;
          const distanceToEntryPct =
            currentPrice < bottom
              ? ((bottom - currentPrice) / currentPrice) * 100
              : currentPrice > top
              ? ((currentPrice - top) / currentPrice) * 100
              : 0;

          const distanceToMtPct =
            Math.abs(currentPrice - meanThreshold) / currentPrice * 100;

          detectedBlocks.push({
            id: `ob-bear-${symbol}-${timeframe}-${obBar.time}`,
            symbol: symbol.toUpperCase(),
            timeframe,
            type: "BEARISH",
            obIndex: i,
            obTime: obBar.time,
            top,
            bottom,
            meanThreshold,
            entryPrice: bottom,
            fullRetestPrice: top,
            fvgTop,
            fvgBottom,
            fvgGapPct,
            fvgTime: expBar2.time,
            status,
            isInsideZone,
            distanceToEntryPct,
            distanceToMtPct,
            currentPrice,
          });
        }
      }
    }
  }

  // Return non-broken order blocks first, sorted by closest proximity to current price
  return detectedBlocks
    .filter((ob) => ob.status !== "broken")
    .sort((a, b) => a.distanceToEntryPct - b.distanceToEntryPct);
}

/**
 * Returns the exact target price for an Order Block given the desired touch level
 */
export function getObAlarmTargetPrice(
  ob: ValidatedOrderBlock,
  touchLevel: OrderBlockTouchLevel
): number {
  switch (touchLevel) {
    case "entry":
      return ob.entryPrice;
    case "fifty_pct":
      return ob.meanThreshold;
    case "full":
      return ob.fullRetestPrice;
    default:
      return ob.entryPrice;
  }
}
