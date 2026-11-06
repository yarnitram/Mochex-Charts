/**
 * MTF EMA Indicator Types & Models
 * Indicator: "MTF EMA — 20/50/100/200"
 */

export type MtfTimeframeId =
  | "current"
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "2h"
  | "4h"
  | "1d"
  | "1w";

export type EmaPeriod = 20 | 50 | 100 | 200;

export const ALL_MTF_TIMEFRAMES: { id: MtfTimeframeId; label: string; resolution: string; durationMs: number }[] = [
  { id: "current", label: "Current Chart", resolution: "", durationMs: 0 },
  { id: "1m", label: "1 minute", resolution: "1", durationMs: 60 * 1000 },
  { id: "5m", label: "5 minutes", resolution: "5", durationMs: 5 * 60 * 1000 },
  { id: "15m", label: "15 minutes", resolution: "15", durationMs: 15 * 60 * 1000 },
  { id: "1h", label: "1 hour", resolution: "60", durationMs: 60 * 60 * 1000 },
  { id: "2h", label: "2 hours", resolution: "120", durationMs: 2 * 60 * 60 * 1000 },
  { id: "4h", label: "4 hours", resolution: "240", durationMs: 4 * 60 * 60 * 1000 },
  { id: "1d", label: "1 day", resolution: "1D", durationMs: 24 * 60 * 60 * 1000 },
  { id: "1w", label: "1 week", resolution: "1W", durationMs: 7 * 24 * 60 * 60 * 1000 },
];

export const ALL_EMA_PERIODS: EmaPeriod[] = [20, 50, 100, 200];

export type LabelTextSize = "tiny" | "small" | "normal";

export interface MtfEmaSettings {
  showIndicator: boolean;
  timeframes: Record<MtfTimeframeId, boolean>;
  periods: Record<EmaPeriod, boolean>;
  currentColors: Record<EmaPeriod, string>;
  timeframeColors: Record<Exclude<MtfTimeframeId, "current">, string>;
  lineWidths: Record<EmaPeriod, number>;
  showCurrentLabels: boolean;
  showMtfLabels: boolean;
  textSize: LabelTextSize;
  labelOffsetBars: number;
  labelBgOpacity: number; // 0.0 to 1.0 (default 0.85)
  transparentLabelBg: boolean;
  abbreviatedLabels: boolean;
  smartLabelSpacing: boolean;
  minLabelSpacingPx: number; // default 14
  showDevelopingHtf: boolean; // default false
}

export interface MtfEmaPoint {
  time: number; // ms
  value: number;
  isDeveloping?: boolean;
}

export interface MtfEmaSeriesData {
  timeframeId: MtfTimeframeId;
  timeframeLabel: string;
  period: EmaPeriod;
  color: string;
  lineWidth: number;
  points: MtfEmaPoint[];
  latestValue: number | null;
  label: string;
  shortLabel: string;
}

export interface MtfEmaLabelItem {
  id: string;
  text: string;
  price: number;
  originalY: number;
  adjustedY: number;
  color: string;
  timeframeId: MtfTimeframeId;
  period: EmaPeriod;
  isCurrent: boolean;
}
