/**
 * Multi-Timeframe EMA Calculator
 *
 * Implements standard Exponential Moving Average using closing prices:
 * alpha = 2 / (period + 1)
 * ema[t] = close[t] * alpha + ema[t-1] * (1 - alpha)
 *
 * Warmup: First valid EMA is seeded with the simple moving average (SMA)
 * of the first `period` bars (at index period - 1).
 */

import { EmaPeriod } from "./types";

export interface EmaCalculationResult {
  period: EmaPeriod;
  values: (number | null)[]; // Same length as input closes/bars
  latest: number | null;
}

/**
 * Calculates alpha multiplier for a given period
 */
export function getEmaAlpha(period: number): number {
  if (period <= 0) return 1;
  return 2 / (period + 1);
}

/**
 * Calculates a single period EMA series over an array of close prices.
 * Returns an array of the same length, where elements prior to (period - 1)
 * are null (insufficient warmup).
 *
 * @param closes Array of chronological closing prices
 * @param period EMA period (e.g. 20, 50, 100, 200)
 */
export function calculateEma(closes: number[], period: EmaPeriod): (number | null)[] {
  const n = closes.length;
  const result: (number | null)[] = new Array(n).fill(null);

  if (n < period || period <= 0) {
    return result;
  }

  const alpha = getEmaAlpha(period);
  const oneMinusAlpha = 1 - alpha;

  // 1. Initial SMA seed at index (period - 1)
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  let prevEma = sum / period;
  result[period - 1] = prevEma;

  // 2. Subsequent exponential smoothing
  for (let i = period; i < n; i++) {
    const currentClose = closes[i];
    if (isNaN(currentClose) || currentClose === null) {
      result[i] = prevEma;
      continue;
    }
    const currentEma = currentClose * alpha + prevEma * oneMinusAlpha;
    result[i] = currentEma;
    prevEma = currentEma;
  }

  return result;
}

/**
 * Calculates incremental next EMA value from a previous EMA and a new close price.
 */
export function calculateIncrementalEma(
  prevEma: number,
  newClose: number,
  period: EmaPeriod
): number {
  const alpha = getEmaAlpha(period);
  return newClose * alpha + prevEma * (1 - alpha);
}

/**
 * Calculates multiple EMA periods over a set of closes.
 */
export function calculateMultiEma(
  closes: number[],
  periods: EmaPeriod[] = [20, 50, 100, 200]
): Record<EmaPeriod, (number | null)[]> {
  const result = {} as Record<EmaPeriod, (number | null)[]>;
  for (const p of periods) {
    result[p] = calculateEma(closes, p);
  }
  return result;
}

/**
 * Lightweight in-memory EMA state cache to support high-performance incremental updates
 * without recalculating entire history on every live tick.
 */
export class EmaSeriesCache {
  private period: EmaPeriod;
  private lastConfirmedEma: number | null = null;
  private lastConfirmedTime: number | null = null;
  private count: number = 0;
  private historyCloses: number[] = [];

  constructor(period: EmaPeriod) {
    this.period = period;
  }

  public getPeriod(): EmaPeriod {
    return this.period;
  }

  /**
   * Initializes or resets cache with full historical closes
   */
  public reset(closes: number[], timestamps?: number[]): (number | null)[] {
    this.historyCloses = [...closes];
    this.count = closes.length;
    const series = calculateEma(closes, this.period);

    const validValues = series.filter((v): v is number => v !== null);
    if (validValues.length > 0) {
      this.lastConfirmedEma = validValues[validValues.length - 1];
      if (timestamps && timestamps.length === closes.length) {
        this.lastConfirmedTime = timestamps[timestamps.length - 1];
      }
    } else {
      this.lastConfirmedEma = null;
      this.lastConfirmedTime = null;
    }

    return series;
  }

  /**
   * Adds a newly closed candle incrementally in O(1) time
   */
  public pushConfirmed(close: number, time?: number): number | null {
    this.historyCloses.push(close);
    this.count++;

    if (this.count < this.period) {
      this.lastConfirmedEma = null;
      return null;
    }

    if (this.count === this.period) {
      // First SMA seed
      let sum = 0;
      for (let i = 0; i < this.period; i++) {
        sum += this.historyCloses[i];
      }
      this.lastConfirmedEma = sum / this.period;
    } else if (this.lastConfirmedEma !== null) {
      this.lastConfirmedEma = calculateIncrementalEma(
        this.lastConfirmedEma,
        close,
        this.period
      );
    }

    if (time !== undefined) {
      this.lastConfirmedTime = time;
    }

    return this.lastConfirmedEma;
  }

  /**
   * Evaluates provisional EMA for an open/developing candle without committing to state
   */
  public peekDeveloping(currentClose: number): number | null {
    if (this.lastConfirmedEma === null) {
      return null;
    }
    return calculateIncrementalEma(this.lastConfirmedEma, currentClose, this.period);
  }

  public getLatestConfirmed(): number | null {
    return this.lastConfirmedEma;
  }

  public clear(): void {
    this.historyCloses = [];
    this.count = 0;
    this.lastConfirmedEma = null;
    this.lastConfirmedTime = null;
  }
}
