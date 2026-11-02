import { DrawingToolType } from "@/components/terminal/DrawingRail";
import { CandlestickBar } from "@/lib/mexc/types";

export interface ChartDrawingPoint {
  time: number;
  price: number;
}

export interface FibLevelConfig {
  ratio: number;
  color: string;
  enabled: boolean;
  bg?: string;
}

export interface DrawingTemplate {
  id: string;
  name: string;
  toolType: DrawingToolType;
  style: Partial<ChartDrawing>;
  createdAt: number;
}

export interface ChartDrawing {
  id: string;
  type: DrawingToolType;
  startTime: number; // UTC millisecond timestamp
  startPrice: number;
  endTime: number; // UTC millisecond timestamp
  endPrice: number;
  points?: ChartDrawingPoint[]; // For multi-point tools (path, trend_fib)
  targetPrice?: number; // For long/short position
  stopPrice?: number; // For long/short position
  color?: string;
  lineWidth?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  fillColor?: string;
  fillOpacity?: number;
  extendLeft?: boolean;
  extendRight?: boolean;
  showMetrics?: boolean;
  text?: string;
  fontSize?: number;
  isLocked?: boolean;
  isHidden?: boolean;
  name?: string;
  fibLevels?: FibLevelConfig[];

  // Rectangle 50% Equilibrium Line
  showMidLine?: boolean;
  midLineColor?: string;
  midLineStyle?: "solid" | "dashed" | "dotted";

  // Text Alignment
  textAlign?: "left" | "center" | "right";
  textVAlign?: "top" | "middle" | "bottom";

  // Gann Box Matrix Customization
  gannPriceLevels?: FibLevelConfig[];
  gannTimeLevels?: FibLevelConfig[];
  showGannAngles?: boolean;
  gannAnglesColor?: string;

  // Background Fill Shading Controls
  showBackground?: boolean;

  // Long & Short Position Customization (DEC-066)
  profitColor?: string;
  profitOpacity?: number;
  stopColor?: string;
  stopOpacity?: number;
  accountSize?: number;
  riskPercent?: number;
  riskAmount?: number;
  quantity?: number;
  showLabels?: boolean;
}

export interface FibLevel {
  ratio: number;
  price: number;
  color: string;
  bg: string;
}

export const DEFAULT_FIB_LEVELS: FibLevelConfig[] = [
  { ratio: 0.0, color: "rgba(141, 144, 162, 0.9)", enabled: true, bg: "rgba(141, 144, 162, 0.08)" },
  { ratio: 0.236, color: "rgba(245, 172, 55, 0.9)", enabled: true, bg: "rgba(245, 172, 55, 0.08)" },
  { ratio: 0.382, color: "rgba(255, 213, 79, 0.9)", enabled: true, bg: "rgba(255, 213, 79, 0.08)" },
  { ratio: 0.5, color: "rgba(144, 202, 249, 0.9)", enabled: true, bg: "rgba(144, 202, 249, 0.08)" },
  { ratio: 0.618, color: "rgba(0, 216, 255, 0.95)", enabled: true, bg: "rgba(0, 216, 255, 0.12)" },
  { ratio: 0.786, color: "rgba(147, 83, 211, 0.9)", enabled: true, bg: "rgba(147, 83, 211, 0.08)" },
  { ratio: 1.0, color: "rgba(141, 144, 162, 0.9)", enabled: true, bg: "rgba(141, 144, 162, 0.08)" },
  { ratio: 1.618, color: "rgba(0, 192, 135, 0.95)", enabled: true, bg: "rgba(0, 192, 135, 0.08)" },
  { ratio: 2.618, color: "rgba(245, 172, 55, 0.9)", enabled: false, bg: "rgba(245, 172, 55, 0.08)" },
  { ratio: 3.618, color: "rgba(255, 59, 48, 0.9)", enabled: false, bg: "rgba(255, 59, 48, 0.08)" },
  { ratio: 4.236, color: "rgba(144, 202, 249, 0.9)", enabled: false, bg: "rgba(144, 202, 249, 0.08)" },
];

export const FIB_CONFIG = DEFAULT_FIB_LEVELS;

/**
 * Calculates standard Fibonacci Retracement levels from start price to end price (DEC-050).
 */
export function calculateFibLevels(
  startPrice: number,
  endPrice: number,
  customLevels?: FibLevelConfig[]
): FibLevel[] {
  const diff = endPrice - startPrice;
  const levels = customLevels && customLevels.length > 0 ? customLevels : DEFAULT_FIB_LEVELS;
  return levels
    .filter((lvl) => lvl.enabled !== false)
    .map((lvl) => ({
      ratio: lvl.ratio,
      price: startPrice + diff * (1 - lvl.ratio),
      color: lvl.color,
      bg: lvl.bg || "rgba(41, 98, 255, 0.06)",
    }));
}

/**
 * Calculates 3-point Trend-Based Fibonacci Extension levels (DEC-055).
 * Wave 1 delta = p2 - p1. Extension levels project from p3: p3 + waveDiff * ratio.
 */
export function calculateTrendFibLevels(
  p1Price: number,
  p2Price: number,
  p3Price: number,
  customLevels?: FibLevelConfig[]
): FibLevel[] {
  const waveDiff = p2Price - p1Price;
  const levels = customLevels && customLevels.length > 0 ? customLevels : DEFAULT_FIB_LEVELS;
  return levels
    .filter((lvl) => lvl.enabled !== false)
    .map((lvl) => ({
      ratio: lvl.ratio,
      price: p3Price + waveDiff * lvl.ratio,
      color: lvl.color,
      bg: lvl.bg || "rgba(41, 98, 255, 0.06)",
    }));
}

export const GANN_RATIOS = [0.0, 0.25, 0.382, 0.5, 0.618, 0.75, 1.0];

export const DEFAULT_GANN_PRICE_LEVELS: FibLevelConfig[] = [
  { ratio: 0.0, color: "rgba(255, 255, 255, 0.3)", enabled: true },
  { ratio: 0.25, color: "rgba(255, 255, 255, 0.15)", enabled: true },
  { ratio: 0.382, color: "rgba(245, 172, 55, 0.6)", enabled: true },
  { ratio: 0.5, color: "rgba(0, 216, 255, 0.75)", enabled: true },
  { ratio: 0.618, color: "rgba(245, 172, 55, 0.6)", enabled: true },
  { ratio: 0.75, color: "rgba(255, 255, 255, 0.15)", enabled: true },
  { ratio: 1.0, color: "rgba(255, 255, 255, 0.3)", enabled: true },
];

export const DEFAULT_GANN_TIME_LEVELS: FibLevelConfig[] = [
  { ratio: 0.0, color: "rgba(255, 255, 255, 0.3)", enabled: true },
  { ratio: 0.25, color: "rgba(255, 255, 255, 0.15)", enabled: true },
  { ratio: 0.382, color: "rgba(245, 172, 55, 0.6)", enabled: true },
  { ratio: 0.5, color: "rgba(0, 216, 255, 0.75)", enabled: true },
  { ratio: 0.618, color: "rgba(245, 172, 55, 0.6)", enabled: true },
  { ratio: 0.75, color: "rgba(255, 255, 255, 0.15)", enabled: true },
  { ratio: 1.0, color: "rgba(255, 255, 255, 0.3)", enabled: true },
];

/**
 * Calculates 7x7 matrix grid levels for Gann Box (DEC-055, DEC-059).
 */
export function calculateGannBoxLevels(
  startPrice: number,
  endPrice: number,
  startTime: number,
  endTime: number,
  customPriceLevels?: FibLevelConfig[],
  customTimeLevels?: FibLevelConfig[]
) {
  const priceDiff = endPrice - startPrice;
  const timeDiff = endTime - startTime;

  const pConfigs = (customPriceLevels || DEFAULT_GANN_PRICE_LEVELS).filter((lvl) => lvl.enabled !== false);
  const tConfigs = (customTimeLevels || DEFAULT_GANN_TIME_LEVELS).filter((lvl) => lvl.enabled !== false);

  const priceLevels = pConfigs.map((lvl) => ({
    ratio: lvl.ratio,
    price: startPrice + priceDiff * lvl.ratio,
    color: lvl.color,
  }));

  const timeLevels = tConfigs.map((lvl) => ({
    ratio: lvl.ratio,
    time: Math.round(startTime + timeDiff * lvl.ratio),
    color: lvl.color,
  }));

  return { priceLevels, timeLevels };
}

export interface PositionMetrics {
  isLong: boolean;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  targetDiff: number;
  stopDiff: number;
  riskRewardRatio: number;
  targetPercent: number;
  stopPercent: number;
  accountSize: number;
  riskPercent: number;
  riskAmount: number;
  quantity: number;
  estimatedProfit: number;
  estimatedLoss: number;
}

/**
 * Computes Risk/Reward metrics, stop/target price zones, and lot sizing for Long/Short positions (DEC-054, DEC-066).
 */
export function calculatePositionMetrics(
  entryPrice: number,
  targetOrEndPrice: number,
  explicitStop?: number,
  forcedIsLong?: boolean,
  accountSize: number = 10000,
  riskPercent: number = 1.0,
  explicitRiskAmount?: number
): PositionMetrics {
  const isLong = forcedIsLong !== undefined ? forcedIsLong : targetOrEndPrice >= entryPrice;
  const targetPrice = targetOrEndPrice;

  // If explicitStop given, use it; else default 50% distance of target or 1.5% min
  let stopPrice = explicitStop;
  const targetDiff = Math.abs(targetPrice - entryPrice);
  if (stopPrice === undefined || stopPrice === null) {
    const defaultDiff = targetDiff > 0 ? targetDiff * 0.5 : entryPrice * 0.015;
    stopPrice = isLong ? entryPrice - defaultDiff : entryPrice + defaultDiff;
  }

  const stopDiff = Math.abs(entryPrice - stopPrice);
  const targetPercent = entryPrice > 0 ? ((targetPrice - entryPrice) / entryPrice) * 100 : 0;
  const stopPercent = entryPrice > 0 ? ((stopPrice - entryPrice) / entryPrice) * 100 : 0;
  const riskRewardRatio = stopDiff > 0 ? targetDiff / stopDiff : 0;

  const riskAmount =
    explicitRiskAmount !== undefined && explicitRiskAmount > 0
      ? explicitRiskAmount
      : accountSize * (riskPercent / 100);

  const quantity = stopDiff > 0 ? riskAmount / stopDiff : 0;
  const estimatedProfit = quantity * targetDiff;
  const estimatedLoss = quantity * stopDiff;

  return {
    isLong,
    entryPrice,
    targetPrice,
    stopPrice,
    targetDiff,
    stopDiff,
    riskRewardRatio,
    targetPercent,
    stopPercent,
    accountSize,
    riskPercent,
    riskAmount,
    quantity,
    estimatedProfit,
    estimatedLoss,
  };
}

export interface PositionHandle {
  type: "pos_target" | "pos_stop" | "pos_entry" | "pos_width";
  x: number;
  y: number;
  cursor: string;
}

/**
 * Returns the 4 standard TradingView adjustment handles for Long/Short positions (DEC-065).
 */
export function getPositionHandles(
  midX: number,
  rightX: number,
  yEntry: number,
  yTarget: number,
  yStop: number
): PositionHandle[] {
  return [
    { type: "pos_target", x: midX, y: yTarget, cursor: "ns-resize" },
    { type: "pos_stop", x: midX, y: yStop, cursor: "ns-resize" },
    { type: "pos_entry", x: midX, y: yEntry, cursor: "ns-resize" },
    { type: "pos_width", x: rightX, y: yEntry, cursor: "ew-resize" },
  ];
}

/**
 * Clamps the candidate entry price so it cannot cross target or stop boundaries, maintaining a safe buffer (DEC-065).
 */
export function clampPositionEntryPrice(
  candidatePrice: number,
  targetPrice: number,
  stopPrice: number,
  isLong: boolean,
  bufferRatio: number = 0.01,
  explicitMinBuffer?: number
): number {
  const minP = Math.min(targetPrice, stopPrice);
  const maxP = Math.max(targetPrice, stopPrice);
  const span = Math.abs(maxP - minP);
  const buffer =
    explicitMinBuffer !== undefined && explicitMinBuffer > 0
      ? explicitMinBuffer
      : span > 0
      ? span * bufferRatio
      : 0.01;

  if (isLong) {
    const safeMin = stopPrice + buffer;
    const safeMax = targetPrice - buffer;
    return safeMin <= safeMax
      ? Math.max(safeMin, Math.min(safeMax, candidatePrice))
      : candidatePrice;
  } else {
    const safeMin = targetPrice + buffer;
    const safeMax = stopPrice - buffer;
    return safeMin <= safeMax
      ? Math.max(safeMin, Math.min(safeMax, candidatePrice))
      : candidatePrice;
  }
}

/**
 * Clamps target price so it remains on the correct side of entry with a dynamic tick-aware buffer (DEC-100).
 */
export function clampPositionTargetPrice(
  candidatePrice: number,
  entryPrice: number,
  isLong: boolean,
  minBuffer: number = 0.000001
): number {
  const safeBuffer = Math.max(1e-8, minBuffer);
  return isLong
    ? Math.max(entryPrice + safeBuffer, candidatePrice)
    : Math.min(entryPrice - safeBuffer, candidatePrice);
}

/**
 * Clamps stop price so it remains on the correct side of entry with a dynamic tick-aware buffer (DEC-100).
 */
export function clampPositionStopPrice(
  candidatePrice: number,
  entryPrice: number,
  isLong: boolean,
  minBuffer: number = 0.000001
): number {
  const safeBuffer = Math.max(1e-8, minBuffer);
  return isLong
    ? Math.min(entryPrice - safeBuffer, candidatePrice)
    : Math.max(entryPrice + safeBuffer, candidatePrice);
}

/**
 * Snaps a price to dynamic tick size (minMove) and rounds to precision decimals (DEC-100).
 */
export function quantizePrice(
  price: number,
  minMove: number = 0.01,
  precision: number = 2
): number {
  if (minMove > 0) {
    const steps = Math.round(price / minMove);
    const quantized = steps * minMove;
    return Number(quantized.toFixed(Math.max(0, precision)));
  }
  return Number(price.toFixed(Math.max(0, precision)));
}

export interface DateRangeMetrics {
  durationMs: number;
  days: number;
  hours: number;
  minutes: number;
  barCount: number;
  formattedDuration: string;
}

/**
 * Calculates duration and bar count for Date Range measurement tool (DEC-055).
 */
export function calculateDateRangeMetrics(
  startTime: number,
  endTime: number,
  bars: CandlestickBar[]
): DateRangeMetrics {
  const minT = Math.min(startTime, endTime);
  const maxT = Math.max(startTime, endTime);
  const durationMs = maxT - minT;

  const totalMinutes = Math.floor(durationMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  let formatted = "";
  if (days > 0) formatted += `${days}d `;
  if (hours > 0 || days > 0) formatted += `${hours}h `;
  formatted += `${minutes}m`;

  let barCount = 0;
  if (bars.length > 0) {
    barCount = bars.filter((b) => b.time >= minT && b.time <= maxT).length;
  }

  return {
    durationMs,
    days,
    hours,
    minutes,
    barCount: Math.max(1, barCount),
    formattedDuration: formatted.trim() || "0m",
  };
}

export interface RulerMetrics {
  deltaPrice: number;
  deltaPercent: number;
  barCount: number;
  durationMs: number;
}

/**
 * Computes ruler telemetry (price change, percent change, bars traversed, duration).
 */
export function calculateRulerMetrics(
  startPrice: number,
  endPrice: number,
  startTime: number,
  endTime: number,
  bars: CandlestickBar[]
): RulerMetrics {
  const deltaPrice = endPrice - startPrice;
  const deltaPercent = startPrice > 0 ? (deltaPrice / startPrice) * 100 : 0;
  const durationMs = Math.abs(endTime - startTime);

  const minTime = Math.min(startTime, endTime);
  const maxTime = Math.max(startTime, endTime);
  let barCount = 0;

  if (bars.length > 0) {
    barCount = bars.filter((b) => b.time >= minTime && b.time <= maxTime).length;
  }

  return {
    deltaPrice,
    deltaPercent,
    barCount: Math.max(1, barCount),
    durationMs,
  };
}

export interface RectangleHandle {
  type:
    | "rect_tl"
    | "rect_tr"
    | "rect_bl"
    | "rect_br"
    | "rect_ml"
    | "rect_mr"
    | "rect_mt"
    | "rect_mb";
  x: number;
  y: number;
  cursor: string;
}

/**
 * Computes the 8 TradingView adjustment handles for a Rectangle (DEC-052).
 */
export function getRectangleHandles(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): RectangleHandle[] {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  return [
    { type: "rect_tl", x: left, y: top, cursor: "nwse-resize" },
    { type: "rect_tr", x: right, y: top, cursor: "nesw-resize" },
    { type: "rect_bl", x: left, y: bottom, cursor: "nesw-resize" },
    { type: "rect_br", x: right, y: bottom, cursor: "nwse-resize" },
    { type: "rect_ml", x: left, y: midY, cursor: "ew-resize" },
    { type: "rect_mr", x: right, y: midY, cursor: "ew-resize" },
    { type: "rect_mt", x: midX, y: top, cursor: "ns-resize" },
    { type: "rect_mb", x: midX, y: bottom, cursor: "ns-resize" },
  ];
}

/**
 * Snaps cursor coordinates to nearest candle High/Low/Open/Close if within threshold.
 */
export function findNearestCandlePoint(
  screenX: number,
  screenY: number,
  bars: CandlestickBar[],
  timeToScreenX: (time: number) => number | null,
  priceToScreenY: (price: number) => number | null,
  thresholdPx = 25
): { time: number; price: number; x: number; y: number } | null {
  if (bars.length === 0) return null;

  let closestDist = Infinity;
  let bestMatch: { time: number; price: number; x: number; y: number } | null = null;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const x = timeToScreenX(bar.time);
    if (x === null) continue;

    if (Math.abs(screenX - x) > thresholdPx) continue;

    const targets = [bar.high, bar.low, bar.open, bar.close];
    for (const p of targets) {
      const y = priceToScreenY(p);
      if (y === null) continue;

      const dist = Math.hypot(screenX - x, screenY - y);
      if (dist < closestDist && dist <= thresholdPx) {
        closestDist = dist;
        bestMatch = { time: bar.time, price: p, x, y };
      }
    }
  }

  return bestMatch;
}

/**
 * Checks if a point (px, py) is within maxDistance of line segment (x1, y1) -> (x2, y2).
 */
export function isPointNearSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  maxDistance = 8
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const d = Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
    return d <= maxDistance;
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const dist = Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));

  return dist <= maxDistance;
}

/**
 * Maps resolution string (e.g. "1", "5", "15", "60", "240", "1D", "D", "W") to millisecond interval.
 */
export function getResolutionMs(resolution: string): number {
  const clean = resolution.trim().toUpperCase();
  if (clean === "D" || clean === "1D") return 86_400_000;
  if (clean === "W" || clean === "1W") return 604_800_000;
  if (clean === "M" || clean === "1M") return 2_592_000_000;
  const mins = parseInt(clean, 10);
  if (!isNaN(mins) && mins > 0) {
    return mins * 60_000;
  }
  return 60_000; // default 1m
}

/**
 * Hit-test for rectangle: inside the box or within marginPx of borders.
 */
export function isPointNearRectangle(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extendRight = false,
  canvasWidth = 2000,
  marginPx = 8
): boolean {
  const left = Math.min(x1, x2);
  const right = extendRight ? canvasWidth : Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);

  return px >= left - marginPx && px <= right + marginPx && py >= top - marginPx && py <= bottom + marginPx;
}

/**
 * Hit-test for circle: checks if point is near perimeter or inside circle.
 */
export function isPointNearCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number,
  tolerance = 8
): boolean {
  const d = Math.hypot(px - cx, py - cy);
  return Math.abs(d - radius) <= tolerance || d <= radius;
}

/**
 * Hit-test for multi-point path: checks if point is within maxDistance of any path segment.
 */
export function isPointNearPath(
  px: number,
  py: number,
  points: Array<{ x: number; y: number }>,
  maxDistance = 8
): boolean {
  if (points.length < 2) return false;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (isPointNearSegment(px, py, p1.x, p1.y, p2.x, p2.y, maxDistance)) {
      return true;
    }
  }
  return false;
}

/**
 * Projects a pixel coordinate x to millisecond timestamp, supporting infinite future and past extrapolation.
 */
export function extrapolateCoordinateToTime(
  x: number,
  lastBarTime: number,
  lastBarX: number,
  barSpacingPx: number,
  intervalMs: number
): number {
  if (barSpacingPx <= 0 || intervalMs <= 0) return lastBarTime;
  const deltaBars = (x - lastBarX) / barSpacingPx;
  return Math.round(lastBarTime + deltaBars * intervalMs);
}

/**
 * Projects a millisecond timestamp to pixel coordinate x, supporting infinite future and past extrapolation.
 */
export function extrapolateTimeToCoordinate(
  timeMs: number,
  lastBarTime: number,
  lastBarX: number,
  barSpacingPx: number,
  intervalMs: number
): number {
  if (intervalMs <= 0 || barSpacingPx <= 0) return lastBarX;
  const deltaBars = (timeMs - lastBarTime) / intervalMs;
  return lastBarX + deltaBars * barSpacingPx;
}

export interface DrawingHistoryState {
  undoStack: ChartDrawing[][];
  redoStack: ChartDrawing[][];
  current: ChartDrawing[];
}

/**
 * Pushes a new drawing state snapshot onto the undo stack (capped at maxSteps) and clears the redo stack (DEC-068).
 */
export function pushDrawingHistory(
  state: DrawingHistoryState,
  nextDrawings: ChartDrawing[],
  maxSteps: number = 50
): DrawingHistoryState {
  if (JSON.stringify(state.current) === JSON.stringify(nextDrawings)) {
    return state;
  }
  const newUndo = [...state.undoStack, state.current];
  if (newUndo.length > maxSteps) {
    newUndo.shift();
  }
  return {
    undoStack: newUndo,
    redoStack: [],
    current: nextDrawings,
  };
}

/**
 * Reverts to the most recent snapshot on the undo stack and pushes the current state onto the redo stack (DEC-068).
 */
export function performDrawingUndo(state: DrawingHistoryState): DrawingHistoryState {
  if (state.undoStack.length === 0) return state;
  const newUndo = [...state.undoStack];
  const previous = newUndo.pop()!;
  return {
    undoStack: newUndo,
    redoStack: [...state.redoStack, state.current],
    current: previous,
  };
}

/**
 * Restores the next snapshot from the redo stack and pushes the current state onto the undo stack (DEC-068).
 */
export function performDrawingRedo(state: DrawingHistoryState): DrawingHistoryState {
  if (state.redoStack.length === 0) return state;
  const newRedo = [...state.redoStack];
  const next = newRedo.pop()!;
  return {
    undoStack: [...state.undoStack, state.current],
    redoStack: newRedo,
    current: next,
  };
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  trendline: "Trendline",
  horizontal_line: "Horizontal Line",
  vertical_line: "Vertical Line",
  rectangle: "Rectangle",
  circle: "Circle",
  path: "Path",
  brush: "Brush",
  text: "Text Note",
  fibonacci: "Fib Retracement",
  trend_fib: "Trend-Based Fib",
  gann_box: "Gann Box",
  long_position: "Long Position",
  short_position: "Short Position",
  date_range: "Date Range",
  ruler: "Price Range",
};

/**
 * Generates a human-readable TradingView Object Tree label for a drawing (DEC-070).
 * Uses `drawing.name` if customized, otherwise formats tool type + key price coordinates.
 */
export function formatDrawingObjectLabel(drawing: ChartDrawing): string {
  if (drawing.name && drawing.name.trim().length > 0) {
    return drawing.name.trim();
  }
  const typeLabel = TOOL_DISPLAY_NAMES[drawing.type] || drawing.type;
  const fmt = (p: number) => (p >= 1 ? p.toFixed(2) : p.toFixed(4));

  if (drawing.type === "horizontal_line") {
    return `${typeLabel} · $${fmt(drawing.startPrice)}`;
  }
  if (drawing.type === "vertical_line") {
    return `${typeLabel}`;
  }
  if (drawing.type === "text" && drawing.text) {
    return `Text · "${drawing.text.slice(0, 16)}"`;
  }
  if (drawing.type === "rectangle") {
    const low = Math.min(drawing.startPrice, drawing.endPrice);
    const high = Math.max(drawing.startPrice, drawing.endPrice);
    return `${typeLabel} · $${fmt(low)} - $${fmt(high)}`;
  }
  if (drawing.type === "long_position" || drawing.type === "short_position") {
    return `${typeLabel} @ $${fmt(drawing.startPrice)}`;
  }
  return `${typeLabel} · $${fmt(drawing.startPrice)}`;
}

/**
 * Clones a drawing with a new unique ID and slight coordinate offset so the duplicate is immediately visible (DEC-070).
 */
export function cloneDrawingObject(
  drawing: ChartDrawing,
  timeOffsetMs: number = 900_000,
  priceOffsetRatio: number = 0.0025,
  nowMs: number = Date.now()
): ChartDrawing {
  const basePrice = Math.abs(drawing.startPrice) > 0 ? drawing.startPrice : 100;
  const deltaP = basePrice * priceOffsetRatio;

  const cloned: ChartDrawing = {
    ...JSON.parse(JSON.stringify(drawing)),
    id: `drawing_${nowMs}_${Math.random().toString(36).substring(2, 7)}`,
    startTime: drawing.startTime + timeOffsetMs,
    endTime: drawing.endTime + timeOffsetMs,
    startPrice: drawing.startPrice + deltaP,
    endPrice: drawing.endPrice + deltaP,
    isLocked: false,
    name: drawing.name ? `${drawing.name} (Copy)` : undefined,
  };

  if (typeof drawing.targetPrice === "number") {
    cloned.targetPrice = drawing.targetPrice + deltaP;
  }
  if (typeof drawing.stopPrice === "number") {
    cloned.stopPrice = drawing.stopPrice + deltaP;
  }
  if (Array.isArray(drawing.points)) {
    cloned.points = drawing.points.map((pt) => ({
      time: pt.time + timeOffsetMs,
      price: pt.price + deltaP,
    }));
  }

  return cloned;
}

/**
 * Reorders a drawing's Z-order position within the canvas render list (DEC-070).
 * - "forward" moves the item toward the end of the array (rendered on top).
 * - "backward" moves the item toward index 0 (rendered behind).
 */
export function reorderDrawingLayer(
  drawings: ChartDrawing[],
  drawingId: string,
  direction: "forward" | "backward"
): ChartDrawing[] {
  const idx = drawings.findIndex((d) => d.id === drawingId);
  if (idx === -1) return drawings;

  const targetIdx = direction === "forward" ? idx + 1 : idx - 1;
  if (targetIdx < 0 || targetIdx >= drawings.length) return drawings;

  const next = [...drawings];
  const [item] = next.splice(idx, 1);
  next.splice(targetIdx, 0, item);
  return next;
}



/**
 * Angle and Axis Snapping Helpers for Shift-Key Drawing Workflows (DEC-116)
 * Emulates TradingView behavior:
 * - Line tools (trendline, fibonacci, date_range) snap to 45° increments (0°, 45°, 90°, 135°, 180°, etc.)
 * - Boxes and geometric shapes snap to 1:1 square aspect ratio
 * - Translation/moving locks to single axis (purely horizontal or purely vertical)
 */
export interface ShiftSnapResult {
  x: number;
  y: number;
  time: number;
  price: number;
}

export function calculateShiftAngleSnap(
  currentX: number,
  currentY: number,
  anchorX: number | null | undefined,
  anchorY: number | null | undefined,
  anchorTime: number,
  anchorPrice: number,
  coordinateToTime: (x: number) => number | null,
  coordinateToPrice: (y: number) => number | null
): ShiftSnapResult {
  if (anchorX === null || anchorX === undefined || anchorY === null || anchorY === undefined) {
    return {
      x: currentX,
      y: currentY,
      time: coordinateToTime(currentX) ?? anchorTime,
      price: coordinateToPrice(currentY) ?? anchorPrice,
    };
  }
  const dx = currentX - anchorX;
  const dy = currentY - anchorY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 3) {
    return {
      x: currentX,
      y: currentY,
      time: coordinateToTime(currentX) ?? anchorTime,
      price: coordinateToPrice(currentY) ?? anchorPrice,
    };
  }

  const angle = Math.atan2(dy, dx);
  const snapStep = Math.PI / 4; // 45 degrees
  const snappedAngle = Math.round(angle / snapStep) * snapStep;

  // Exact cardinal checks to prevent floating point inaccuracy
  const isHorizontal = Math.abs(Math.sin(snappedAngle)) < 1e-6;
  const isVertical = Math.abs(Math.cos(snappedAngle)) < 1e-6;

  let snappedX = anchorX + dist * Math.cos(snappedAngle);
  let snappedY = anchorY + dist * Math.sin(snappedAngle);

  let time: number;
  let price: number;

  if (isHorizontal) {
    snappedY = anchorY;
    price = anchorPrice;
    time = coordinateToTime(snappedX) ?? anchorTime;
  } else if (isVertical) {
    snappedX = anchorX;
    time = anchorTime;
    price = coordinateToPrice(snappedY) ?? anchorPrice;
  } else {
    time = coordinateToTime(snappedX) ?? anchorTime;
    price = coordinateToPrice(snappedY) ?? anchorPrice;
  }

  return { x: snappedX, y: snappedY, time, price };
}

export function calculateShiftSquareSnap(
  currentX: number,
  currentY: number,
  anchorX: number | null | undefined,
  anchorY: number | null | undefined,
  anchorTime: number,
  anchorPrice: number,
  coordinateToTime: (x: number) => number | null,
  coordinateToPrice: (y: number) => number | null
): ShiftSnapResult {
  if (anchorX === null || anchorX === undefined || anchorY === null || anchorY === undefined) {
    return {
      x: currentX,
      y: currentY,
      time: coordinateToTime(currentX) ?? anchorTime,
      price: coordinateToPrice(currentY) ?? anchorPrice,
    };
  }
  const dx = currentX - anchorX;
  const dy = currentY - anchorY;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  const signX = dx >= 0 ? 1 : -1;
  const signY = dy >= 0 ? 1 : -1;
  const snappedX = anchorX + size * signX;
  const snappedY = anchorY + size * signY;

  return {
    x: snappedX,
    y: snappedY,
    time: coordinateToTime(snappedX) ?? anchorTime,
    price: coordinateToPrice(snappedY) ?? anchorPrice,
  };
}

export function calculateShiftAxisLock(
  currentX: number,
  currentY: number,
  startX: number,
  startY: number,
  deltaTime: number,
  deltaPrice: number
): { deltaTime: number; deltaPrice: number } {
  const screenDx = Math.abs(currentX - startX);
  const screenDy = Math.abs(currentY - startY);
  if (screenDx >= screenDy) {
    // Horizontal movement: lock price delta to 0
    return { deltaTime, deltaPrice: 0 };
  } else {
    // Vertical movement: lock time delta to 0
    return { deltaTime: 0, deltaPrice };
  }
}
