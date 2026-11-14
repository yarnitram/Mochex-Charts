/**
 * Validated Order Block Engine (Strict 3-Candle RGG / GRR + Mandatory FVG)
 *
 * Implements the 3-candle institutional Order Block + Fair Value Gap specification:
 *
 * 1. Bullish Pattern (RGG):
 *    - Candle 1 = RED (bearish: close < open) -> Bullish Order Block
 *    - Candle 2 = GREEN (bullish: close > open) -> Bullish displacement
 *    - Candle 3 = GREEN (bullish: close > open) -> Completes pattern on close
 *    - Mandatory Bullish FVG: Candle3.low > Candle1.high (FVG = [Candle1.high, Candle3.low])
 *    - Default OB Zone: Candle 1 Full Candle (high..low) or Body Only (open..close)
 *
 * 2. Bearish Pattern (GRR):
 *    - Candle 1 = GREEN (bullish: close > open) -> Bearish Order Block
 *    - Candle 2 = RED (bearish: close < open) -> Bearish displacement
 *    - Candle 3 = RED (bearish: close < open) -> Completes pattern on close
 *    - Mandatory Bearish FVG: Candle3.high < Candle1.low (FVG = [Candle3.high, Candle1.low])
 *    - Default OB Zone: Candle 1 Full Candle (high..low) or Body Only (open..close)
 *
 * 3. Touch / Mitigation Detection:
 *    - Zone touch overlap on post-confirmation bars: high >= OB.low && low <= OB.high
 *    - Tracks exact first touch timestamp (`mitigatedTime`) and price (`mitigatedPrice`)
 *    - Also supports legacy `mean_threshold` lifecycle state for Radar & Backtest compatibility
 */

import { CandlestickBar } from "@/lib/mexc/types";

export type OrderBlockType = "BULLISH" | "BEARISH";
export type OrderBlockStatus = "fresh" | "testing" | "mitigated" | "broken";
export type OrderBlockTouchLevel = "entry" | "fifty_pct" | "full";
export type ObPatternType = "RGG" | "GRR";
export type ObZoneType = "full" | "body";
export type ObLifecycleState = "ACTIVE" | "MITIGATED";
export type ObMitigationMode = "mean_threshold" | "first_touch";

export interface ValidatedOrderBlock {
  id: string;
  symbol: string;
  timeframe: string;
  type: OrderBlockType;
  pattern?: ObPatternType;
  zoneType?: ObZoneType;
  obIndex: number;
  obTime: number; // Candle 1 timestamp (ms)
  confirmTime?: number; // Candle 3 close timestamp (ms)
  top: number;
  bottom: number;
  meanThreshold: number; // 50% equilibrium
  entryPrice: number; // Bullish -> top, Bearish -> bottom
  fullRetestPrice: number; // Bullish -> bottom, Bearish -> top
  fvgTop: number;
  fvgBottom: number;
  fvgGapPct: number;
  fvgTime: number; // Expansion Candle 3 timestamp (ms)
  fvgStartTime?: number; // Candle 1 timestamp (FVG anchor left)
  fvgEndTime?: number; // Candle 3 timestamp (FVG anchor right)
  displacementPct?: number;
  status: OrderBlockStatus;
  lifecycleState?: ObLifecycleState;
  touched?: boolean;
  mitigatedTime?: number;
  mitigatedPrice?: number;
  isInsideZone: boolean;
  distanceToEntryPct: number;
  distanceToMtPct: number;
  currentPrice: number;
}

export interface ObDetectionOptions {
  enableBullishRgg?: boolean;
  enableBearishGrr?: boolean;
  requireValidFvg?: boolean; // Mandatory ON by default
  minGapPct?: number; // Minimum FVG gap % (default 0)
  minDisplacementPct?: number; // Optional minimum Candle 2 body displacement % (0 = disabled)
  minObBodyPct?: number; // Optional minimum OB body % (0 = any strict R/G candle)
  obZoneType?: ObZoneType; // "full" (Full Candle) or "body" (Body Only)
  confirmClosedOnly?: boolean; // Exclude unclosed last bar from pattern confirmation
  mitigationMode?: ObMitigationMode; // "mean_threshold" (legacy Radar) or "first_touch" (RGG/GRR chart)
  includeMitigated?: boolean;
  includeBroken?: boolean;
  maxActiveObZones?: number; // Default 100
  maxResults?: number; // Default 150
}

export interface ObFvgSettings {
  showIndicator: boolean;
  // Pattern settings
  enableBullishRgg: boolean;
  enableBearishGrr: boolean;
  requireValidFvg: boolean; // Mandatory per spec
  minFvgPct: number;
  enableMinDisplacement: boolean;
  minDisplacementPct: number;
  obZoneType: ObZoneType;
  maxActiveObZones: number;
  // Visual settings
  bullishObColor: string;
  bearishObColor: string;
  bullishFvgColor: string;
  bearishFvgColor: string;
  mitigatedObColor: string;
  obFillOpacity: number;
  fvgFillOpacity: number;
  mitigatedOpacity: number;
  showObLabels: boolean;
  showFvgLabels: boolean;
  extendUnmitigatedOb: boolean;
  showMitigatedObs: boolean;
}

export const OB_FVG_STORAGE_KEY = "mochex:ob_fvg_settings";

export const DEFAULT_OB_FVG_SETTINGS: ObFvgSettings = {
  showIndicator: true,
  // Pattern settings
  enableBullishRgg: true,
  enableBearishGrr: true,
  requireValidFvg: true,
  minFvgPct: 0,
  enableMinDisplacement: false,
  minDisplacementPct: 0.25,
  obZoneType: "full",
  maxActiveObZones: 100,
  // Visual settings
  bullishObColor: "#00c087",
  bearishObColor: "#f23645",
  bullishFvgColor: "#00c087",
  bearishFvgColor: "#f23645",
  mitigatedObColor: "#787b86",
  obFillOpacity: 0.22,
  fvgFillOpacity: 0.14,
  mitigatedOpacity: 0.12,
  showObLabels: true,
  showFvgLabels: true,
  extendUnmitigatedOb: true,
  showMitigatedObs: true,
};

export interface ObFvgEngineResult {
  blocks: ValidatedOrderBlock[];
  activeCount: number;
  activeBullishCount: number;
  activeBearishCount: number;
  mitigatedCount: number;
}

interface PatternCandidate {
  type: OrderBlockType;
  pattern: ObPatternType;
  top: number;
  bottom: number;
  entryPrice: number;
  fullRetestPrice: number;
  meanThreshold: number;
  fvgTop: number;
  fvgBottom: number;
  fvgGapPct: number;
  displacementPct: number;
}

function isRedCandle(bar: CandlestickBar): boolean {
  return bar.close < bar.open;
}

function isGreenCandle(bar: CandlestickBar): boolean {
  return bar.close > bar.open;
}

function resolveObZoneBounds(bar: CandlestickBar, obZoneType: ObZoneType): { top: number; bottom: number } {
  if (obZoneType === "body") {
    return {
      top: Math.max(bar.open, bar.close),
      bottom: Math.min(bar.open, bar.close),
    };
  }
  return {
    top: bar.high,
    bottom: bar.low,
  };
}

/**
 * Evaluates a 3-candle window [obBar, expBar1, expBar2] for either
 * strict Bullish RGG or strict Bearish GRR with mandatory wick-to-wick FVG.
 */
function evaluateObPatternCandidate(
  type: OrderBlockType,
  obBar: CandlestickBar,
  expBar1: CandlestickBar,
  expBar2: CandlestickBar,
  params: {
    requireValidFvg: boolean;
    minGapPct: number;
    minDisplacementPct: number;
    minObBodyPct: number;
    obZoneType: ObZoneType;
  }
): PatternCandidate | null {
  if (obBar.open <= 0 || obBar.high <= 0 || obBar.low <= 0) return null;

  const isBullish = type === "BULLISH";
  const colorMatch = isBullish
    ? isRedCandle(obBar) && isGreenCandle(expBar1) && isGreenCandle(expBar2)
    : isGreenCandle(obBar) && isRedCandle(expBar1) && isRedCandle(expBar2);

  if (!colorMatch) return null;

  if (params.minObBodyPct > 0) {
    const obBodyPct = (Math.abs(obBar.close - obBar.open) / obBar.open) * 100;
    if (obBodyPct < params.minObBodyPct) return null;
  }

  const displacementPct =
    expBar1.open > 0 ? (Math.abs(expBar1.close - expBar1.open) / expBar1.open) * 100 : 0;
  if (params.minDisplacementPct > 0 && displacementPct < params.minDisplacementPct) {
    return null;
  }

  // Mandatory wick-to-wick Fair Value Gap check
  const hasWickGap = isBullish ? expBar2.low > obBar.high : expBar2.high < obBar.low;
  if (params.requireValidFvg && !hasWickGap) {
    return null;
  }

  const rawGapPct = isBullish
    ? ((expBar2.low - obBar.high) / obBar.high) * 100
    : ((obBar.low - expBar2.high) / obBar.low) * 100;
  const fvgGapPct = Math.max(0, rawGapPct);

  if (params.requireValidFvg && fvgGapPct < params.minGapPct) {
    return null;
  }

  const { top, bottom } = resolveObZoneBounds(obBar, params.obZoneType);
  if (top <= bottom) return null;

  const fvgTop = isBullish ? expBar2.low : obBar.low;
  const fvgBottom = isBullish ? obBar.high : expBar2.high;

  return {
    type,
    pattern: isBullish ? "RGG" : "GRR",
    top,
    bottom,
    entryPrice: isBullish ? top : bottom,
    fullRetestPrice: isBullish ? bottom : top,
    meanThreshold: (top + bottom) / 2,
    fvgTop,
    fvgBottom,
    fvgGapPct,
    displacementPct,
  };
}

/**
 * Scans post-confirmation bars chronologically (k >= confirmIndex + 1) to track
 * both first zone touch (high >= bottom && low <= top) and legacy 50% MT / broken status.
 */
function scanPostConfirmationTouches(
  bars: CandlestickBar[],
  confirmIndex: number,
  type: OrderBlockType,
  top: number,
  bottom: number,
  meanThreshold: number,
  mitigationMode: ObMitigationMode
): {
  status: OrderBlockStatus;
  lifecycleState: ObLifecycleState;
  touched: boolean;
  mitigatedTime?: number;
  mitigatedPrice?: number;
} {
  let legacyStatus: OrderBlockStatus = "fresh";
  let touched = false;
  let mitigatedTime: number | undefined;
  let mitigatedPrice: number | undefined;

  for (let k = confirmIndex + 1; k < bars.length; k++) {
    const candle = bars[k];

    // Spec zone-touch overlap condition: priceHigh >= OB.low && priceLow <= OB.high
    if (!touched && candle.high >= bottom && candle.low <= top) {
      touched = true;
      mitigatedTime = candle.time;
      // Record realistic entry/touch price clamped within touching candle's range
      const idealEntry = type === "BULLISH" ? top : bottom;
      mitigatedPrice = Math.min(candle.high, Math.max(candle.low, idealEntry));
    }

    if (type === "BULLISH") {
      if (candle.low < bottom) {
        legacyStatus = "broken";
        break;
      } else if (candle.low <= meanThreshold) {
        legacyStatus = "mitigated";
      } else if (candle.low <= top && legacyStatus === "fresh") {
        legacyStatus = "testing";
      }
    } else {
      if (candle.high > top) {
        legacyStatus = "broken";
        break;
      } else if (candle.high >= meanThreshold) {
        legacyStatus = "mitigated";
      } else if (candle.high >= bottom && legacyStatus === "fresh") {
        legacyStatus = "testing";
      }
    }
  }

  const lifecycleState: ObLifecycleState = touched ? "MITIGATED" : "ACTIVE";
  const effectiveStatus: OrderBlockStatus =
    mitigationMode === "first_touch"
      ? touched
        ? "mitigated"
        : "fresh"
      : legacyStatus;

  return {
    status: effectiveStatus,
    lifecycleState,
    touched,
    mitigatedTime,
    mitigatedPrice,
  };
}

/**
 * Detects Validated Order Blocks using strict 3-Candle RGG (Bullish) and GRR (Bearish)
 * patterns with mandatory wick-to-wick FVG confirmation and chronological mitigation tracking.
 */
export function computeValidatedOrderBlocks(
  bars: CandlestickBar[],
  symbol: string,
  timeframe: string,
  options: ObDetectionOptions = {}
): ValidatedOrderBlock[] {
  const {
    enableBullishRgg = true,
    enableBearishGrr = true,
    requireValidFvg = true,
    minGapPct = 0,
    minDisplacementPct = 0,
    minObBodyPct = 0,
    obZoneType = "full",
    confirmClosedOnly = false,
    mitigationMode = "mean_threshold",
    includeMitigated = true,
    includeBroken = false,
    maxActiveObZones = 100,
    maxResults = 150,
  } = options;

  if (!bars || bars.length < 3) return [];

  const currentPrice = bars[bars.length - 1].close;
  // When confirmClosedOnly is true, the last bar is treated as currently forming/unclosed,
  // so Candle 3 (i + 2) must be at index <= bars.length - 2 (i <= bars.length - 4).
  const maxStartIndex = confirmClosedOnly ? bars.length - 4 : bars.length - 3;
  if (maxStartIndex < 0) return [];

  const results: ValidatedOrderBlock[] = [];
  const typesToCheck: OrderBlockType[] = [];
  if (enableBullishRgg) typesToCheck.push("BULLISH");
  if (enableBearishGrr) typesToCheck.push("BEARISH");

  for (let i = 0; i <= maxStartIndex; i++) {
    const obBar = bars[i];
    const expBar1 = bars[i + 1];
    const expBar2 = bars[i + 2];

    for (const candidateType of typesToCheck) {
      const candidate = evaluateObPatternCandidate(candidateType, obBar, expBar1, expBar2, {
        requireValidFvg,
        minGapPct,
        minDisplacementPct,
        minObBodyPct,
        obZoneType,
      });

      if (!candidate) continue;

      const touchResult = scanPostConfirmationTouches(
        bars,
        i + 2,
        candidate.type,
        candidate.top,
        candidate.bottom,
        candidate.meanThreshold,
        mitigationMode
      );

      if (mitigationMode === "mean_threshold") {
        if (touchResult.status === "broken" && !includeBroken) continue;
        if (touchResult.status === "mitigated" && !includeMitigated) continue;
      } else if (touchResult.touched && !includeMitigated) {
        continue;
      }

      const isInsideZone =
        currentPrice <= candidate.top && currentPrice >= candidate.bottom;
      const distEntry =
        currentPrice > 0
          ? (Math.abs(currentPrice - candidate.entryPrice) / currentPrice) * 100
          : 0;
      const distMt =
        currentPrice > 0
          ? (Math.abs(currentPrice - candidate.meanThreshold) / currentPrice) * 100
          : 0;

      results.push({
        id: `${symbol}_${timeframe}_${candidate.pattern}_${obBar.time}_${obZoneType}`,
        symbol,
        timeframe,
        type: candidate.type,
        pattern: candidate.pattern,
        zoneType: obZoneType,
        obIndex: i,
        obTime: obBar.time,
        confirmTime: expBar2.time,
        top: candidate.top,
        bottom: candidate.bottom,
        meanThreshold: candidate.meanThreshold,
        entryPrice: candidate.entryPrice,
        fullRetestPrice: candidate.fullRetestPrice,
        fvgTop: candidate.fvgTop,
        fvgBottom: candidate.fvgBottom,
        fvgGapPct: candidate.fvgGapPct,
        fvgTime: expBar2.time,
        fvgStartTime: obBar.time,
        fvgEndTime: expBar2.time,
        displacementPct: candidate.displacementPct,
        status: touchResult.status,
        lifecycleState: touchResult.lifecycleState,
        touched: touchResult.touched,
        mitigatedTime: touchResult.mitigatedTime,
        mitigatedPrice: touchResult.mitigatedPrice,
        isInsideZone,
        distanceToEntryPct: distEntry,
        distanceToMtPct: distMt,
        currentPrice,
      });
    }
  }

  // Enforce maxActiveObZones on unmitigated active OBs while sorting newest first
  const newestFirst = [...results].sort((a, b) => b.obTime - a.obTime);
  const capped: ValidatedOrderBlock[] = [];
  let activeKept = 0;

  for (const ob of newestFirst) {
    const isActive = ob.lifecycleState === "ACTIVE";
    if (isActive) {
      if (activeKept >= maxActiveObZones) continue;
      activeKept++;
    }
    capped.push(ob);
  }

  // Sort Radar priority when not in first_touch chart mode, or chronologically for chart
  if (mitigationMode === "first_touch") {
    return capped.slice(0, maxResults);
  }

  return capped
    .sort((a, b) => {
      if (a.isInsideZone && !b.isInsideZone) return -1;
      if (!a.isInsideZone && b.isInsideZone) return 1;
      if (a.distanceToEntryPct !== b.distanceToEntryPct) {
        return a.distanceToEntryPct - b.distanceToEntryPct;
      }
      return b.obTime - a.obTime;
    })
    .slice(0, maxResults);
}

/**
 * Convenience chart wrapper computing 3-Candle RGG/GRR OBs + FVGs using `ObFvgSettings`
 * and strict first-touch mitigation.
 */
export function computeObFvgZones(
  bars: CandlestickBar[],
  symbol: string,
  timeframe: string,
  partialSettings?: Partial<ObFvgSettings>,
  options: { confirmClosedOnly?: boolean } = {}
): ObFvgEngineResult {
  const settings = normalizeObFvgSettings(partialSettings);
  const blocks = computeValidatedOrderBlocks(bars, symbol, timeframe, {
    enableBullishRgg: settings.enableBullishRgg,
    enableBearishGrr: settings.enableBearishGrr,
    requireValidFvg: settings.requireValidFvg,
    minGapPct: settings.minFvgPct,
    minDisplacementPct: settings.enableMinDisplacement ? settings.minDisplacementPct : 0,
    obZoneType: settings.obZoneType,
    confirmClosedOnly: options.confirmClosedOnly ?? true,
    mitigationMode: "first_touch",
    includeMitigated: settings.showMitigatedObs,
    includeBroken: settings.showMitigatedObs,
    maxActiveObZones: settings.maxActiveObZones,
    maxResults: Math.max(settings.maxActiveObZones + 100, 200),
  });

  let activeBullishCount = 0;
  let activeBearishCount = 0;
  let mitigatedCount = 0;

  for (const b of blocks) {
    if (b.touched) {
      mitigatedCount++;
    } else if (b.type === "BULLISH") {
      activeBullishCount++;
    } else {
      activeBearishCount++;
    }
  }

  return {
    blocks,
    activeCount: activeBullishCount + activeBearishCount,
    activeBullishCount,
    activeBearishCount,
    mitigatedCount,
  };
}

/**
 * Helper to resolve the exact alarm target price given a validated OB and user's touch preference
 */
export function getObAlarmTargetPrice(
  ob: ValidatedOrderBlock,
  touchLevel: OrderBlockTouchLevel
): number {
  if (touchLevel === "entry") return ob.entryPrice;
  if (touchLevel === "fifty_pct") return ob.meanThreshold;
  return ob.fullRetestPrice;
}

export function normalizeObFvgSettings(
  partial?: Partial<ObFvgSettings> | null
): ObFvgSettings {
  if (!partial) return { ...DEFAULT_OB_FVG_SETTINGS };

  return {
    showIndicator:
      partial.showIndicator !== undefined
        ? Boolean(partial.showIndicator)
        : DEFAULT_OB_FVG_SETTINGS.showIndicator,
    enableBullishRgg:
      partial.enableBullishRgg !== undefined
        ? Boolean(partial.enableBullishRgg)
        : DEFAULT_OB_FVG_SETTINGS.enableBullishRgg,
    enableBearishGrr:
      partial.enableBearishGrr !== undefined
        ? Boolean(partial.enableBearishGrr)
        : DEFAULT_OB_FVG_SETTINGS.enableBearishGrr,
    // Spec requires Valid FVG to stay ON (mandatory)
    requireValidFvg: true,
    minFvgPct:
      typeof partial.minFvgPct === "number" && !isNaN(partial.minFvgPct)
        ? Math.max(0, partial.minFvgPct)
        : DEFAULT_OB_FVG_SETTINGS.minFvgPct,
    enableMinDisplacement:
      partial.enableMinDisplacement !== undefined
        ? Boolean(partial.enableMinDisplacement)
        : DEFAULT_OB_FVG_SETTINGS.enableMinDisplacement,
    minDisplacementPct:
      typeof partial.minDisplacementPct === "number" && !isNaN(partial.minDisplacementPct)
        ? Math.max(0, partial.minDisplacementPct)
        : DEFAULT_OB_FVG_SETTINGS.minDisplacementPct,
    obZoneType: partial.obZoneType === "body" ? "body" : "full",
    maxActiveObZones:
      typeof partial.maxActiveObZones === "number" && !isNaN(partial.maxActiveObZones)
        ? Math.max(1, Math.min(500, Math.floor(partial.maxActiveObZones)))
        : DEFAULT_OB_FVG_SETTINGS.maxActiveObZones,
    bullishObColor: partial.bullishObColor || DEFAULT_OB_FVG_SETTINGS.bullishObColor,
    bearishObColor: partial.bearishObColor || DEFAULT_OB_FVG_SETTINGS.bearishObColor,
    bullishFvgColor: partial.bullishFvgColor || DEFAULT_OB_FVG_SETTINGS.bullishFvgColor,
    bearishFvgColor: partial.bearishFvgColor || DEFAULT_OB_FVG_SETTINGS.bearishFvgColor,
    mitigatedObColor: partial.mitigatedObColor || DEFAULT_OB_FVG_SETTINGS.mitigatedObColor,
    obFillOpacity:
      typeof partial.obFillOpacity === "number" && !isNaN(partial.obFillOpacity)
        ? Math.max(0.05, Math.min(0.8, partial.obFillOpacity))
        : DEFAULT_OB_FVG_SETTINGS.obFillOpacity,
    fvgFillOpacity:
      typeof partial.fvgFillOpacity === "number" && !isNaN(partial.fvgFillOpacity)
        ? Math.max(0.04, Math.min(0.6, partial.fvgFillOpacity))
        : DEFAULT_OB_FVG_SETTINGS.fvgFillOpacity,
    mitigatedOpacity:
      typeof partial.mitigatedOpacity === "number" && !isNaN(partial.mitigatedOpacity)
        ? Math.max(0.04, Math.min(0.5, partial.mitigatedOpacity))
        : DEFAULT_OB_FVG_SETTINGS.mitigatedOpacity,
    showObLabels:
      partial.showObLabels !== undefined
        ? Boolean(partial.showObLabels)
        : DEFAULT_OB_FVG_SETTINGS.showObLabels,
    showFvgLabels:
      partial.showFvgLabels !== undefined
        ? Boolean(partial.showFvgLabels)
        : DEFAULT_OB_FVG_SETTINGS.showFvgLabels,
    extendUnmitigatedOb:
      partial.extendUnmitigatedOb !== undefined
        ? Boolean(partial.extendUnmitigatedOb)
        : DEFAULT_OB_FVG_SETTINGS.extendUnmitigatedOb,
    showMitigatedObs:
      partial.showMitigatedObs !== undefined
        ? Boolean(partial.showMitigatedObs)
        : DEFAULT_OB_FVG_SETTINGS.showMitigatedObs,
  };
}

export function getStoredObFvgSettings(): ObFvgSettings {
  if (typeof window === "undefined") return { ...DEFAULT_OB_FVG_SETTINGS };
  try {
    const raw = window.localStorage.getItem(OB_FVG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OB_FVG_SETTINGS };
    const parsed = JSON.parse(raw);
    return normalizeObFvgSettings(parsed);
  } catch {
    return { ...DEFAULT_OB_FVG_SETTINGS };
  }
}

export function saveStoredObFvgSettings(settings: ObFvgSettings): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizeObFvgSettings(settings);
    window.localStorage.setItem(OB_FVG_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota errors
  }
}
