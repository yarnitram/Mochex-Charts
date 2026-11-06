/**
 * Sandwich Zones ++ Indicator Types & Data Structures
 */

export type SandwichDirection = "bullish" | "bearish";
export type SandwichPatternType = "RGRR" | "GRGG";
export type ZoneStatus = "active" | "mitigated";
export type MitigationMode = "firstTouch" | "halfFill" | "fullFill";
export type ConfluenceMode = "directional" | "any";

export type SandwichTimeframeId =
  | "current"
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d";

export type SrTimeframeId = "1h" | "4h" | "1d";

export interface SrZone {
  id: string;
  timeframe: SrTimeframeId;
  type: "support" | "resistance";
  pivotTime: number; // Timestamp of pivot candle
  confirmedAt: number; // Timestamp when right-side bars confirmed pivot
  top: number;
  bottom: number;
  pivotPrice: number;
}

export interface SandwichZone {
  id: string;
  symbol: string;
  timeframe: SandwichTimeframeId;
  timeframeLabel: string;
  direction: SandwichDirection;
  pattern: SandwichPatternType;

  sourceCandleTime: number; // Candle 2 start time (where zone starts)
  confirmedAt: number; // Candle 4 close time (when zone is confirmed)

  top: number;
  bottom: number;
  fvgTop: number;
  fvgBottom: number;
  fvgSize: number;

  isPlus: boolean;
  matchedSRTimeframes: string[]; // e.g. ["1H", "4H"]
  matchedSrTypes?: ("support" | "resistance")[];

  status: ZoneStatus;
  mitigatedAt?: number; // Exact timestamp of earliest qualifying mitigation candle
  mitigationMode: MitigationMode;
}

export interface SandwichSettings {
  showIndicator: boolean;

  // Patterns
  enableRgrr: boolean;
  enableGrgg: boolean;
  requireFvg: boolean;
  minFvgTicks: number;
  useBodyOnly: boolean; // default false (full candle wicks)

  // Timeframes
  timeframes: Record<SandwichTimeframeId, boolean>;

  // Support & Resistance
  enableSr: boolean;
  showSrBoxes: boolean;
  srTimeframes: Record<SrTimeframeId, boolean>;
  pivotLeft: number; // default 3
  pivotRight: number; // default 3

  // Sandwich ++ Confluence
  enableConfluence: boolean;
  confluenceMode: ConfluenceMode; // "directional" | "any"

  // Mitigation
  enableMitigation: boolean;
  mitigationMode: MitigationMode; // "firstTouch" | "halfFill" | "fullFill"
  showActiveZones: boolean;
  showMitigatedZones: boolean;
  showOnlyUnmitigated: boolean;

  // Appearance & Styling
  bullishColor: string; // default #00c087 (Emerald Green)
  bearishColor: string; // default #f23645 (Crimson Red)
  plusColor: string; // default #ffd700 (Gold)
  mitigatedColor: string; // default #787b86 (Gray)
  supportColor: string; // default #26a69a (Teal)
  resistanceColor: string; // default #ef5350 (Coral Red)
  fillOpacity: number; // 0.0 to 1.0, default 0.22
  mitigatedOpacity: number; // 0.0 to 1.0, default 0.12
  showLabels: boolean;
  maxHistoricalZones: number; // default 100
}

export const ALL_SANDWICH_TIMEFRAMES: {
  id: SandwichTimeframeId;
  label: string;
  resolution: string;
  durationMs: number;
}[] = [
  { id: "current", label: "Current Chart", resolution: "", durationMs: 0 },
  { id: "1m", label: "1 minute", resolution: "1", durationMs: 60 * 1000 },
  { id: "5m", label: "5 minutes", resolution: "5", durationMs: 5 * 60 * 1000 },
  { id: "15m", label: "15 minutes", resolution: "15", durationMs: 15 * 60 * 1000 },
  { id: "30m", label: "30 minutes", resolution: "30", durationMs: 30 * 60 * 1000 },
  { id: "1h", label: "1 hour", resolution: "60", durationMs: 60 * 60 * 1000 },
  { id: "4h", label: "4 hours", resolution: "240", durationMs: 4 * 60 * 60 * 1000 },
  { id: "1d", label: "1 day", resolution: "1D", durationMs: 24 * 60 * 60 * 1000 },
];

export const ALL_SR_TIMEFRAMES: {
  id: SrTimeframeId;
  label: string;
  resolution: string;
  durationMs: number;
}[] = [
  { id: "1h", label: "1 Hour", resolution: "60", durationMs: 60 * 60 * 1000 },
  { id: "4h", label: "4 Hours", resolution: "240", durationMs: 4 * 60 * 60 * 1000 },
  { id: "1d", label: "1 Day", resolution: "1D", durationMs: 24 * 60 * 60 * 1000 },
];

export type SandwichEventCallback = (event: {
  type:
    | "new_rgrr"
    | "new_grgg"
    | "sandwich_plus_short"
    | "sandwich_plus_long"
    | "zone_mitigated";
  zone: SandwichZone;
}) => void;
