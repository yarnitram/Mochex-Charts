/**
 * MTF EMA Settings & LocalStorage Persistence
 */

import { MtfEmaSettings } from "./types";

export const MTF_EMA_STORAGE_KEY = "mochex:mtf_ema_settings";

export const DEFAULT_MTF_EMA_SETTINGS: MtfEmaSettings = {
  showIndicator: true,
  timeframes: {
    current: true,
    "1m": false,
    "5m": false,
    "15m": false,
    "1h": false,
    "2h": false,
    "4h": false,
    "1d": false,
    "1w": false,
  },
  periods: {
    20: true,
    50: true,
    100: true,
    200: true,
  },
  currentColors: {
    20: "#ffffff", // White
    50: "#2962ff", // Blue
    100: "#f5ac37", // Yellow
    200: "#ff7043", // Orange
  },
  timeframeColors: {
    "1m": "#787b86", // Gray
    "5m": "#2196f3", // Blue
    "15m": "#00e5ff", // Aqua
    "1h": "#00c087", // Green
    "2h": "#fbc02d", // Yellow
    "4h": "#ff9800", // Orange
    "1d": "#f23645", // Red
    "1w": "#ab47bc", // Purple
  },
  lineWidths: {
    20: 1,
    50: 2,
    100: 3,
    200: 4,
  },
  showCurrentLabels: true,
  showMtfLabels: true,
  textSize: "small",
  labelOffsetBars: 5,
  labelBgOpacity: 0.85,
  transparentLabelBg: false,
  abbreviatedLabels: false,
  smartLabelSpacing: true,
  minLabelSpacingPx: 14,
  showDevelopingHtf: false,
};

/**
 * Validates and normalizes settings against defaults
 */
export function normalizeMtfEmaSettings(
  partial?: Partial<MtfEmaSettings> | null
): MtfEmaSettings {
  if (!partial) return { ...DEFAULT_MTF_EMA_SETTINGS };

  return {
    showIndicator:
      partial.showIndicator !== undefined
        ? Boolean(partial.showIndicator)
        : DEFAULT_MTF_EMA_SETTINGS.showIndicator,
    timeframes: {
      ...DEFAULT_MTF_EMA_SETTINGS.timeframes,
      ...(partial.timeframes || {}),
    },
    periods: {
      ...DEFAULT_MTF_EMA_SETTINGS.periods,
      ...(partial.periods || {}),
    },
    currentColors: {
      ...DEFAULT_MTF_EMA_SETTINGS.currentColors,
      ...(partial.currentColors || {}),
    },
    timeframeColors: {
      ...DEFAULT_MTF_EMA_SETTINGS.timeframeColors,
      ...(partial.timeframeColors || {}),
    },
    lineWidths: {
      ...DEFAULT_MTF_EMA_SETTINGS.lineWidths,
      ...(partial.lineWidths || {}),
    },
    showCurrentLabels:
      partial.showCurrentLabels !== undefined
        ? Boolean(partial.showCurrentLabels)
        : DEFAULT_MTF_EMA_SETTINGS.showCurrentLabels,
    showMtfLabels:
      partial.showMtfLabels !== undefined
        ? Boolean(partial.showMtfLabels)
        : DEFAULT_MTF_EMA_SETTINGS.showMtfLabels,
    textSize:
      partial.textSize === "tiny" ||
      partial.textSize === "small" ||
      partial.textSize === "normal"
        ? partial.textSize
        : DEFAULT_MTF_EMA_SETTINGS.textSize,
    labelOffsetBars:
      typeof partial.labelOffsetBars === "number" && !isNaN(partial.labelOffsetBars)
        ? Math.max(0, Math.min(50, partial.labelOffsetBars))
        : DEFAULT_MTF_EMA_SETTINGS.labelOffsetBars,
    labelBgOpacity:
      typeof partial.labelBgOpacity === "number" && !isNaN(partial.labelBgOpacity)
        ? Math.max(0, Math.min(1, partial.labelBgOpacity))
        : DEFAULT_MTF_EMA_SETTINGS.labelBgOpacity,
    transparentLabelBg:
      partial.transparentLabelBg !== undefined
        ? Boolean(partial.transparentLabelBg)
        : DEFAULT_MTF_EMA_SETTINGS.transparentLabelBg,
    abbreviatedLabels:
      partial.abbreviatedLabels !== undefined
        ? Boolean(partial.abbreviatedLabels)
        : DEFAULT_MTF_EMA_SETTINGS.abbreviatedLabels,
    smartLabelSpacing:
      partial.smartLabelSpacing !== undefined
        ? Boolean(partial.smartLabelSpacing)
        : DEFAULT_MTF_EMA_SETTINGS.smartLabelSpacing,
    minLabelSpacingPx:
      typeof partial.minLabelSpacingPx === "number" && !isNaN(partial.minLabelSpacingPx)
        ? Math.max(8, Math.min(40, partial.minLabelSpacingPx))
        : DEFAULT_MTF_EMA_SETTINGS.minLabelSpacingPx,
    showDevelopingHtf:
      partial.showDevelopingHtf !== undefined
        ? Boolean(partial.showDevelopingHtf)
        : DEFAULT_MTF_EMA_SETTINGS.showDevelopingHtf,
  };
}

/**
 * Retrieves persisted settings from localStorage
 */
export function getStoredMtfEmaSettings(): MtfEmaSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_MTF_EMA_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(MTF_EMA_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MTF_EMA_SETTINGS };
    const parsed = JSON.parse(raw);
    return normalizeMtfEmaSettings(parsed);
  } catch (err) {
    console.error("Failed to load MTF EMA settings from localStorage", err);
    return { ...DEFAULT_MTF_EMA_SETTINGS };
  }
}

/**
 * Persists settings to localStorage
 */
export function saveStoredMtfEmaSettings(settings: MtfEmaSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MTF_EMA_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save MTF EMA settings to localStorage", err);
  }
}
