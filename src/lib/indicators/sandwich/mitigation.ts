/**
 * Sandwich Zone Mitigation Engine
 *
 * Implements strict chronological lifecycle management:
 * ACTIVE -> MITIGATED
 *
 * Rules:
 * - Eligible only for candles strictly occurring after pattern confirmation:
 *   `candle.time > zone.confirmedAt`.
 * - Immediately freezes the right boundary at the exact timestamp of the first
 *   qualifying touch candle (`mitigatedAt`).
 * - Never extends again post-mitigation and never reactivates.
 * - Applies to both normal Sandwich and Sandwich ++.
 */

import { Bar } from "@/types/tradingview.d";
import { MitigationMode, SandwichZone } from "./types";

/**
 * Checks whether a single candle satisfies the mitigation criteria for a zone.
 */
export function checkCandleMitigatesZone(
  zone: SandwichZone,
  candle: Bar,
  mode: MitigationMode = "firstTouch"
): boolean {
  // Candle must be strictly after the 4th pattern candle
  if (candle.time <= zone.confirmedAt) {
    return false;
  }

  const height = zone.top - zone.bottom;
  const midpoint = zone.bottom + height * 0.5;

  if (zone.direction === "bearish") {
    // Bearish zone (Green candle): price approaches from below (upward)
    switch (mode) {
      case "firstTouch":
        return candle.high >= zone.bottom;
      case "halfFill":
        return candle.high >= midpoint;
      case "fullFill":
        return candle.high >= zone.top;
      default:
        return candle.high >= zone.bottom;
    }
  } else {
    // Bullish zone (Red candle): price approaches from above (downward)
    switch (mode) {
      case "firstTouch":
        return candle.low <= zone.top;
      case "halfFill":
        return candle.low <= midpoint;
      case "fullFill":
        return candle.low <= zone.bottom;
      default:
        return candle.low <= zone.top;
    }
  }
}

/**
 * Evaluates chronological mitigation for a single zone against an array of candles.
 * Returns the timestamp of the earliest qualifying mitigation candle, or undefined if still active.
 */
export function findEarliestMitigation(
  zone: SandwichZone,
  candles: Bar[],
  mode: MitigationMode = "firstTouch"
): number | undefined {
  if (zone.status === "mitigated" && zone.mitigatedAt) {
    return zone.mitigatedAt;
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.time <= zone.confirmedAt) continue;

    if (checkCandleMitigatesZone(zone, c, mode)) {
      return c.time;
    }
  }

  return undefined;
}

/**
 * Updates an array of Sandwich zones by applying chronological mitigation.
 */
export function applyMitigationToZones(
  zones: SandwichZone[],
  candles: Bar[],
  mode: MitigationMode = "firstTouch"
): { updatedZones: SandwichZone[]; newlyMitigated: SandwichZone[] } {
  const updatedZones: SandwichZone[] = [];
  const newlyMitigated: SandwichZone[] = [];

  for (const zone of zones) {
    if (zone.status === "mitigated") {
      updatedZones.push(zone);
      continue;
    }

    const mitTime = findEarliestMitigation(zone, candles, mode);
    if (mitTime !== undefined) {
      const mitigatedZone: SandwichZone = {
        ...zone,
        status: "mitigated",
        mitigatedAt: mitTime,
        mitigationMode: mode,
      };
      updatedZones.push(mitigatedZone);
      newlyMitigated.push(mitigatedZone);
    } else {
      updatedZones.push(zone);
    }
  }

  return { updatedZones, newlyMitigated };
}
