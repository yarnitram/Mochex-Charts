/**
 * Multi-Timeframe EMA Label & Collision Avoidance Manager
 *
 * Formats labels, detects vertical label overlaps at the right edge,
 * and relaxes overlapping labels to maintain minimum spacing while
 * remaining within visible chart boundaries.
 */

import { EmaPeriod, LabelTextSize, MtfEmaLabelItem, MtfEmaSeriesData, MtfTimeframeId } from "./types";

export interface LabelFormatOptions {
  abbreviated: boolean;
  timeframeLabel: string;
  period: EmaPeriod;
}

/**
 * Formats EMA label text (standard or abbreviated)
 * Standard: "1H EMA 200"
 * Abbreviated: "1H E200"
 */
export function formatEmaLabel(options: LabelFormatOptions): string {
  const { abbreviated, timeframeLabel, period } = options;
  const prefix = timeframeLabel.trim();
  if (abbreviated) {
    return `${prefix} E${period}`;
  }
  return `${prefix} EMA ${period}`;
}

/**
 * Returns pixel font size for label text size setting
 */
export function getLabelFontSize(size: LabelTextSize): number {
  switch (size) {
    case "tiny":
      return 9;
    case "small":
      return 11;
    case "normal":
      return 13;
    default:
      return 11;
  }
}

/**
 * Resolves 1D vertical label collisions using an iterative relaxation algorithm.
 *
 * @param labels List of raw label items with originalY coordinates
 * @param minSpacingPx Minimum vertical pixel distance between adjacent label centers
 * @param minY Minimum allowed Y coordinate (e.g. 10px)
 * @param maxY Maximum allowed Y coordinate (e.g. chart height - 20px)
 * @param enabled Whether collision avoidance is enabled
 */
export function resolveLabelCollisions(
  labels: MtfEmaLabelItem[],
  minSpacingPx: number = 14,
  minY: number = 12,
  maxY: number = 800,
  enabled: boolean = true
): MtfEmaLabelItem[] {
  if (labels.length === 0) return [];

  // Deep clone to avoid mutating input
  const items = labels.map((l) => ({ ...l, adjustedY: l.originalY }));

  if (!enabled || items.length <= 1) {
    // Just clamp within bounds if disabled
    for (const item of items) {
      item.adjustedY = Math.max(minY, Math.min(maxY, item.originalY));
    }
    return items;
  }

  // 1. Sort by originalY ascending (top to bottom on screen)
  items.sort((a, b) => a.originalY - b.originalY);

  const n = items.length;
  const iterations = 10;

  // 2. Iterative pairwise relaxation
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n - 1; i++) {
      const current = items[i];
      const next = items[i + 1];
      const dist = next.adjustedY - current.adjustedY;

      if (dist < minSpacingPx) {
        const overlap = minSpacingPx - dist;
        const push = overlap / 2;
        current.adjustedY -= push;
        next.adjustedY += push;
      }
    }

    // Gentle clamping each iteration
    items[0].adjustedY = Math.max(minY, items[0].adjustedY);
    items[n - 1].adjustedY = Math.min(maxY, items[n - 1].adjustedY);
  }

  // 3. Strict top-down forward sweep
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      items[i].adjustedY = Math.max(minY, items[i].adjustedY);
    } else {
      if (items[i].adjustedY < items[i - 1].adjustedY + minSpacingPx) {
        items[i].adjustedY = items[i - 1].adjustedY + minSpacingPx;
      }
    }
  }

  // 4. Strict bottom-up backward sweep if bottom boundary was exceeded
  if (items[n - 1].adjustedY > maxY) {
    items[n - 1].adjustedY = maxY;
    for (let i = n - 2; i >= 0; i--) {
      if (items[i].adjustedY > items[i + 1].adjustedY - minSpacingPx) {
        items[i].adjustedY = items[i + 1].adjustedY - minSpacingPx;
      }
    }
  }

  // Final top clamp safeguard
  for (let i = 0; i < n; i++) {
    if (items[i].adjustedY < minY) {
      items[i].adjustedY = minY;
    }
  }

  return items;
}

/**
 * Builds label items from active series data and price-to-coordinate mapping.
 */
export function buildMtfEmaLabels(
  seriesList: MtfEmaSeriesData[],
  priceToCoordinate: (price: number) => number | null,
  options: {
    showCurrent: boolean;
    showMtf: boolean;
    abbreviated: boolean;
    currentResolutionLabel: string;
    smartSpacing: boolean;
    minSpacingPx: number;
    minY: number;
    maxY: number;
  }
): MtfEmaLabelItem[] {
  const rawLabels: MtfEmaLabelItem[] = [];

  for (const s of seriesList) {
    const isCurrent = s.timeframeId === "current";
    if (isCurrent && !options.showCurrent) continue;
    if (!isCurrent && !options.showMtf) continue;

    if (s.latestValue === null || isNaN(s.latestValue)) continue;

    const y = priceToCoordinate(s.latestValue);
    if (y === null || isNaN(y)) continue;

    const tfLabel = isCurrent ? options.currentResolutionLabel : s.timeframeLabel;
    const text = formatEmaLabel({
      abbreviated: options.abbreviated,
      timeframeLabel: tfLabel,
      period: s.period,
    });

    rawLabels.push({
      id: `${s.timeframeId}-${s.period}`,
      text,
      price: s.latestValue,
      originalY: y,
      adjustedY: y,
      color: s.color,
      timeframeId: s.timeframeId,
      period: s.period,
      isCurrent,
    });
  }

  return resolveLabelCollisions(
    rawLabels,
    options.minSpacingPx,
    options.minY,
    options.maxY,
    options.smartSpacing
  );
}
