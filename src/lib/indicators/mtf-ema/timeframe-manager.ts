/**
 * Multi-Timeframe Candle & Alignment Manager
 *
 * Handles:
 * - Timeframe resolution mapping & duration
 * - 2H synthetic candle aggregation from 1H bars
 * - Higher-Timeframe (HTF) step-like confirmed alignment (no lookahead bias)
 * - Developing HTF provisional EMA calculation
 * - Lower-Timeframe (LTF) time-aligned sampling
 * - Timeframe duplicate suppression
 * - Multi-timeframe bar caching
 */

import { Bar } from "@/types/tradingview.d";
import { ALL_MTF_TIMEFRAMES, EmaPeriod, MtfEmaPoint, MtfTimeframeId } from "./types";
import { calculateEma, calculateIncrementalEma } from "./ema-calculator";

export interface TimeframeResolutionMeta {
  id: MtfTimeframeId;
  label: string;
  resolution: string;
  durationMs: number;
}

/**
 * Returns resolution meta for a given timeframe ID
 */
export function getTimeframeMeta(id: MtfTimeframeId): TimeframeResolutionMeta | undefined {
  return ALL_MTF_TIMEFRAMES.find((tf) => tf.id === id);
}

/**
 * Normalizes resolution strings (e.g. "60", "1H", "1h" -> "60")
 */
export function normalizeChartResolution(res: string): string {
  const upper = (res || "").trim().toUpperCase();
  if (upper === "1" || upper === "1M") return "1";
  if (upper === "5" || upper === "5M") return "5";
  if (upper === "15" || upper === "15M") return "15";
  if (upper === "30" || upper === "30M") return "30";
  if (upper === "60" || upper === "1H" || upper === "60M") return "60";
  if (upper === "120" || upper === "2H" || upper === "120M") return "120";
  if (upper === "240" || upper === "4H" || upper === "240M") return "240";
  if (upper === "1D" || upper === "D") return "1D";
  if (upper === "1W" || upper === "W") return "1W";
  return res;
}

/**
 * Checks if a specific MTF timeframe matches the chart's current resolution.
 */
export function isTimeframeMatchingChart(
  timeframeId: MtfTimeframeId,
  chartResolution: string
): boolean {
  if (timeframeId === "current") return true;
  const normChart = normalizeChartResolution(chartResolution);
  const meta = getTimeframeMeta(timeframeId);
  if (!meta) return false;
  return normalizeChartResolution(meta.resolution) === normChart;
}

/**
 * Duplicate suppression check:
 * If current chart EMAs are visible, hide any MTF selection matching the chart resolution.
 */
export function isTimeframeDuplicate(
  timeframeId: MtfTimeframeId,
  chartResolution: string,
  isCurrentChartVisible: boolean
): boolean {
  if (timeframeId === "current") return false;
  if (!isCurrentChartVisible) return false;
  return isTimeframeMatchingChart(timeframeId, chartResolution);
}

/**
 * Converts resolution string to approximate duration in milliseconds
 */
export function resolutionToMs(resolution: string): number {
  const norm = normalizeChartResolution(resolution);
  switch (norm) {
    case "1":
      return 60 * 1000;
    case "5":
      return 5 * 60 * 1000;
    case "15":
      return 15 * 60 * 1000;
    case "30":
      return 30 * 60 * 1000;
    case "60":
      return 60 * 60 * 1000;
    case "120":
      return 2 * 60 * 60 * 1000;
    case "240":
      return 4 * 60 * 60 * 1000;
    case "1D":
      return 24 * 60 * 60 * 1000;
    case "1W":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}

/**
 * Aggregates 1H candles into synthetic 2H candles anchored to even UTC hours.
 */
export function aggregate1hTo2hBars(hourlyBars: Bar[]): Bar[] {
  if (!hourlyBars || hourlyBars.length === 0) return [];

  const twoHoursMs = 2 * 60 * 60 * 1000;
  const groups = new Map<number, Bar[]>();

  for (const bar of hourlyBars) {
    const bucketTime = Math.floor(bar.time / twoHoursMs) * twoHoursMs;
    let list = groups.get(bucketTime);
    if (!list) {
      list = [];
      groups.set(bucketTime, list);
    }
    list.push(bar);
  }

  const sortedBuckets = Array.from(groups.keys()).sort((a, b) => a - b);
  const result: Bar[] = [];

  for (const bucketTime of sortedBuckets) {
    const barsInBucket = groups.get(bucketTime)!;
    barsInBucket.sort((a, b) => a.time - b.time);

    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const b of barsInBucket) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      if (b.volume) volume += b.volume;
    }

    result.push({
      time: bucketTime,
      open: barsInBucket[0].open,
      high,
      low,
      close: barsInBucket[barsInBucket.length - 1].close,
      volume,
    });
  }

  return result;
}

/**
 * Aligns Higher Timeframe (HTF) EMA values to chart bars with strict step-like
 * confirmed values (avoiding lookahead bias).
 *
 * A HTF bar is confirmed once its full duration has elapsed:
 * confirmationTime = htfBar.time + htfDurationMs.
 * For any chartBar where chartBar.time >= confirmationTime,
 * that HTF EMA value is available.
 *
 * If showDeveloping is true, the unconfirmed in-progress HTF bar at the current
 * live chart edge calculates a provisional EMA marked `isDeveloping: true`.
 */
export function alignHtfEmaToChartBars(
  chartBars: Bar[],
  htfBars: Bar[],
  htfEmaValues: (number | null)[],
  htfDurationMs: number,
  period: EmaPeriod,
  showDeveloping: boolean = false
): MtfEmaPoint[] {
  if (!chartBars || chartBars.length === 0 || !htfBars || htfBars.length === 0) {
    return [];
  }

  const result: MtfEmaPoint[] = [];
  let htfIndex = 0;
  let lastConfirmedValue: number | null = null;

  // Track confirmed values up to each chart bar
  for (let c = 0; c < chartBars.length; c++) {
    const chartBar = chartBars[c];
    const chartTime = chartBar.time;

    // Advance htfIndex while htfBar has fully closed before or at chartTime
    while (
      htfIndex < htfBars.length &&
      htfBars[htfIndex].time + htfDurationMs <= chartTime
    ) {
      const val = htfEmaValues[htfIndex];
      if (val !== null && !isNaN(val)) {
        lastConfirmedValue = val;
      }
      htfIndex++;
    }

    const isLastChartBar = c === chartBars.length - 1;

    // If developing HTF is requested on the active developing bar
    if (showDeveloping && isLastChartBar && lastConfirmedValue !== null) {
      // Find currently open HTF bar
      const openHtfBar = htfBars.find(
        (b) => b.time <= chartTime && chartTime < b.time + htfDurationMs
      );
      if (openHtfBar) {
        // Provisional EMA with live price (chartBar.close)
        const provisionalVal = calculateIncrementalEma(
          lastConfirmedValue,
          chartBar.close,
          period
        );
        result.push({
          time: chartTime,
          value: provisionalVal,
          isDeveloping: true,
        });
        continue;
      }
    }

    if (lastConfirmedValue !== null) {
      result.push({
        time: chartTime,
        value: lastConfirmedValue,
        isDeveloping: false,
      });
    }
  }

  return result;
}

/**
 * Aligns Lower Timeframe (LTF) EMA values to chart bars.
 * Samples the latest LTF EMA value that occurred before or at the close of each chart bar.
 */
export function alignLtfEmaToChartBars(
  chartBars: Bar[],
  chartDurationMs: number,
  ltfBars: Bar[],
  ltfEmaValues: (number | null)[]
): MtfEmaPoint[] {
  if (!chartBars || chartBars.length === 0 || !ltfBars || ltfBars.length === 0) {
    return [];
  }

  const result: MtfEmaPoint[] = [];
  let ltfIndex = 0;
  let lastLtfVal: number | null = null;

  for (let c = 0; c < chartBars.length; c++) {
    const chartBar = chartBars[c];
    const chartEndTime = chartBar.time + chartDurationMs;

    // Advance LTF bars that occurred up to chartEndTime
    while (ltfIndex < ltfBars.length && ltfBars[ltfIndex].time < chartEndTime) {
      const val = ltfEmaValues[ltfIndex];
      if (val !== null && !isNaN(val)) {
        lastLtfVal = val;
      }
      ltfIndex++;
    }

    if (lastLtfVal !== null) {
      result.push({
        time: chartBar.time,
        value: lastLtfVal,
        isDeveloping: false,
      });
    }
  }

  return result;
}

/**
 * Aligns current-chart EMA values directly to chart bars.
 */
export function alignCurrentEmaToChartBars(
  chartBars: Bar[],
  emaValues: (number | null)[]
): MtfEmaPoint[] {
  const result: MtfEmaPoint[] = [];
  const len = Math.min(chartBars.length, emaValues.length);

  for (let i = 0; i < len; i++) {
    const val = emaValues[i];
    if (val !== null && !isNaN(val)) {
      result.push({
        time: chartBars[i].time,
        value: val,
        isDeveloping: false,
      });
    }
  }

  return result;
}
