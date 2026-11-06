/**
 * Sandwich Zones ++ Settings & LocalStorage Persistence
 */

import { SandwichSettings } from "./types";

export const SANDWICH_STORAGE_KEY = "mochex:sandwich_zones_settings";

export const DEFAULT_SANDWICH_SETTINGS: SandwichSettings = {
  showIndicator: true,

  // Patterns
  enableRgrr: true,
  enableGrgg: true,
  requireFvg: true,
  minFvgTicks: 0,
  useBodyOnly: false,

  // Timeframes
  timeframes: {
    current: true,
    "1m": false,
    "5m": false,
    "15m": false,
    "30m": false,
    "1h": false,
    "4h": false,
    "1d": false,
  },

  // Support & Resistance
  enableSr: true,
  showSrBoxes: false, // Don't clutter chart unless user wants raw S/R boxes visible
  srTimeframes: {
    "1h": true,
    "4h": true,
    "1d": true,
  },
  pivotLeft: 3,
  pivotRight: 3,

  // Sandwich ++ Confluence
  enableConfluence: true,
  confluenceMode: "directional",

  // Mitigation
  enableMitigation: true,
  mitigationMode: "firstTouch",
  showActiveZones: true,
  showMitigatedZones: true,
  showOnlyUnmitigated: false,

  // Appearance
  bullishColor: "#00c087", // Green
  bearishColor: "#f23645", // Red
  plusColor: "#ffd700", // Gold / Yellow
  mitigatedColor: "#787b86", // Gray
  supportColor: "#26a69a", // Teal
  resistanceColor: "#ef5350", // Coral
  fillOpacity: 0.22,
  mitigatedOpacity: 0.12,
  showLabels: true,
  maxHistoricalZones: 100,
};

/**
 * Validates and normalizes settings against defaults
 */
export function normalizeSandwichSettings(
  partial?: Partial<SandwichSettings> | null
): SandwichSettings {
  if (!partial) return { ...DEFAULT_SANDWICH_SETTINGS };

  return {
    showIndicator:
      partial.showIndicator !== undefined
        ? Boolean(partial.showIndicator)
        : DEFAULT_SANDWICH_SETTINGS.showIndicator,

    enableRgrr:
      partial.enableRgrr !== undefined
        ? Boolean(partial.enableRgrr)
        : DEFAULT_SANDWICH_SETTINGS.enableRgrr,

    enableGrgg:
      partial.enableGrgg !== undefined
        ? Boolean(partial.enableGrgg)
        : DEFAULT_SANDWICH_SETTINGS.enableGrgg,

    requireFvg:
      partial.requireFvg !== undefined
        ? Boolean(partial.requireFvg)
        : DEFAULT_SANDWICH_SETTINGS.requireFvg,

    minFvgTicks:
      typeof partial.minFvgTicks === "number" && !isNaN(partial.minFvgTicks)
        ? Math.max(0, Math.floor(partial.minFvgTicks))
        : DEFAULT_SANDWICH_SETTINGS.minFvgTicks,

    useBodyOnly:
      partial.useBodyOnly !== undefined
        ? Boolean(partial.useBodyOnly)
        : DEFAULT_SANDWICH_SETTINGS.useBodyOnly,

    timeframes: {
      ...DEFAULT_SANDWICH_SETTINGS.timeframes,
      ...(partial.timeframes || {}),
    },

    enableSr:
      partial.enableSr !== undefined
        ? Boolean(partial.enableSr)
        : DEFAULT_SANDWICH_SETTINGS.enableSr,

    showSrBoxes:
      partial.showSrBoxes !== undefined
        ? Boolean(partial.showSrBoxes)
        : DEFAULT_SANDWICH_SETTINGS.showSrBoxes,

    srTimeframes: {
      ...DEFAULT_SANDWICH_SETTINGS.srTimeframes,
      ...(partial.srTimeframes || {}),
    },

    pivotLeft:
      typeof partial.pivotLeft === "number" && !isNaN(partial.pivotLeft)
        ? Math.max(1, Math.min(20, Math.floor(partial.pivotLeft)))
        : DEFAULT_SANDWICH_SETTINGS.pivotLeft,

    pivotRight:
      typeof partial.pivotRight === "number" && !isNaN(partial.pivotRight)
        ? Math.max(1, Math.min(20, Math.floor(partial.pivotRight)))
        : DEFAULT_SANDWICH_SETTINGS.pivotRight,

    enableConfluence:
      partial.enableConfluence !== undefined
        ? Boolean(partial.enableConfluence)
        : DEFAULT_SANDWICH_SETTINGS.enableConfluence,

    confluenceMode:
      partial.confluenceMode === "any" ? "any" : "directional",

    enableMitigation:
      partial.enableMitigation !== undefined
        ? Boolean(partial.enableMitigation)
        : DEFAULT_SANDWICH_SETTINGS.enableMitigation,

    mitigationMode:
      partial.mitigationMode === "halfFill" || partial.mitigationMode === "fullFill"
        ? partial.mitigationMode
        : "firstTouch",

    showActiveZones:
      partial.showActiveZones !== undefined
        ? Boolean(partial.showActiveZones)
        : DEFAULT_SANDWICH_SETTINGS.showActiveZones,

    showMitigatedZones:
      partial.showMitigatedZones !== undefined
        ? Boolean(partial.showMitigatedZones)
        : DEFAULT_SANDWICH_SETTINGS.showMitigatedZones,

    showOnlyUnmitigated:
      partial.showOnlyUnmitigated !== undefined
        ? Boolean(partial.showOnlyUnmitigated)
        : DEFAULT_SANDWICH_SETTINGS.showOnlyUnmitigated,

    bullishColor: partial.bullishColor || DEFAULT_SANDWICH_SETTINGS.bullishColor,
    bearishColor: partial.bearishColor || DEFAULT_SANDWICH_SETTINGS.bearishColor,
    plusColor: partial.plusColor || DEFAULT_SANDWICH_SETTINGS.plusColor,
    mitigatedColor: partial.mitigatedColor || DEFAULT_SANDWICH_SETTINGS.mitigatedColor,
    supportColor: partial.supportColor || DEFAULT_SANDWICH_SETTINGS.supportColor,
    resistanceColor: partial.resistanceColor || DEFAULT_SANDWICH_SETTINGS.resistanceColor,

    fillOpacity:
      typeof partial.fillOpacity === "number" && !isNaN(partial.fillOpacity)
        ? Math.max(0.05, Math.min(0.9, partial.fillOpacity))
        : DEFAULT_SANDWICH_SETTINGS.fillOpacity,

    mitigatedOpacity:
      typeof partial.mitigatedOpacity === "number" && !isNaN(partial.mitigatedOpacity)
        ? Math.max(0.02, Math.min(0.6, partial.mitigatedOpacity))
        : DEFAULT_SANDWICH_SETTINGS.mitigatedOpacity,

    showLabels:
      partial.showLabels !== undefined
        ? Boolean(partial.showLabels)
        : DEFAULT_SANDWICH_SETTINGS.showLabels,

    maxHistoricalZones:
      typeof partial.maxHistoricalZones === "number" && !isNaN(partial.maxHistoricalZones)
        ? Math.max(10, Math.min(500, Math.floor(partial.maxHistoricalZones)))
        : DEFAULT_SANDWICH_SETTINGS.maxHistoricalZones,
  };
}

/**
 * Retrieves persisted settings from localStorage
 */
export function getStoredSandwichSettings(): SandwichSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SANDWICH_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(SANDWICH_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SANDWICH_SETTINGS };
    const parsed = JSON.parse(raw);
    return normalizeSandwichSettings(parsed);
  } catch (err) {
    console.warn("[Sandwich Settings] Failed to load localStorage settings:", err);
    return { ...DEFAULT_SANDWICH_SETTINGS };
  }
}

/**
 * Persists settings to localStorage
 */
export function saveStoredSandwichSettings(settings: SandwichSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SANDWICH_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("[Sandwich Settings] Failed to save localStorage settings:", err);
  }
}
