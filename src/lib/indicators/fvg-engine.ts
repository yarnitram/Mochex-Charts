import { CandlestickBar } from "@/lib/mexc/types";

export interface FvgZone {
  id: string;
  type: "BULLISH" | "BEARISH";
  createdIndex: number;
  startTime: number;
  endTime: number; // Initially creation candle, extends to current candle if unmitigated
  top: number;
  bottom: number;
  mid: number;
  gapPct: number;
  timeframe?: string;
  color: string;
  fillColor: string;
}

export interface FvgComputeOptions {
  minGapPct?: number; // Minimum percentage size for gap (default: 0.05%)
  timeframe?: string;
  showMidLine?: boolean;
}

/**
 * Computes all active, strictly unmitigated (0% wick touch) Fair Value Gaps across a dataset of candlestick bars.
 *
 * Rules:
 * - Bullish FVG: Bar[i-2].high < Bar[i].low (Zone between Candle 1 High and Candle 3 Low)
 * - Bearish FVG: Bar[i-2].low > Bar[i].high (Zone between Candle 1 Low and Candle 3 High)
 * - Strict 0% Mitigation: If any subsequent candle's wick enters the zone, it is immediately removed:
 *   - Bullish touch: Future Bar.low <= FVG.top
 *   - Bearish touch: Future Bar.high >= FVG.bottom
 */
export function computeUnmitigatedFvgs(
  bars: CandlestickBar[],
  options: FvgComputeOptions = {}
): FvgZone[] {
  if (!bars || bars.length < 3) return [];

  const minGapPct = options.minGapPct !== undefined ? options.minGapPct : 0.05;
  const tf = options.timeframe || "";
  const activeZones: FvgZone[] = [];

  for (let i = 2; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];

    // 1. Detect Bullish FVG (Demand Imbalance)
    if (c3.low > c1.high) {
      const top = c3.low;
      const bottom = c1.high;
      const gapPct = ((top - bottom) / bottom) * 100;

      if (gapPct >= minGapPct) {
        activeZones.push({
          id: `fvg-bull-${c1.time}-${i}`,
          type: "BULLISH",
          createdIndex: i,
          startTime: c1.time,
          endTime: c3.time,
          top,
          bottom,
          mid: (top + bottom) / 2,
          gapPct,
          timeframe: tf,
          color: "#00c087",
          fillColor: "rgba(0, 192, 135, 0.16)",
        });
      }
    }

    // 2. Detect Bearish FVG (Supply Imbalance)
    if (c3.high < c1.low) {
      const top = c1.low;
      const bottom = c3.high;
      const gapPct = ((top - bottom) / bottom) * 100;

      if (gapPct >= minGapPct) {
        activeZones.push({
          id: `fvg-bear-${c1.time}-${i}`,
          type: "BEARISH",
          createdIndex: i,
          startTime: c1.time,
          endTime: c3.time,
          top,
          bottom,
          mid: (top + bottom) / 2,
          gapPct,
          timeframe: tf,
          color: "#ff3b30",
          fillColor: "rgba(255, 59, 48, 0.16)",
        });
      }
    }

    // 3. Strict 0% Wick Touch Mitigation Evaluation
    for (let f = activeZones.length - 1; f >= 0; f--) {
      const zone = activeZones[f];
      // Only evaluate bars formed after the 3-candle pattern
      if (i > zone.createdIndex) {
        let isMitigated = false;

        if (zone.type === "BULLISH") {
          // Low wicks down into or below the top of the gap
          if (c3.low <= zone.top) {
            isMitigated = true;
          }
        } else {
          // High wicks up into or above the bottom of the gap
          if (c3.high >= zone.bottom) {
            isMitigated = true;
          }
        }

        if (isMitigated) {
          activeZones.splice(f, 1);
        }
      }
    }
  }

  // Extend recent active zones' endTime to the latest bar's time; cap older historical unmitigated zones locally
  const latestTime = bars[bars.length - 1].time;
  const bullZones = activeZones.filter((z) => z.type === "BULLISH");
  const bearZones = activeZones.filter((z) => z.type === "BEARISH");
  const recentBull = bullZones.slice(-4);
  const recentBear = bearZones.slice(-4);

  for (const zone of bullZones) {
    zone.endTime = recentBull.includes(zone)
      ? latestTime
      : bars[Math.min(bars.length - 1, zone.createdIndex + 25)].time;
  }
  for (const zone of bearZones) {
    zone.endTime = recentBear.includes(zone)
      ? latestTime
      : bars[Math.min(bars.length - 1, zone.createdIndex + 25)].time;
  }

  return activeZones;
}

/**
 * Real-time mitigation check for live price ticks
 */
export function evaluateFvgMitigationOnTick(
  activeZones: FvgZone[],
  markPrice: number,
  highPrice?: number,
  lowPrice?: number
): FvgZone[] {
  const currentLow = lowPrice !== undefined ? lowPrice : markPrice;
  const currentHigh = highPrice !== undefined ? highPrice : markPrice;

  return activeZones.filter((zone) => {
    if (zone.type === "BULLISH") {
      return currentLow > zone.top;
    } else {
      return currentHigh < zone.bottom;
    }
  });
}
