/**
 * Multi-Timeframe Support & Resistance Detector
 *
 * Detects confirmed swing highs (Resistance) and swing lows (Support)
 * on 1H, 4H, and 1D timeframes using configurable pivot left/right lookback.
 *
 * Strict No-Lookahead Rule:
 * A pivot at index `p` is ONLY confirmed when candle `p + pivotRight` has closed!
 * `confirmedAt = bars[p + pivotRight].time`.
 */

import { Bar } from "@/types/tradingview.d";
import { SrTimeframeId, SrZone } from "./types";

/**
 * Detects all confirmed Support & Resistance zones in a series of bars.
 *
 * @param bars Chronological array of OHLC bars for the timeframe
 * @param timeframe Timeframe identifier ("1h" | "4h" | "1d")
 * @param pivotLeft Number of flank bars to the left (default 3)
 * @param pivotRight Number of flank bars to the right (default 3)
 */
export function detectSrZones(
  bars: Bar[],
  timeframe: SrTimeframeId,
  pivotLeft: number = 3,
  pivotRight: number = 3
): SrZone[] {
  if (!bars || bars.length < pivotLeft + pivotRight + 1) {
    return [];
  }

  const zones: SrZone[] = [];
  const n = bars.length;

  for (let p = pivotLeft; p < n - pivotRight; p++) {
    const pivot = bars[p];

    // 1. Swing High (Resistance) Check
    let isSwingHigh = true;
    for (let l = 1; l <= pivotLeft; l++) {
      if (bars[p - l].high >= pivot.high) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) {
      for (let r = 1; r <= pivotRight; r++) {
        if (bars[p + r].high > pivot.high) {
          isSwingHigh = false;
          break;
        }
      }
    }

    if (isSwingHigh) {
      const confirmedBar = bars[p + pivotRight];
      zones.push({
        id: `sr_${timeframe}_res_${pivot.time}`,
        timeframe,
        type: "resistance",
        pivotTime: pivot.time,
        confirmedAt: confirmedBar.time,
        top: pivot.high,
        bottom: Math.max(pivot.open, pivot.close),
        pivotPrice: pivot.high,
      });
    }

    // 2. Swing Low (Support) Check
    let isSwingLow = true;
    for (let l = 1; l <= pivotLeft; l++) {
      if (bars[p - l].low <= pivot.low) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) {
      for (let r = 1; r <= pivotRight; r++) {
        if (bars[p + r].low < pivot.low) {
          isSwingLow = false;
          break;
        }
      }
    }

    if (isSwingLow) {
      const confirmedBar = bars[p + pivotRight];
      zones.push({
        id: `sr_${timeframe}_sup_${pivot.time}`,
        timeframe,
        type: "support",
        pivotTime: pivot.time,
        confirmedAt: confirmedBar.time,
        top: Math.min(pivot.open, pivot.close),
        bottom: pivot.low,
        pivotPrice: pivot.low,
      });
    }
  }

  return zones;
}

/**
 * Checks price overlap between two zones:
 * zoneA.top >= zoneB.bottom && zoneA.bottom <= zoneB.top
 */
export function doZonesOverlap(
  topA: number,
  bottomA: number,
  topB: number,
  bottomB: number
): boolean {
  return topA >= bottomB && bottomA <= topB;
}
