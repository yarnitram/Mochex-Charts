/**
 * Sandwich Zones ++ Orchestration Engine
 *
 * Coordinates:
 * - Multi-timeframe pattern detection
 * - Higher-timeframe S/R zone mapping
 * - Sandwich ++ confluence upgrades
 * - Chronological mitigation tracking
 * - Duplicate timeframe suppression
 * - Event callbacks
 */

import { Bar } from "@/types/tradingview.d";
import {
  ALL_SANDWICH_TIMEFRAMES,
  SandwichEventCallback,
  SandwichSettings,
  SandwichTimeframeId,
  SandwichZone,
  SrTimeframeId,
  SrZone,
} from "./types";
import { detectAllSandwichPatterns } from "./detector";
import { detectSrZones } from "./sr-detector";
import { applyConfluenceToZones } from "./confluence";
import { applyMitigationToZones } from "./mitigation";

/**
 * Normalizes resolution strings (e.g. "60", "1H" -> "60")
 */
export function normalizeResolution(res: string): string {
  const upper = (res || "").trim().toUpperCase();
  if (upper === "1" || upper === "1M") return "1";
  if (upper === "5" || upper === "5M") return "5";
  if (upper === "15" || upper === "15M") return "15";
  if (upper === "30" || upper === "30M") return "30";
  if (upper === "60" || upper === "1H" || upper === "60M") return "60";
  if (upper === "240" || upper === "4H" || upper === "240M") return "240";
  if (upper === "1D" || upper === "D") return "1D";
  return res;
}

/**
 * Checks if a timeframe ID matches the current chart resolution.
 */
export function isSandwichTimeframeMatchingChart(
  tfId: SandwichTimeframeId,
  chartResolution: string
): boolean {
  if (tfId === "current") return true;
  const meta = ALL_SANDWICH_TIMEFRAMES.find((tf) => tf.id === tfId);
  if (!meta) return false;
  return normalizeResolution(meta.resolution) === normalizeResolution(chartResolution);
}

/**
 * Duplicate suppression:
 * If current chart is enabled and an explicit MTF selection matches chart resolution,
 * suppress the duplicate MTF selection.
 */
export function isSandwichTimeframeDuplicate(
  tfId: SandwichTimeframeId,
  chartResolution: string,
  isCurrentChartVisible: boolean
): boolean {
  if (tfId === "current") return false;
  if (!isCurrentChartVisible) return false;
  return isSandwichTimeframeMatchingChart(tfId, chartResolution);
}

export interface ComputeSandwichOptions {
  symbol: string;
  chartResolution: string;
  chartBars: Bar[];
  mtfBarsMap: Map<string, Bar[]>; // key: timeframeId ("1m", "5m", "15m", "30m", "1h", "4h", "1d")
  settings: SandwichSettings;
  tickSize?: number;
  onEvent?: SandwichEventCallback;
}

export interface SandwichEngineResult {
  zones: SandwichZone[];
  srZones: SrZone[];
  activeCount: number;
  mitigatedCount: number;
  plusCount: number;
}

/**
 * Pure calculation function that produces all visible Sandwich zones and S/R zones.
 */
export function computeSandwichEngine(options: ComputeSandwichOptions): SandwichEngineResult {
  const {
    symbol,
    chartResolution,
    chartBars,
    mtfBarsMap,
    settings,
    tickSize = 0.01,
    onEvent,
  } = options;

  if (!settings.showIndicator || chartBars.length === 0) {
    return {
      zones: [],
      srZones: [],
      activeCount: 0,
      mitigatedCount: 0,
      plusCount: 0,
    };
  }

  // 1. Detect S/R zones on 1H, 4H, and 1D if S/R is enabled
  const allSrZones: SrZone[] = [];
  if (settings.enableSr) {
    const srKeys: SrTimeframeId[] = ["1h", "4h", "1d"];
    for (const srTf of srKeys) {
      if (!settings.srTimeframes[srTf]) continue;

      let barsForSr: Bar[] | undefined;
      if (isSandwichTimeframeMatchingChart(srTf, chartResolution)) {
        barsForSr = chartBars;
      } else {
        barsForSr = mtfBarsMap.get(srTf);
      }

      if (barsForSr && barsForSr.length > 0) {
        const detected = detectSrZones(
          barsForSr,
          srTf,
          settings.pivotLeft,
          settings.pivotRight
        );
        allSrZones.push(...detected);
      }
    }
  }

  // 2. Detect Sandwich patterns on each active, non-duplicate timeframe
  let rawZones: SandwichZone[] = [];

  // 2a. Current chart timeframe
  if (settings.timeframes.current) {
    const curZones = detectAllSandwichPatterns(
      chartBars,
      symbol,
      "current",
      normalizeResolution(chartResolution).toUpperCase(),
      settings,
      tickSize
    );
    rawZones.push(...curZones);
  }

  // 2b. Additional explicit timeframes
  const additionalTfs: Exclude<SandwichTimeframeId, "current">[] = [
    "1m",
    "5m",
    "15m",
    "30m",
    "1h",
    "4h",
    "1d",
  ];

  for (const tfId of additionalTfs) {
    if (!settings.timeframes[tfId]) continue;
    if (isSandwichTimeframeDuplicate(tfId, chartResolution, settings.timeframes.current)) {
      continue;
    }

    const sourceBars = mtfBarsMap.get(tfId);
    if (!sourceBars || sourceBars.length < 4) continue;

    const tfMeta = ALL_SANDWICH_TIMEFRAMES.find((t) => t.id === tfId);
    const label = tfMeta ? tfMeta.label.split(" ")[0].toUpperCase() : tfId.toUpperCase();

    const tfZones = detectAllSandwichPatterns(
      sourceBars,
      symbol,
      tfId,
      label,
      settings,
      tickSize
    );
    rawZones.push(...tfZones);
  }

  // 3. Evaluate Sandwich ++ Confluence against confirmed S/R zones
  if (settings.enableConfluence && allSrZones.length > 0) {
    rawZones = applyConfluenceToZones(rawZones, allSrZones, settings.confluenceMode);
  }

  // 4. Evaluate Chronological Mitigation
  if (settings.enableMitigation) {
    // For mitigation, use chartBars (or source timeframe candles) to find touch events
    for (let z = 0; z < rawZones.length; z++) {
      const zone = rawZones[z];
      let testCandles = chartBars;
      if (zone.timeframe !== "current") {
        const srcCandles = mtfBarsMap.get(zone.timeframe);
        // If source candles exist, we can combine or use chartBars if chartBars cover after confirmation
        if (srcCandles && srcCandles.length > 0) {
          testCandles = chartBars;
        }
      }

      const { updatedZones } = applyMitigationToZones(
        [zone],
        testCandles,
        settings.mitigationMode
      );
      rawZones[z] = updatedZones[0];
    }
  }

  // 5. Fire callbacks for newly formed patterns or events
  if (onEvent) {
    for (const z of rawZones) {
      if (z.isPlus) {
        onEvent({
          type: z.direction === "bearish" ? "sandwich_plus_short" : "sandwich_plus_long",
          zone: z,
        });
      } else {
        onEvent({
          type: z.pattern === "RGRR" ? "new_rgrr" : "new_grgg",
          zone: z,
        });
      }
      if (z.status === "mitigated") {
        onEvent({ type: "zone_mitigated", zone: z });
      }
    }
  }

  // 6. Filter by display preferences
  let filteredZones = rawZones.filter((z) => {
    if (settings.showOnlyUnmitigated && z.status === "mitigated") {
      return false;
    }
    if (!settings.showActiveZones && z.status === "active") {
      return false;
    }
    if (!settings.showMitigatedZones && z.status === "mitigated") {
      return false;
    }
    return true;
  });

  // Sort by confirmation time descending (newest first)
  filteredZones.sort((a, b) => b.confirmedAt - a.confirmedAt);

  // Apply maximum historical zones limit
  if (filteredZones.length > settings.maxHistoricalZones) {
    filteredZones = filteredZones.slice(0, settings.maxHistoricalZones);
  }

  // Re-sort chronologically for proper canvas layering
  filteredZones.sort((a, b) => a.sourceCandleTime - b.sourceCandleTime);

  const activeCount = filteredZones.filter((z) => z.status === "active").length;
  const mitigatedCount = filteredZones.filter((z) => z.status === "mitigated").length;
  const plusCount = filteredZones.filter((z) => z.isPlus).length;

  return {
    zones: filteredZones,
    srZones: settings.showSrBoxes ? allSrZones : [],
    activeCount,
    mitigatedCount,
    plusCount,
  };
}
