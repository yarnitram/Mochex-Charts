import { CandlestickBar } from "@/lib/mexc/types";

export type SweepType = "BULLISH_SWEEP" | "BEARISH_SWEEP";

export interface LiquiditySweepInfo {
  isSweep: boolean;
  type: SweepType;
  sweepDepthPct: number;    // % penetrated beyond the zone boundary (e.g. 0.85%)
  rejectionWickPct: number; // Rejection wick as % of total candle range (e.g. 42.5%)
  sweepPrice: number;       // The extreme price level swept (lowest low or highest high)
  closePrice: number;       // The candle close confirming return inside/above zone
  candleTime: number;       // Timestamp of the sweep candle
  label: string;            // Descriptive tag
}

export interface SweepDetectionOptions {
  minRejectionWickPct?: number; // Minimum wick size % of total range (default: 25%)
  maxSweepDepthPct?: number;    // Max depth beyond zone before considering it broken (default: 3.5%)
  lookbackBars?: number;        // Lookback window of recent candles to inspect (default: 8)
}

/**
 * Detects whether recent price action formed an institutional Liquidity Sweep / Fakeout
 * on a given Point of Interest (Order Block, Sandwich Zone, or FVG).
 *
 * Bullish Demand Sweep: Price wicks below zone bottom (taking sell stops) and aggressively
 * closes back inside or above the zone with a strong lower rejection wick (>= 25%).
 *
 * Bearish Supply Sweep: Price wicks above zone top (taking buy stops) and aggressively
 * closes back inside or below the zone with a strong upper rejection wick (>= 25%).
 */
export function detectPoiLiquiditySweep(
  bars: CandlestickBar[],
  poi: {
    type: "BULLISH" | "BEARISH";
    top: number;
    bottom: number;
    meanThreshold: number;
    candleTime?: number;
  },
  options: SweepDetectionOptions = {}
): LiquiditySweepInfo | null {
  if (!bars || bars.length < 3) return null;

  const minWickPct = options.minRejectionWickPct ?? 25;
  const maxDepthPct = options.maxSweepDepthPct ?? 3.5;
  const lookback = Math.min(bars.length, options.lookbackBars ?? 8);

  const isBullish = poi.type === "BULLISH";
  const recentBars = bars.slice(bars.length - lookback);

  // Evaluate recent bars from latest backwards to find the freshest sweep
  for (let i = recentBars.length - 1; i >= 0; i--) {
    const bar = recentBars[i];

    // If candleTime is provided, sweep candle MUST have occurred after the POI was formed
    if (poi.candleTime !== undefined && bar.time <= poi.candleTime) {
      continue;
    }

    const totalRange = bar.high - bar.low;
    if (totalRange <= 0) continue;

    if (isBullish) {
      // Bullish Demand: Low dips below zone bottom, but close is back >= zone bottom
      if (bar.low < poi.bottom && bar.close >= poi.bottom) {
        const sweepDepthPct = ((poi.bottom - bar.low) / poi.bottom) * 100;
        if (sweepDepthPct > maxDepthPct) continue; // Too deep, likely broken

        const lowerWick = Math.min(bar.open, bar.close) - bar.low;
        const rejectionWickPct = (lowerWick / totalRange) * 100;

        if (rejectionWickPct >= minWickPct) {
          return {
            isSweep: true,
            type: "BULLISH_SWEEP",
            sweepDepthPct: parseFloat(sweepDepthPct.toFixed(2)),
            rejectionWickPct: parseFloat(rejectionWickPct.toFixed(1)),
            sweepPrice: bar.low,
            closePrice: bar.close,
            candleTime: bar.time,
            label: `Bullish Demand Sweep (${rejectionWickPct.toFixed(0)}% Wick)`,
          };
        }
      }
    } else {
      // Bearish Supply: High pushes above zone top, but close is back <= zone top
      if (bar.high > poi.top && bar.close <= poi.top) {
        const sweepDepthPct = ((bar.high - poi.top) / poi.top) * 100;
        if (sweepDepthPct > maxDepthPct) continue; // Too deep, likely broken

        const upperWick = bar.high - Math.max(bar.open, bar.close);
        const rejectionWickPct = (upperWick / totalRange) * 100;

        if (rejectionWickPct >= minWickPct) {
          return {
            isSweep: true,
            type: "BEARISH_SWEEP",
            sweepDepthPct: parseFloat(sweepDepthPct.toFixed(2)),
            rejectionWickPct: parseFloat(rejectionWickPct.toFixed(1)),
            sweepPrice: bar.high,
            closePrice: bar.close,
            candleTime: bar.time,
            label: `Bearish Supply Sweep (${rejectionWickPct.toFixed(0)}% Wick)`,
          };
        }
      }
    }
  }

  return null;
}
