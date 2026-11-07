import { CandlestickBar } from "@/lib/mexc/types";

export interface VolumeProfileBucket {
  index: number;
  priceLow: number;
  priceHigh: number;
  midPrice: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  isPoc: boolean;
  isValueArea: boolean;
}

export interface VolumeProfileResult {
  buckets: VolumeProfileBucket[];
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  maxBucketVolume: number;
  totalVolume: number;
}

export interface FixedRangeVolumeProfileResult extends VolumeProfileResult {
  startTime: number;
  endTime: number;
  minLow: number;
  maxHigh: number;
  barCount: number;
}

/**
 * Computes the TradingView-style Visible Range Volume Profile (VPVR) with
 * Buy/Sell split buckets, Point of Control (POC), Value Area High (VAH), and Value Area Low (VAL) (DEC-071).
 */
export function calculateVisibleVolumeProfile(
  bars: CandlestickBar[],
  rowCount: number = 24,
  valueAreaPercent: number = 0.7
): VolumeProfileResult | null {
  if (!Array.isArray(bars) || bars.length === 0) return null;

  // Removed artificial 100-row limit to allow high-resolution volume profiles (300+ rows) (DEC-129)
  const safeRows = Math.max(2, Math.floor(rowCount));
  const safeVaPct = Math.max(0.01, Math.min(1.0, valueAreaPercent > 1 ? valueAreaPercent / 100 : valueAreaPercent));

  let minLow = Infinity;
  let maxHigh = -Infinity;

  for (const b of bars) {
    if (Number.isFinite(b.low) && b.low < minLow) minLow = b.low;
    if (Number.isFinite(b.high) && b.high > maxHigh) maxHigh = b.high;
  }

  if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh) || maxHigh <= minLow) {
    return null;
  }

  const range = maxHigh - minLow;
  const bucketStep = range / safeRows;

  const buckets: VolumeProfileBucket[] = Array.from({ length: safeRows }, (_, i) => {
    const priceLow = minLow + i * bucketStep;
    const priceHigh = i === safeRows - 1 ? maxHigh : minLow + (i + 1) * bucketStep;
    return {
      index: i,
      priceLow,
      priceHigh,
      midPrice: (priceLow + priceHigh) / 2,
      buyVolume: 0,
      sellVolume: 0,
      totalVolume: 0,
      isPoc: false,
      isValueArea: false,
    };
  });

  let grandTotalVolume = 0;

  for (const bar of bars) {
    const vol = Number.isFinite(bar.volume) && bar.volume > 0 ? bar.volume : 0;
    if (vol === 0) continue;

    const startIdx = Math.max(
      0,
      Math.min(safeRows - 1, Math.floor((bar.low - minLow) / bucketStep))
    );
    const endIdx = Math.max(
      startIdx,
      Math.min(safeRows - 1, Math.floor((bar.high - minLow) / bucketStep))
    );

    const spanCount = endIdx - startIdx + 1;
    const volPerBucket = vol / spanCount;

    // TradingView Up/Down Volume split based on candle polarity & body ratio
    const isBullish = bar.close >= bar.open;
    const buyRatio = isBullish ? 0.65 : 0.35;
    const sellRatio = 1 - buyRatio;

    for (let idx = startIdx; idx <= endIdx; idx++) {
      buckets[idx].buyVolume += volPerBucket * buyRatio;
      buckets[idx].sellVolume += volPerBucket * sellRatio;
      buckets[idx].totalVolume += volPerBucket;
    }

    grandTotalVolume += vol;
  }

  if (grandTotalVolume <= 0) return null;

  // Locate Point of Control (POC) bucket with maximum volume
  let pocIdx = 0;
  let maxBucketVolume = -1;
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].totalVolume > maxBucketVolume) {
      maxBucketVolume = buckets[i].totalVolume;
      pocIdx = i;
    }
  }

  buckets[pocIdx].isPoc = true;
  buckets[pocIdx].isValueArea = true;

  // Expand Value Area outward from POC until `safeVaPct` of total volume is enclosed
  const targetVaVolume = grandTotalVolume * safeVaPct;
  let accumulatedVaVolume = buckets[pocIdx].totalVolume;
  let lowerIdx = pocIdx;
  let upperIdx = pocIdx;

  while (accumulatedVaVolume < targetVaVolume && (lowerIdx > 0 || upperIdx < safeRows - 1)) {
    const nextUpperVol = upperIdx < safeRows - 1 ? buckets[upperIdx + 1].totalVolume : -1;
    const nextLowerVol = lowerIdx > 0 ? buckets[lowerIdx - 1].totalVolume : -1;

    if (nextUpperVol >= nextLowerVol && upperIdx < safeRows - 1) {
      upperIdx++;
      buckets[upperIdx].isValueArea = true;
      accumulatedVaVolume += buckets[upperIdx].totalVolume;
    } else if (lowerIdx > 0) {
      lowerIdx--;
      buckets[lowerIdx].isValueArea = true;
      accumulatedVaVolume += buckets[lowerIdx].totalVolume;
    } else {
      break;
    }
  }

  return {
    buckets,
    pocPrice: buckets[pocIdx].midPrice,
    vahPrice: buckets[upperIdx].priceHigh,
    valPrice: buckets[lowerIdx].priceLow,
    maxBucketVolume,
    totalVolume: grandTotalVolume,
  };
}

/**
 * Computes the TradingView-style Fixed Range Volume Profile (FRVP) for a custom
 * time interval [startTime, endTime], returning horizontal volume distribution buckets,
 * Point of Control (POC), Value Area High (VAH), Value Area Low (VAL), and price bounds.
 */
export function calculateFixedRangeVolumeProfile(
  bars: CandlestickBar[],
  startTime: number,
  endTime: number,
  rowCount: number = 24,
  valueAreaPercent: number = 0.7
): FixedRangeVolumeProfileResult | null {
  if (!Array.isArray(bars) || bars.length === 0) return null;

  const tMin = Math.min(startTime, endTime);
  const tMax = Math.max(startTime, endTime);

  let rangeBars = bars.filter((b) => b.time >= tMin && b.time <= tMax);

  // If the range is narrower than a single bar interval, snap to the nearest bar(s)
  if (rangeBars.length === 0) {
    let nearest = bars[0];
    let minDiff = Math.abs(bars[0].time - tMin);
    for (const b of bars) {
      const diff = Math.abs(b.time - tMin);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = b;
      }
    }
    rangeBars = [nearest];
  }

  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (const b of rangeBars) {
    if (Number.isFinite(b.low) && b.low < minLow) minLow = b.low;
    if (Number.isFinite(b.high) && b.high > maxHigh) maxHigh = b.high;
  }

  if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh) || maxHigh <= minLow) {
    return null;
  }

  const profile = calculateVisibleVolumeProfile(rangeBars, rowCount, valueAreaPercent);
  if (!profile) return null;

  return {
    ...profile,
    startTime: rangeBars[0].time,
    endTime: rangeBars[rangeBars.length - 1].time,
    minLow,
    maxHigh,
    barCount: rangeBars.length,
  };
}
