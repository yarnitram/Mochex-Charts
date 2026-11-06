/**
 * Sandwich ++ Confluence Engine
 *
 * Upgrades a normal Sandwich zone to Sandwich ++ when its price zone
 * overlaps a relevant confirmed higher-timeframe S/R zone.
 *
 * Requirements:
 * - Bearish RGRR: Overlaps confirmed Resistance (or Any S/R if configured)
 * - Bullish GRGG: Overlaps confirmed Support (or Any S/R if configured)
 * - Strict Confirmation Timing: Only S/R zones with `sr.confirmedAt <= sandwich.confirmedAt`
 *   are eligible for confluence evaluation (no future lookahead).
 */

import { doZonesOverlap } from "./sr-detector";
import { ConfluenceMode, SandwichZone, SrZone } from "./types";

/**
 * Checks if a Sandwich zone qualifies for Sandwich ++ confluence against a set of S/R zones.
 */
export function evaluateSandwichConfluence(
  zone: SandwichZone,
  availableSrZones: SrZone[],
  mode: ConfluenceMode = "directional"
): { isPlus: boolean; matchedTimeframes: string[]; matchedTypes: ("support" | "resistance")[] } {
  const matchedTfs = new Set<string>();
  const matchedTypes = new Set<"support" | "resistance">();

  for (const sr of availableSrZones) {
    // 1. Strict time check: S/R zone must be confirmed before or at Sandwich completion
    if (sr.confirmedAt > zone.confirmedAt) {
      continue;
    }

    // 2. Type relevance
    if (mode === "directional") {
      if (zone.direction === "bearish" && sr.type !== "resistance") {
        continue;
      }
      if (zone.direction === "bullish" && sr.type !== "support") {
        continue;
      }
    }

    // 3. Price overlap check
    if (doZonesOverlap(zone.top, zone.bottom, sr.top, sr.bottom)) {
      matchedTfs.add(sr.timeframe.toUpperCase());
      matchedTypes.add(sr.type);
    }
  }

  const isPlus = matchedTfs.size > 0;

  return {
    isPlus,
    matchedTimeframes: Array.from(matchedTfs),
    matchedTypes: Array.from(matchedTypes),
  };
}

/**
 * Evaluates confluence across an array of Sandwich zones in-place or returning updated zones.
 */
export function applyConfluenceToZones(
  zones: SandwichZone[],
  srZones: SrZone[],
  mode: ConfluenceMode = "directional"
): SandwichZone[] {
  return zones.map((zone) => {
    const res = evaluateSandwichConfluence(zone, srZones, mode);
    return {
      ...zone,
      isPlus: res.isPlus,
      matchedSRTimeframes: res.matchedTimeframes,
      matchedSrTypes: res.matchedTypes,
    };
  });
}
