import { CandlestickBar } from "@/lib/mexc/types";
import { computeValidatedOrderBlocks } from "./validated-ob-engine";

export type PoiConfidenceRating = "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT_DATA";

export interface PoiHistoricalMetrics {
  winRatePct: number;          // 0 to 100
  totalTested: number;         // Count of completed historical zone taps
  wins: number;                // Count of successful bounces (>= target R:R)
  losses: number;              // Count of invalidations (stop-out)
  avgRr: number;               // Average realized reward-to-risk ratio
  confidence: PoiConfidenceRating;
  sampleDescription: string;   // e.g. "75% (6/8 reacted)"
}

export interface BacktestOptions {
  targetRr?: number;           // Target R:R for success (default: 1.5R)
  maxLookforwardBars?: number; // How many bars to look forward after a tap (default: 35)
  touchLevel?: "entry" | "fifty_pct"; // Touch entry trigger (default: "fifty_pct")
}

/**
 * Computes historical POI reaction win-rate and statistical metrics
 * across a historical candlestick dataset.
 */
export function calculateHistoricalPoiMetrics(
  bars: CandlestickBar[],
  options: BacktestOptions = {}
): PoiHistoricalMetrics {
  if (!bars || bars.length < 15) {
    return {
      winRatePct: 0,
      totalTested: 0,
      wins: 0,
      losses: 0,
      avgRr: 0,
      confidence: "INSUFFICIENT_DATA",
      sampleDescription: "No historical data",
    };
  }

  const targetRr = options.targetRr ?? 1.5;
  const maxLookforward = options.maxLookforwardBars ?? 35;
  const touchLevel = options.touchLevel ?? "fifty_pct";

  let totalTested = 0;
  let wins = 0;
  let losses = 0;
  let totalRealizedRr = 0;

  // We scan historical order blocks formed from bar 3 to bars.length - 5
  // to evaluate how price reacted when it subsequent tapped them
  const minRequiredLookback = 5;
  const evalLimit = bars.length - 3;

  for (let i = minRequiredLookback; i < evalLimit; i++) {
    const historicalSlice = bars.slice(0, i + 1);
    const candidateObs = computeValidatedOrderBlocks(historicalSlice, "BACKTEST", "SCAN", {
      minGapPct: 0.05,
      includeMitigated: true,
    });

    if (candidateObs.length === 0) continue;

    // Check the most recently formed OB in this slice
    const latestOb = candidateObs[candidateObs.length - 1];
    const obTime = latestOb.obTime;

    // Find the candle index where this OB was created
    const obIndex = bars.findIndex((b) => b.time === obTime);
    if (obIndex < 0 || obIndex >= evalLimit) continue;

    // Zone parameters
    const isBullish = latestOb.type === "BULLISH";
    const top = latestOb.top;
    const bottom = latestOb.bottom;
    const meanThreshold = (top + bottom) / 2;
    const triggerPrice = touchLevel === "fifty_pct" ? meanThreshold : isBullish ? top : bottom;

    // Invalidation SL (0.2% outside zone boundary)
    const invalidationPrice = isBullish ? bottom * (1 - 0.002) : top * (1 + 0.002);
    const risk = Math.abs(triggerPrice - invalidationPrice);
    if (risk <= 0) continue;

    // Target TP at targetRr
    const targetPrice = isBullish
      ? triggerPrice + risk * targetRr
      : triggerPrice - risk * targetRr;

    // Track forward candle action starting 2 candles after OB creation
    const scanStartIndex = obIndex + 3;
    if (scanStartIndex >= bars.length) continue;

    let hasTouched = false;
    let touchIndex = -1;

    // 1. Check for initial touch
    const maxTouchSearch = Math.min(bars.length, scanStartIndex + 30);
    for (let j = scanStartIndex; j < maxTouchSearch; j++) {
      const bar = bars[j];
      const touched = isBullish ? bar.low <= triggerPrice : bar.high >= triggerPrice;
      if (touched) {
        hasTouched = true;
        touchIndex = j;
        break;
      }
    }

    if (!hasTouched || touchIndex < 0) continue;

    // 2. Track outcome from touch candle onwards
    const outcomeEnd = Math.min(bars.length, touchIndex + maxLookforward);
    let resolved = false;

    for (let k = touchIndex; k < outcomeEnd; k++) {
      const bar = bars[k];

      if (isBullish) {
        // Did price reach target?
        if (bar.high >= targetPrice) {
          wins++;
          totalTested++;
          totalRealizedRr += targetRr;
          resolved = true;
          break;
        }
        // Did price breach invalidation?
        if (bar.low <= invalidationPrice) {
          losses++;
          totalTested++;
          totalRealizedRr -= 1.0;
          resolved = true;
          break;
        }
      } else {
        // Bearish
        // Did price reach target?
        if (bar.low <= targetPrice) {
          wins++;
          totalTested++;
          totalRealizedRr += targetRr;
          resolved = true;
          break;
        }
        // Did price breach invalidation?
        if (bar.high >= invalidationPrice) {
          losses++;
          totalTested++;
          totalRealizedRr -= 1.0;
          resolved = true;
          break;
        }
      }
    }

    // Skip ahead a few bars so we don't duplicate identical setups
    if (resolved) {
      i += 3;
    }
  }

  // Calculate percentages and confidence
  const winRatePct = totalTested > 0 ? Math.round((wins / totalTested) * 100) : 0;
  const avgRr = totalTested > 0 ? parseFloat((totalRealizedRr / totalTested).toFixed(1)) : 0;

  let confidence: PoiConfidenceRating = "INSUFFICIENT_DATA";
  if (totalTested >= 4) {
    if (winRatePct >= 70) confidence = "HIGH";
    else if (winRatePct >= 50) confidence = "MODERATE";
    else confidence = "LOW";
  } else if (totalTested >= 2) {
    if (winRatePct >= 65) confidence = "MODERATE";
    else confidence = "LOW";
  }

  const sampleDescription =
    totalTested > 0
      ? `${winRatePct}% (${wins}/${totalTested} reacted)`
      : "No completed tests";

  return {
    winRatePct,
    totalTested,
    wins,
    losses,
    avgRr,
    confidence,
    sampleDescription,
  };
}
