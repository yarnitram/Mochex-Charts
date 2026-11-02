import { describe, it, expect } from "vitest";
import {
  calculateFibLevels,
  calculateTrendFibLevels,
  calculateGannBoxLevels,
  calculatePositionMetrics,
  getPositionHandles,
  clampPositionEntryPrice,
  clampPositionTargetPrice,
  clampPositionStopPrice,
  quantizePrice,
  calculateDateRangeMetrics,
  calculateRulerMetrics,
  getRectangleHandles,
  isPointNearCircle,
  isPointNearSegment,
  findNearestCandlePoint,
  getResolutionMs,
  isPointNearRectangle,
  isPointNearPath,
  extrapolateCoordinateToTime,
  extrapolateTimeToCoordinate,
  pushDrawingHistory,
  performDrawingUndo,
  performDrawingRedo,
  formatDrawingObjectLabel,
  cloneDrawingObject,
  reorderDrawingLayer,
  calculateShiftAngleSnap,
  calculateShiftSquareSnap,
  calculateShiftAxisLock,
  ChartDrawing,
  DrawingHistoryState,
  DEFAULT_FIB_LEVELS,
} from "@/lib/chart/drawing-math";
import { CandlestickBar } from "@/lib/mexc/types";

describe("Geometric Drawing Math Engine (DEC-040 to DEC-055)", () => {
  it("should calculate Fibonacci Retracement levels correctly", () => {
    const startPrice = 100;
    const endPrice = 200;
    const levels = calculateFibLevels(startPrice, endPrice);

    expect(levels.length).toBeGreaterThanOrEqual(7);
    // 0.0 is at 200 (endPrice)
    const lvl0 = levels.find((l) => l.ratio === 0.0);
    expect(lvl0?.price).toBe(200);

    // 0.5 is at 150
    const lvl05 = levels.find((l) => l.ratio === 0.5);
    expect(lvl05?.price).toBe(150);

    // 1.0 is at 100 (startPrice)
    const lvl1 = levels.find((l) => l.ratio === 1.0);
    expect(lvl1?.price).toBe(100);

    // 0.618 golden ratio
    const lvl618 = levels.find((l) => l.ratio === 0.618);
    expect(lvl618?.price).toBeCloseTo(138.2, 1);
  });

  it("should calculate custom Fibonacci Retracement levels when provided (DEC-050)", () => {
    const customLevels = [
      { ratio: 0.618, color: "#00d8ff", enabled: true },
      { ratio: 0.705, color: "#f5ac37", enabled: true }, // OTE level
      { ratio: 0.786, color: "#9353d3", enabled: false }, // disabled
    ];
    const levels = calculateFibLevels(100, 200, customLevels);
    expect(levels.length).toBe(2);
    expect(levels.some((l) => l.ratio === 0.705)).toBe(true);
    expect(levels.some((l) => l.ratio === 0.786)).toBe(false);
  });

  it("should calculate 3-Point Trend-Based Fibonacci Extension levels (DEC-055)", () => {
    // P1 (wave 1 start) = 100, P2 (wave 1 peak) = 150, P3 (wave 2 pullback) = 130
    // Wave 1 delta = 50. Extension from P3 (130):
    // Ratio 1.0 = 130 + 50 * 1.0 = 180
    // Ratio 1.618 = 130 + 50 * 1.618 = 210.9
    const extLevels = calculateTrendFibLevels(100, 150, 130);
    const lvl1 = extLevels.find((l) => l.ratio === 1.0);
    expect(lvl1?.price).toBe(180);

    const lvl1618 = extLevels.find((l) => l.ratio === 1.618);
    expect(lvl1618?.price).toBeCloseTo(210.9, 1);
  });

  it("should calculate 7x7 matrix grid levels for Gann Box (DEC-055)", () => {
    const { priceLevels, timeLevels } = calculateGannBoxLevels(100, 200, 1000, 2000);
    expect(priceLevels.length).toBe(7);
    expect(timeLevels.length).toBe(7);

    // Midpoint ratio 0.5
    const midPrice = priceLevels.find((p) => p.ratio === 0.5);
    expect(midPrice?.price).toBe(150);

    const midTime = timeLevels.find((t) => t.ratio === 0.5);
    expect(midTime?.time).toBe(1500);
  });

  it("should calculate Long and Short Position Metrics with accurate Risk/Reward (DEC-054)", () => {
    // Long trade: start 100, target 120 (+20%)
    const longPos = calculatePositionMetrics(100, 120);
    expect(longPos.isLong).toBe(true);
    expect(longPos.entryPrice).toBe(100);
    expect(longPos.targetPrice).toBe(120);
    expect(longPos.targetPercent).toBe(20);
    expect(longPos.stopPrice).toBe(90); // 50% stop default
    expect(longPos.riskRewardRatio).toBe(2.0);
    expect(longPos.targetDiff).toBe(20);
    expect(longPos.stopDiff).toBe(10);
    expect(longPos.riskAmount).toBe(100); // 1% of 10,000
    expect(longPos.quantity).toBe(10); // 100 / 10
    expect(longPos.estimatedProfit).toBe(200); // 10 * 20
    expect(longPos.estimatedLoss).toBe(100);

    // Short trade: start 100, target 80 (-20%)
    const shortPos = calculatePositionMetrics(100, 80);
    expect(shortPos.isLong).toBe(false);
    expect(shortPos.entryPrice).toBe(100);
    expect(shortPos.targetPrice).toBe(80);
    expect(shortPos.stopPrice).toBe(110);
    expect(shortPos.riskRewardRatio).toBe(2.0);
    expect(shortPos.targetDiff).toBe(20);
    expect(shortPos.stopDiff).toBe(10);
    expect(shortPos.quantity).toBe(10);
    expect(shortPos.estimatedProfit).toBe(200);
    expect(shortPos.estimatedLoss).toBe(100);
  });

  it("should provide 4 standard TradingView adjustment handles for position tools (DEC-065)", () => {
    const handles = getPositionHandles(150, 200, 100, 120, 90);
    expect(handles.length).toBe(4);

    const targetH = handles.find((h) => h.type === "pos_target");
    expect(targetH?.x).toBe(150);
    expect(targetH?.y).toBe(120);
    expect(targetH?.cursor).toBe("ns-resize");

    const stopH = handles.find((h) => h.type === "pos_stop");
    expect(stopH?.x).toBe(150);
    expect(stopH?.y).toBe(90);
    expect(stopH?.cursor).toBe("ns-resize");

    const entryH = handles.find((h) => h.type === "pos_entry");
    expect(entryH?.x).toBe(150);
    expect(entryH?.y).toBe(100);
    expect(entryH?.cursor).toBe("ns-resize");

    const widthH = handles.find((h) => h.type === "pos_width");
    expect(widthH?.x).toBe(200);
    expect(widthH?.y).toBe(100);
    expect(widthH?.cursor).toBe("ew-resize");
  });

  it("should clamp position entry price to prevent crossing target/stop boundaries (DEC-065)", () => {
    // Long trade: target 120, stop 90 (span = 30, buffer 1% = 0.3)
    // Within safe range: 105 remains 105
    expect(clampPositionEntryPrice(105, 120, 90, true)).toBe(105);
    // Dragged above target: clamped to safeMax (120 - 0.3 = 119.7)
    expect(clampPositionEntryPrice(125, 120, 90, true)).toBeCloseTo(119.7, 1);
    // Dragged below stop: clamped to safeMin (90 + 0.3 = 90.3)
    expect(clampPositionEntryPrice(80, 120, 90, true)).toBeCloseTo(90.3, 1);

    // Short trade: target 80, stop 110 (span = 30, buffer 1% = 0.3)
    // Within safe range: 100 remains 100
    expect(clampPositionEntryPrice(100, 80, 110, false)).toBe(100);
    // Dragged above stop: clamped to safeMax (110 - 0.3 = 109.7)
    expect(clampPositionEntryPrice(115, 80, 110, false)).toBeCloseTo(109.7, 1);
    // Dragged below target: clamped to safeMin (80 + 0.3 = 80.3)
    expect(clampPositionEntryPrice(75, 80, 110, false)).toBeCloseTo(80.3, 1);
  });

  it("should calculate Date Range measurement duration and bars (DEC-055)", () => {
    const bars: CandlestickBar[] = [
      { time: 1000, open: 100, high: 105, low: 95, close: 102, volume: 10 },
      { time: 61000, open: 102, high: 108, low: 101, close: 106, volume: 15 },
      { time: 121000, open: 106, high: 112, low: 104, close: 110, volume: 20 },
    ];
    const range = calculateDateRangeMetrics(1000, 121000, bars);
    expect(range.durationMs).toBe(120000);
    expect(range.minutes).toBe(2);
    expect(range.barCount).toBe(3);
  });

  it("should generate 8 adjustment handles for Rectangle (DEC-052)", () => {
    const handles = getRectangleHandles(100, 200, 300, 400);
    expect(handles.length).toBe(8);

    const midLeft = handles.find((h) => h.type === "rect_ml");
    expect(midLeft?.x).toBe(100);
    expect(midLeft?.y).toBe(300); // (200 + 400) / 2
    expect(midLeft?.cursor).toBe("ew-resize");

    const midRight = handles.find((h) => h.type === "rect_mr");
    expect(midRight?.x).toBe(300);
    expect(midRight?.y).toBe(300);
    expect(midRight?.cursor).toBe("ew-resize");

    const midTop = handles.find((h) => h.type === "rect_mt");
    expect(midTop?.x).toBe(200); // (100 + 300) / 2
    expect(midTop?.y).toBe(200);
    expect(midTop?.cursor).toBe("ns-resize");
  });

  it("should hit-test circles with perimeter tolerance (DEC-055)", () => {
    // Circle at center (100, 100) with radius 50
    expect(isPointNearCircle(150, 100, 100, 100, 50, 5)).toBe(true); // on perimeter
    expect(isPointNearCircle(100, 100, 100, 100, 50, 5)).toBe(true); // inside
    expect(isPointNearCircle(180, 100, 100, 100, 50, 5)).toBe(false); // far outside
  });

  it("should calculate Ruler measurement metrics across bars", () => {
    const bars: CandlestickBar[] = [
      { time: 1000, open: 100, high: 105, low: 95, close: 102, volume: 10 },
      { time: 2000, open: 102, high: 108, low: 101, close: 106, volume: 15 },
      { time: 3000, open: 106, high: 112, low: 104, close: 110, volume: 20 },
      { time: 4000, open: 110, high: 115, low: 108, close: 114, volume: 25 },
    ];

    const ruler = calculateRulerMetrics(100, 114, 1000, 4000, bars);
    expect(ruler.deltaPrice).toBe(14);
    expect(ruler.deltaPercent).toBeCloseTo(14, 1);
    expect(ruler.barCount).toBe(4);
    expect(ruler.durationMs).toBe(3000);
  });

  it("should detect point near line segment for hit testing", () => {
    expect(isPointNearSegment(50, 50, 0, 0, 100, 100, 5)).toBe(true);
    expect(isPointNearSegment(50, 52, 0, 0, 100, 100, 5)).toBe(true);
    expect(isPointNearSegment(50, 60, 0, 0, 100, 100, 5)).toBe(false);
    expect(isPointNearSegment(110, 110, 0, 0, 100, 100, 5)).toBe(false);
  });

  it("should snap to nearest candle OHLC with smart magnet", () => {
    const bars: CandlestickBar[] = [
      { time: 1000, open: 100, high: 110, low: 90, close: 105, volume: 50 },
    ];

    const timeToCoord = (t: number) => (t === 1000 ? 50 : null);
    const priceToCoord = (p: number) => 500 - p;

    const snapped = findNearestCandlePoint(52, 392, bars, timeToCoord, priceToCoord, 20);
    expect(snapped).not.toBeNull();
    expect(snapped?.time).toBe(1000);
    expect(snapped?.price).toBe(110);
  });

  it("should parse resolution strings into accurate millisecond intervals (DEC-045)", () => {
    expect(getResolutionMs("1")).toBe(60_000);
    expect(getResolutionMs("5")).toBe(300_000);
    expect(getResolutionMs("15")).toBe(900_000);
    expect(getResolutionMs("60")).toBe(3_600_000);
    expect(getResolutionMs("240")).toBe(14_400_000);
    expect(getResolutionMs("D")).toBe(86_400_000);
    expect(getResolutionMs("1D")).toBe(86_400_000);
    expect(getResolutionMs("W")).toBe(604_800_000);
  });

  it("should extrapolate coordinates to future and past times smoothly (DEC-045)", () => {
    const lastBarTime = 1_700_000_000_000;
    const lastBarX = 500;
    const barSpacingPx = 10;
    const intervalMs = 60_000;

    const futureTime = extrapolateCoordinateToTime(550, lastBarTime, lastBarX, barSpacingPx, intervalMs);
    expect(futureTime).toBe(lastBarTime + 5 * 60_000);

    const futureX = extrapolateTimeToCoordinate(futureTime, lastBarTime, lastBarX, barSpacingPx, intervalMs);
    expect(futureX).toBe(550);

    const pastTime = extrapolateCoordinateToTime(400, lastBarTime, lastBarX, barSpacingPx, intervalMs);
    expect(pastTime).toBe(lastBarTime - 10 * 60_000);

    const pastX = extrapolateTimeToCoordinate(pastTime, lastBarTime, lastBarX, barSpacingPx, intervalMs);
    expect(pastX).toBe(400);
  });

  it("should hit-test rectangles including extended order blocks (DEC-046)", () => {
    expect(isPointNearRectangle(200, 150, 100, 100, 300, 200, false, 1000)).toBe(true);
    expect(isPointNearRectangle(95, 100, 100, 100, 300, 200, false, 1000)).toBe(true);
    expect(isPointNearRectangle(350, 150, 100, 100, 300, 200, false, 1000)).toBe(false);

    expect(isPointNearRectangle(500, 150, 100, 100, 300, 200, true, 1000)).toBe(true);
    expect(isPointNearRectangle(900, 150, 100, 100, 300, 200, true, 1000)).toBe(true);
    expect(isPointNearRectangle(500, 250, 100, 100, 300, 200, true, 1000)).toBe(false);
  });

  it("should hit-test multi-point paths across connected segments (DEC-047)", () => {
    const pathNodes = [
      { x: 10, y: 10 },
      { x: 50, y: 50 },
      { x: 100, y: 20 },
      { x: 150, y: 80 },
    ];

    expect(isPointNearPath(30, 30, pathNodes, 5)).toBe(true);
    expect(isPointNearPath(125, 50, pathNodes, 5)).toBe(true);
    expect(isPointNearPath(30, 90, pathNodes, 5)).toBe(false);
  });

  it("should calculate custom Gann Box price and time levels with filtering (DEC-059)", () => {
    const customPrice = [
      { ratio: 0.0, color: "#fff", enabled: true },
      { ratio: 0.5, color: "#00d8ff", enabled: true },
      { ratio: 1.0, color: "#fff", enabled: true },
    ];
    const customTime = [
      { ratio: 0.0, color: "#fff", enabled: true },
      { ratio: 0.5, color: "#00d8ff", enabled: true },
      { ratio: 0.75, color: "#f5ac37", enabled: false }, // disabled
      { ratio: 1.0, color: "#fff", enabled: true },
    ];

    const { priceLevels, timeLevels } = calculateGannBoxLevels(100, 200, 1000, 2000, customPrice, customTime);
    expect(priceLevels.length).toBe(3);
    expect(timeLevels.length).toBe(3); // 0.75 was disabled
    expect(timeLevels.some((t) => t.ratio === 0.75)).toBe(false);
  });

  it("should return stable rectangle handles with correct types (DEC-052, DEC-062)", () => {
    const handles = getRectangleHandles(50, 50, 150, 150);
    const types = handles.map((h) => h.type);
    expect(types).toContain("rect_tl");
    expect(types).toContain("rect_tr");
    expect(types).toContain("rect_bl");
    expect(types).toContain("rect_br");
    expect(types).toContain("rect_ml");
    expect(types).toContain("rect_mr");
    expect(types).toContain("rect_mt");
    expect(types).toContain("rect_mb");
  });

  it("should manage Undo and Redo history stacks accurately with max step capping (DEC-068)", () => {
    const d1: ChartDrawing = {
      id: "d1",
      type: "trendline",
      startTime: 1000,
      startPrice: 100,
      endTime: 2000,
      endPrice: 120,
    };
    const d2: ChartDrawing = {
      id: "d2",
      type: "rectangle",
      startTime: 3000,
      startPrice: 130,
      endTime: 4000,
      endPrice: 150,
    };

    let state: DrawingHistoryState = {
      undoStack: [],
      redoStack: [],
      current: [],
    };

    // Push first drawing
    state = pushDrawingHistory(state, [d1]);
    expect(state.undoStack.length).toBe(1);
    expect(state.redoStack.length).toBe(0);
    expect(state.current).toEqual([d1]);

    // Pushing identical state should be ignored
    state = pushDrawingHistory(state, [d1]);
    expect(state.undoStack.length).toBe(1);

    // Push second drawing
    state = pushDrawingHistory(state, [d1, d2]);
    expect(state.undoStack.length).toBe(2);
    expect(state.current).toEqual([d1, d2]);

    // Undo once -> back to [d1]
    state = performDrawingUndo(state);
    expect(state.current).toEqual([d1]);
    expect(state.undoStack.length).toBe(1);
    expect(state.redoStack.length).toBe(1);

    // Undo again -> back to []
    state = performDrawingUndo(state);
    expect(state.current).toEqual([]);
    expect(state.undoStack.length).toBe(0);
    expect(state.redoStack.length).toBe(2);

    // Undo when empty -> no-op
    state = performDrawingUndo(state);
    expect(state.current).toEqual([]);

    // Redo once -> restores [d1]
    state = performDrawingRedo(state);
    expect(state.current).toEqual([d1]);
    expect(state.undoStack.length).toBe(1);
    expect(state.redoStack.length).toBe(1);

    // Pushing a new change clears redoStack
    const d1Modified = { ...d1, endPrice: 140 };
    state = pushDrawingHistory(state, [d1Modified]);
    expect(state.redoStack.length).toBe(0);
    expect(state.undoStack.length).toBe(2);

    // Verify max step capping (e.g., maxSteps = 3)
    let cappedState: DrawingHistoryState = { undoStack: [], redoStack: [], current: [] };
    for (let i = 1; i <= 5; i++) {
      cappedState = pushDrawingHistory(
        cappedState,
        [{ ...d1, id: `d_${i}`, startPrice: i * 10 }],
        3
      );
    }
    expect(cappedState.undoStack.length).toBe(3);
  });

  it("should format Object Tree labels, clone drawings with offset, and reorder Z-layers (DEC-070)", () => {
    const rect: ChartDrawing = {
      id: "rect_1",
      type: "rectangle",
      startTime: 1000,
      endTime: 2000,
      startPrice: 69000,
      endPrice: 68000,
      color: "#2962ff",
    };

    expect(formatDrawingObjectLabel(rect)).toBe("Rectangle · $68000.00 - $69000.00");
    expect(formatDrawingObjectLabel({ ...rect, name: "Weekly Supply Zone" })).toBe(
      "Weekly Supply Zone"
    );

    const cloned = cloneDrawingObject(rect, 500, 0.01, 999999);
    expect(cloned.id).not.toBe(rect.id);
    expect(cloned.startTime).toBe(1500);
    expect(cloned.endTime).toBe(2500);
    expect(cloned.startPrice).toBeCloseTo(69690, 2);
    expect(cloned.endPrice).toBeCloseTo(68690, 2);

    const d2: ChartDrawing = { ...rect, id: "rect_2" };
    const d3: ChartDrawing = { ...rect, id: "rect_3" };
    const reorderedForward = reorderDrawingLayer([rect, d2, d3], "rect_1", "forward");
    expect(reorderedForward.map((d) => d.id)).toEqual(["rect_2", "rect_1", "rect_3"]);

    const reorderedBackward = reorderDrawingLayer(reorderedForward, "rect_1", "backward");
    expect(reorderedBackward.map((d) => d.id)).toEqual(["rect_1", "rect_2", "rect_3"]);
  });

  it("should update Fibonacci and Gann levels cleanly without mutating original array (DEC-090)", () => {
    const originalLevels = [...DEFAULT_FIB_LEVELS];
    const updatedRatio = 0.65;
    const modifiedLevels = originalLevels.map((lvl, idx) =>
      idx === 1 ? { ...lvl, ratio: updatedRatio } : lvl
    );

    expect(modifiedLevels[1].ratio).toBe(0.65);
    expect(originalLevels[1].ratio).not.toBe(0.65);
    expect(modifiedLevels.length).toBe(originalLevels.length);

    // Verify calculated levels with the updated ratio
    const calculated = calculateFibLevels(100, 200, modifiedLevels);
    const customLvl = calculated.find((l) => l.ratio === 0.65);
    expect(customLvl).toBeDefined();
    expect(customLvl?.price).toBe(135);
  });

  it("should clamp position target and stop prices with dynamic tick-aware buffer (DEC-100)", () => {
    // 1. High-value asset (BTC, tick minMove = 0.01)
    const btcEntry = 68000;
    // Long target dragging down towards entry: clamps to entry + minBuffer
    expect(clampPositionTargetPrice(68000.005, btcEntry, true, 0.01)).toBeCloseTo(68000.01, 2);
    // Long target dragging above entry: freely allows higher target
    expect(clampPositionTargetPrice(69500, btcEntry, true, 0.01)).toBe(69500);

    // Long stop dragging up towards entry: clamps to entry - minBuffer
    expect(clampPositionStopPrice(67999.995, btcEntry, true, 0.01)).toBeCloseTo(67999.99, 2);
    // Long stop dragging below entry: freely allows lower stop
    expect(clampPositionStopPrice(66500, btcEntry, true, 0.01)).toBe(66500);

    // Short target dragging up towards entry: clamps to entry - minBuffer
    expect(clampPositionTargetPrice(68000.005, btcEntry, false, 0.01)).toBeCloseTo(67999.99, 2);
    // Short stop dragging down towards entry: clamps to entry + minBuffer
    expect(clampPositionStopPrice(67999.995, btcEntry, false, 0.01)).toBeCloseTo(68000.01, 2);

    // 2. Micro-cent / sub-dollar asset (PEPE, entry = 0.0000095, tick minMove = 0.0000001)
    const pepeEntry = 0.0000095;
    const pepeMinBuffer = 0.0000001;

    // Long target dragging down towards entry clamps to 0.0000096, NOT locking up with 0.01
    expect(clampPositionTargetPrice(0.00000951, pepeEntry, true, pepeMinBuffer)).toBeCloseTo(0.0000096, 7);
    // Long stop dragging up towards entry clamps to 0.0000094, NOT going negative
    expect(clampPositionStopPrice(0.00000949, pepeEntry, true, pepeMinBuffer)).toBeCloseTo(0.0000094, 7);
  });

  it("should snap position prices to dynamic tick size and precision (DEC-100)", () => {
    // BTC: minMove 0.01, precision 2
    expect(quantizePrice(68123.4567, 0.01, 2)).toBe(68123.46);
    expect(quantizePrice(68123.451, 0.01, 2)).toBe(68123.45);

    // Mid asset (XRP/ADA): minMove 0.0001, precision 4
    expect(quantizePrice(0.54326, 0.0001, 4)).toBe(0.5433);

    // Micro asset (PEPE): minMove 0.0000001, precision 7
    expect(quantizePrice(0.00000956, 0.0000001, 7)).toBe(0.0000096);
  });

  it("should support explicitMinBuffer in clampPositionEntryPrice (DEC-100)", () => {
    const pepeEntry = 0.0000095;
    const target = 0.0000115;
    const stop = 0.0000085;
    const minBuffer = 0.0000001;

    // Drag entry above target: clamped to target - minBuffer
    expect(clampPositionEntryPrice(0.000012, target, stop, true, 0.01, minBuffer)).toBeCloseTo(0.0000114, 7);
    // Drag entry below stop: clamped to stop + minBuffer
    expect(clampPositionEntryPrice(0.000008, target, stop, true, 0.01, minBuffer)).toBeCloseTo(0.0000086, 7);
  });

  it("should snap angles to 45-degree increments when holding Shift (DEC-116)", () => {
    const mockCoordToTime = (x: number) => 1000 + x * 10;
    const mockCoordToPrice = (y: number) => 100 - y * 0.5;

    const anchorX = 100;
    const anchorY = 100;
    const anchorTime = 2000;
    const anchorPrice = 50;

    // 1. Horizontal snap (e.g. angle ~5 degrees -> snaps to 0 deg)
    // dy = 4, dx = 100
    const horizSnap = calculateShiftAngleSnap(
      anchorX + 100,
      anchorY + 4,
      anchorX,
      anchorY,
      anchorTime,
      anchorPrice,
      mockCoordToTime,
      mockCoordToPrice
    );
    expect(horizSnap.y).toBe(anchorY);
    expect(horizSnap.price).toBe(anchorPrice); // Perfect horizontal price line

    // 2. Vertical snap (e.g. angle ~85 degrees -> snaps to 90 deg)
    // dy = 100, dx = 5
    const vertSnap = calculateShiftAngleSnap(
      anchorX + 5,
      anchorY + 100,
      anchorX,
      anchorY,
      anchorTime,
      anchorPrice,
      mockCoordToTime,
      mockCoordToPrice
    );
    expect(vertSnap.x).toBe(anchorX);
    expect(vertSnap.time).toBe(anchorTime); // Perfect vertical time line

    // 3. 45-degree diagonal snap (e.g. angle ~42 degrees -> snaps to 45 deg)
    const diagSnap = calculateShiftAngleSnap(
      anchorX + 100,
      anchorY + 85,
      anchorX,
      anchorY,
      anchorTime,
      anchorPrice,
      mockCoordToTime,
      mockCoordToPrice
    );
    // In 45-deg snap, |dx| === |dy|
    expect(Math.abs(diagSnap.x - anchorX)).toBeCloseTo(Math.abs(diagSnap.y - anchorY), 2);
  });

  it("should snap rectangle to 1:1 square aspect ratio when holding Shift (DEC-116)", () => {
    const mockCoordToTime = (x: number) => 1000 + x * 10;
    const mockCoordToPrice = (y: number) => 100 - y * 0.5;

    const anchorX = 50;
    const anchorY = 50;
    const anchorTime = 1500;
    const anchorPrice = 75;

    // Moving mouse to (150, 100) -> dx = 100, dy = 50 -> size = 100
    const squareSnap = calculateShiftSquareSnap(
      150,
      100,
      anchorX,
      anchorY,
      anchorTime,
      anchorPrice,
      mockCoordToTime,
      mockCoordToPrice
    );
    expect(Math.abs(squareSnap.x - anchorX)).toBe(100);
    expect(Math.abs(squareSnap.y - anchorY)).toBe(100);
  });

  it("should lock translation movement to a single axis when holding Shift (DEC-116)", () => {
    // 1. Moving predominantly horizontally (screenDx 80 >= screenDy 20)
    const horizLock = calculateShiftAxisLock(180, 120, 100, 100, 5000, 25);
    expect(horizLock.deltaTime).toBe(5000);
    expect(horizLock.deltaPrice).toBe(0); // Price locked

    // 2. Moving predominantly vertically (screenDy 90 > screenDx 15)
    const vertLock = calculateShiftAxisLock(115, 190, 100, 100, 5000, 45);
    expect(vertLock.deltaTime).toBe(0); // Time locked
    expect(vertLock.deltaPrice).toBe(45);
  });
});
