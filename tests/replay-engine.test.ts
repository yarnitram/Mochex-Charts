import { describe, it, expect, beforeEach } from "vitest";
import { BarReplayEngine, getIntrabarPricePath } from "@/lib/replay/replay-engine";
import { Bar } from "@/types/tradingview";

describe("BarReplayEngine State Machine, Scissor-Cut & Intrabar Path (DEC-073)", () => {
  let engine: BarReplayEngine;
  const mockBars: Bar[] = [
    { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: 2000, open: 11, high: 13, low: 10, close: 12, volume: 110 },
    { time: 3000, open: 12, high: 14, low: 11, close: 13, volume: 120 },
    { time: 4000, open: 13, high: 15, low: 12, close: 14, volume: 130 },
    { time: 5000, open: 14, high: 16, low: 13, close: 15, volume: 140 },
  ];

  beforeEach(() => {
    engine = new BarReplayEngine();
    engine.loadHistory(mockBars);
  });

  it("should initialize in IDLE state with all bars visible", () => {
    expect(engine.getState()).toBe("IDLE");
    expect(engine.getTotalBars()).toBe(5);
    expect(engine.getVisibleBars().length).toBe(5);
  });

  it("should transition to SELECTING state", () => {
    engine.startSelecting();
    expect(engine.getState()).toBe("SELECTING");
  });

  it("should set historical cutoff timestamp and enter PAUSED state", () => {
    engine.setCutoffTime(3000);
    expect(engine.getState()).toBe("PAUSED");
    expect(engine.getCursorIndex()).toBe(2); // Bar with timestamp 3000
    expect(engine.getVisibleBars().length).toBe(3); // bars 0, 1, 2
  });

  it("should jump directly to any bar index via setCursorIndex for timeline scrubbing", () => {
    engine.setCursorIndex(1);
    expect(engine.getState()).toBe("PAUSED");
    expect(engine.getCursorIndex()).toBe(1);
    expect(engine.getCurrentBar()?.time).toBe(2000);
    expect(engine.getVisibleBars().length).toBe(2);
  });

  it("should step forward one bar at a time and pass isForwardStep=true to listeners", () => {
    engine.setCutoffTime(2000); // cursor at 1
    let forwardFlag = false;
    engine.subscribe({
      onTick: (_bar, _c, _t, isForwardStep) => {
        forwardFlag = Boolean(isForwardStep);
      },
    });

    const advanced = engine.stepForward();
    expect(advanced).toBe(true);
    expect(forwardFlag).toBe(true);
    expect(engine.getCursorIndex()).toBe(2);
    expect(engine.getVisibleBars().length).toBe(3);
  });

  it("should stop stepping and trigger onEnd when reaching the end of history", () => {
    engine.setCutoffTime(4000); // cursor at 3
    let ended = false;
    engine.subscribe({
      onEnd: () => {
        ended = true;
      },
    });

    engine.stepForward(); // cursor becomes 4 (last bar)
    expect(engine.getCursorIndex()).toBe(4);

    const nextAdvance = engine.stepForward(); // Beyond end
    expect(nextAdvance).toBe(false);
    expect(ended).toBe(true);
  });

  it("should exit replay and reset to IDLE with full bars restored", () => {
    engine.setCutoffTime(2000);
    engine.exitReplay();
    expect(engine.getState()).toBe("IDLE");
    expect(engine.getCursorIndex()).toBe(-1);
    expect(engine.getVisibleBars().length).toBe(5);
    expect(engine.getAllBars().length).toBe(5);
  });

  it("generates accurate intrabar OHLC price trajectories for bullish and bearish candles", () => {
    const bullishBar: Bar = { time: 1000, open: 100, high: 112, low: 96, close: 108, volume: 50 };
    expect(getIntrabarPricePath(bullishBar)).toEqual([100, 96, 112, 108]);

    const bearishBar: Bar = { time: 2000, open: 108, high: 115, low: 92, close: 95, volume: 60 };
    expect(getIntrabarPricePath(bearishBar)).toEqual([108, 115, 92, 95]);
  });

  it("preserves historical replay cutoff across timeframe changes when loading new history", () => {
    // 1. Replay cutoff set at timestamp 3000
    engine.setCutoffTime(3000);
    expect(engine.getState()).toBe("PAUSED");
    expect(engine.getCutoffTime()).toBe(3000);

    // 2. User changes timeframe to lower interval with 10 bars (e.g. 500ms intervals)
    const newTimeframeBars: Bar[] = [
      { time: 500, open: 9, high: 10, low: 8, close: 9.5, volume: 50 },
      { time: 1000, open: 9.5, high: 11, low: 9, close: 10, volume: 60 },
      { time: 1500, open: 10, high: 12, low: 9.5, close: 11, volume: 70 },
      { time: 2000, open: 11, high: 12.5, low: 10.5, close: 12, volume: 80 },
      { time: 2500, open: 12, high: 13, low: 11.5, close: 12.5, volume: 90 },
      { time: 3000, open: 12.5, high: 13.5, low: 12, close: 13, volume: 100 },
      { time: 3500, open: 13, high: 14, low: 12.5, close: 13.5, volume: 110 },
      { time: 4000, open: 13.5, high: 14.5, low: 13, close: 14, volume: 120 },
      { time: 4500, open: 14, high: 15, low: 13.5, close: 14.5, volume: 130 },
      { time: 5000, open: 14.5, high: 16, low: 14, close: 15, volume: 140 },
    ];

    // Reload history with targetTimestamp 3000
    engine.loadHistory(newTimeframeBars, 3000);

    // Should remain in PAUSED state, cursor remapped to index 5 (time 3000)
    expect(engine.getState()).toBe("PAUSED");
    expect(engine.getCursorIndex()).toBe(5);
    expect(engine.getCurrentBar()?.time).toBe(3000);
    expect(engine.getVisibleBars().length).toBe(6); // bars 0 to 5
    expect(engine.getVisibleBars()[5].time).toBe(3000);
  });

  it("syncs prepended older historical bars during SELECTING and PAUSED states without jumping to present price", () => {
    // 1. User enters SELECTING ("Click Bar to Cut") and scrolls back into past dates, prepending older bars
    engine.startSelecting();
    expect(engine.getState()).toBe("SELECTING");

    const olderAndCurrentBars: Bar[] = [
      { time: 200, open: 6, high: 7, low: 5, close: 6.5, volume: 70 },
      { time: 400, open: 6.5, high: 8, low: 6, close: 7.5, volume: 80 },
      { time: 600, open: 7.5, high: 9, low: 7, close: 8.5, volume: 90 },
      ...mockBars,
    ];
    engine.loadHistory(olderAndCurrentBars);
    expect(engine.getTotalBars()).toBe(8);
    expect(engine.getVisibleBars().length).toBe(8);

    // 2. User clicks on a past bar at time 400 to cut
    engine.setCutoffTime(400);
    expect(engine.getState()).toBe("PAUSED");
    expect(engine.getCursorIndex()).toBe(1);
    expect(engine.getCurrentBar()?.time).toBe(400);
    expect(engine.getVisibleBars().map((b) => b.time)).toEqual([200, 400]);

    // 3. Even more older bars are backfilled while PAUSED at time 400
    const deeperBars: Bar[] = [
      { time: 100, open: 5, high: 6, low: 4, close: 5.5, volume: 60 },
      ...olderAndCurrentBars,
    ];
    engine.loadHistory(deeperBars);
    expect(engine.getState()).toBe("PAUSED");
    expect(engine.getCursorIndex()).toBe(2); // Remapped from index 1 to index 2 (still time 400!)
    expect(engine.getCurrentBar()?.time).toBe(400);
    expect(engine.getVisibleBars().map((b) => b.time)).toEqual([100, 200, 400]);

    // 4. Re-entering SELECTING ("Click Bar to Cut") preserves cutoff reference at time 400
    engine.startSelecting();
    expect(engine.getState()).toBe("SELECTING");
    expect(engine.getCutoffTime()).toBe(400);
    expect(engine.getVisibleBars().length).toBe(9);
  });
});
