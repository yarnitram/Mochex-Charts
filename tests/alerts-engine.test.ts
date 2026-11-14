import { describe, it, expect } from "vitest";
import {
  PriceAlert,
  evaluateAlertCrossing,
  evaluateAlertsBatch,
  evaluateStrategyConditionAlert,
  getEffectiveAlertTargetPrice,
  createAlertsFromDrawing,
  ALERT_COOLDOWN_MS,
} from "../src/lib/alerts/alerts-engine";
import { ChartDrawing } from "../src/lib/chart/drawing-math";

describe("Live Price & Drawing Crossing Alerts Engine (DEC-069)", () => {
  const baseAlert: PriceAlert = {
    id: "alert-1",
    symbol: "BTCUSDT",
    targetPrice: 68500,
    condition: "crossing",
    frequency: "only_once",
    sourceType: "price",
    label: "BTC 68.5k Breakout",
    active: true,
    triggeredCount: 0,
    createdAt: 1700000000000,
  };

  it("evaluates crossing_up, crossing_down, and bidirectional crossing accurately", () => {
    const upAlert: PriceAlert = { ...baseAlert, condition: "crossing_up" };
    const downAlert: PriceAlert = { ...baseAlert, condition: "crossing_down" };

    // Upward cross: 68450 -> 68510
    expect(evaluateAlertCrossing(upAlert, 68450, 68510).triggered).toBe(true);
    expect(evaluateAlertCrossing(downAlert, 68450, 68510).triggered).toBe(false);
    expect(evaluateAlertCrossing(baseAlert, 68450, 68510).triggered).toBe(true);

    // Downward cross: 68550 -> 68490
    expect(evaluateAlertCrossing(upAlert, 68550, 68490).triggered).toBe(false);
    expect(evaluateAlertCrossing(downAlert, 68550, 68490).triggered).toBe(true);
    expect(evaluateAlertCrossing(baseAlert, 68550, 68490).triggered).toBe(true);

    // No cross: 68400 -> 68480
    expect(evaluateAlertCrossing(baseAlert, 68400, 68480).triggered).toBe(false);
  });

  it("interpolates dynamic trendline target price by timestamp slope", () => {
    const trendAlert: PriceAlert = {
      ...baseAlert,
      sourceType: "trendline",
      trendlinePoints: {
        startTime: 1000,
        startPrice: 68000,
        endTime: 2000,
        endPrice: 69000,
      },
    };

    // At t = 1500 (midpoint), target price should be 68500
    expect(getEffectiveAlertTargetPrice(trendAlert, 1500)).toBeCloseTo(68500, 2);

    // Price moving 68480 -> 68520 at t = 1500 crosses the trendline
    const res = evaluateAlertCrossing(trendAlert, 68480, 68520, 1500);
    expect(res.triggered).toBe(true);
    expect(res.effectiveTarget).toBeCloseTo(68500, 2);
  });

  it("auto-deactivates only_once alerts and enforces 60s cooldown on every_time alerts", () => {
    const onceAlert: PriceAlert = { ...baseAlert, id: "once-1", frequency: "only_once" };
    const recurringAlert: PriceAlert = { ...baseAlert, id: "rec-1", frequency: "every_time" };

    const t0 = 1700000000000;
    const batch1 = evaluateAlertsBatch(
      [onceAlert, recurringAlert],
      "BTCUSDT",
      68400,
      68550,
      undefined,
      t0
    );

    expect(batch1.triggeredLogs).toHaveLength(2);
    expect(batch1.updatedAlerts[0].active).toBe(false); // only_once paused
    expect(batch1.updatedAlerts[1].active).toBe(true); // every_time stays active
    expect(batch1.updatedAlerts[1].triggeredCount).toBe(1);

    // 15 seconds later (inside 60s cooldown): neither should fire
    const batch2 = evaluateAlertsBatch(
      batch1.updatedAlerts,
      "BTCUSDT",
      68400,
      68550,
      undefined,
      t0 + 15_000
    );
    expect(batch2.triggeredLogs).toHaveLength(0);

    // 61 seconds later (past cooldown): recurring alert fires again
    const batch3 = evaluateAlertsBatch(
      batch1.updatedAlerts,
      "BTCUSDT",
      68400,
      68550,
      undefined,
      t0 + ALERT_COOLDOWN_MS + 1000
    );
    expect(batch3.triggeredLogs).toHaveLength(1);
    expect(batch3.triggeredLogs[0].alertId).toBe("rec-1");
    expect(batch3.updatedAlerts[1].triggeredCount).toBe(2);
  });

  it("converts Horizontal Line, Trendline, Rectangle, and Position drawings into structured alerts", () => {
    const hline: ChartDrawing = {
      id: "d-hline",
      type: "horizontal_line",
      startTime: 1000,
      startPrice: 67800,
      endTime: 1000,
      endPrice: 67800,
      color: "#2e5bff",
    };
    const hAlerts = createAlertsFromDrawing(hline, "BTCUSDT");
    expect(hAlerts).toHaveLength(1);
    expect(hAlerts[0].sourceType).toBe("horizontal_line");
    expect(hAlerts[0].targetPrice).toBe(67800);

    const pos: ChartDrawing = {
      id: "d-long",
      type: "long_position",
      startTime: 1000,
      startPrice: 68000,
      endTime: 2000,
      endPrice: 69500, // TP
      stopPrice: 67200, // SL
      color: "#00c853",
    };
    const posAlerts = createAlertsFromDrawing(pos, "BTCUSDT");
    expect(posAlerts).toHaveLength(2);
    expect(posAlerts[0].sourceType).toBe("position_tp");
    expect(posAlerts[0].condition).toBe("crossing_up");
    expect(posAlerts[0].targetPrice).toBe(69500);
    expect(posAlerts[1].sourceType).toBe("position_sl");
    expect(posAlerts[1].condition).toBe("crossing_down");
    expect(posAlerts[1].targetPrice).toBe(67200);
  });
});

describe("Custom Strategy Condition Alerts Engine (DEC-079)", () => {
  const stratAlert: PriceAlert = {
    id: "strat-alert-1",
    symbol: "BTCUSDT",
    targetPrice: 0,
    condition: "strategy_entry_long",
    frequency: "once_per_bar_close",
    sourceType: "strategy_order",
    label: "Strategy Long Entry Alert",
    active: true,
    triggeredCount: 0,
    createdAt: 1700000000000,
  };

  it("evaluates Strategy Entry Long and Short orders accurately", () => {
    // 1. Long Entry
    const resLong = evaluateStrategyConditionAlert(stratAlert, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: true,
      currentBar: { time: 1000, open: 68000, high: 68600, low: 67900, close: 68500, volume: 10 },
      orderIntents: [
        {
          barIndex: 10,
          time: 1000,
          type: "ENTRY",
          orderId: "buy-trend",
          direction: "long",
        },
      ],
    });
    expect(resLong.triggered).toBe(true);
    expect(resLong.orderSide).toBe("long");
    expect(resLong.message).toContain("Strategy entered LONG @ $68500.00");

    // 2. Short Entry
    const shortAlert: PriceAlert = {
      ...stratAlert,
      id: "strat-short-1",
      condition: "strategy_entry_short",
    };
    const resShort = evaluateStrategyConditionAlert(shortAlert, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: true,
      orderIntents: [
        {
          barIndex: 10,
          time: 1000,
          type: "ENTRY",
          orderId: "sell-breakdown",
          direction: "short",
        },
      ],
    });
    expect(resShort.triggered).toBe(true);
    expect(resShort.orderSide).toBe("short");
    expect(resShort.message).toContain("Strategy entered SHORT");
  });

  it("enforces once_per_bar_close frequency deduplication", () => {
    const alertWithHistory: PriceAlert = {
      ...stratAlert,
      lastTriggeredBarTime: 1000,
    };

    // Should not trigger on same bar 1000
    const resSameBar = evaluateStrategyConditionAlert(alertWithHistory, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: true,
      currentBar: { time: 1000, open: 68000, high: 68600, low: 67900, close: 68500, volume: 10 },
      orderIntents: [{ barIndex: 10, time: 1000, type: "ENTRY", orderId: "b1", direction: "long" }],
    });
    expect(resSameBar.triggered).toBe(false);

    // Should not trigger if bar is not yet closed
    const resUnclosed = evaluateStrategyConditionAlert(stratAlert, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: false,
      currentBar: { time: 2000, open: 68000, high: 68600, low: 67900, close: 68500, volume: 10 },
      orderIntents: [{ barIndex: 11, time: 2000, type: "ENTRY", orderId: "b1", direction: "long" }],
    });
    expect(resUnclosed.triggered).toBe(false);

    // Should trigger on new closed bar 2000
    const resNewBar = evaluateStrategyConditionAlert(alertWithHistory, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: true,
      currentBar: { time: 2000, open: 68000, high: 68600, low: 67900, close: 68500, volume: 10 },
      orderIntents: [{ barIndex: 11, time: 2000, type: "ENTRY", orderId: "b1", direction: "long" }],
    });
    expect(resNewBar.triggered).toBe(true);
  });

  it("evaluates custom script alertcondition() matches", () => {
    const scriptAlert: PriceAlert = {
      id: "script-1",
      symbol: "BTCUSDT",
      targetPrice: 0,
      condition: "script_condition",
      frequency: "once_per_bar_close",
      sourceType: "indicator_condition",
      label: "Custom Script Alert",
      active: true,
      triggeredCount: 0,
      createdAt: 1700000000000,
    };

    const res = evaluateStrategyConditionAlert(scriptAlert, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: true,
      scriptAlertConditions: [
        { title: "RSI Dip", message: "RSI entered deep oversold territory", triggered: true },
      ],
    });
    expect(res.triggered).toBe(true);
    expect(res.message).toBe("RSI entered deep oversold territory");
  });

  it("evaluates EMA cross, RSI oversold/overbought, and BB squeeze indicators", () => {
    // 1. EMA Golden Cross
    const emaAlert: PriceAlert = {
      ...stratAlert,
      id: "ema-cross-1",
      condition: "indicator_bullish_cross",
      sourceType: "indicator_condition",
    };
    const resEma = evaluateStrategyConditionAlert(emaAlert, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: true,
      prevEmaFast: 68100,
      prevEmaSlow: 68150,
      emaFast: 68250,
      emaSlow: 68200,
    });
    expect(resEma.triggered).toBe(true);
    expect(resEma.orderSide).toBe("long");

    // 2. RSI Oversold
    const rsiAlert: PriceAlert = {
      ...stratAlert,
      id: "rsi-os-1",
      condition: "indicator_oversold",
      sourceType: "indicator_condition",
    };
    const resRsi = evaluateStrategyConditionAlert(rsiAlert, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: true,
      prevRsi14: 32,
      rsi14: 28,
    });
    expect(resRsi.triggered).toBe(true);
    expect(resRsi.orderSide).toBe("long");

    // 3. Bollinger Band Squeeze
    const bbAlert: PriceAlert = {
      ...stratAlert,
      id: "bb-sq-1",
      condition: "indicator_bb_squeeze",
      sourceType: "indicator_condition",
    };
    const resBb = evaluateStrategyConditionAlert(bbAlert, {
      symbol: "BTCUSDT",
      currentPrice: 68500,
      isBarClosed: true,
      bbWidthPct: 1.8,
    });
    expect(resBb.triggered).toBe(true);
    expect(resBb.message).toContain("Bollinger Band Volatility Squeeze");
  });

  it("evaluates batch of hybrid price & strategy alerts seamlessly", () => {
    const priceAlert: PriceAlert = {
      id: "p-1",
      symbol: "BTCUSDT",
      targetPrice: 68500,
      condition: "crossing_up",
      frequency: "only_once",
      sourceType: "price",
      label: "BTC 68.5k Breakout",
      active: true,
      triggeredCount: 0,
      createdAt: 1700000000000,
    };

    const batch = evaluateAlertsBatch(
      [priceAlert, stratAlert],
      "BTCUSDT",
      68400,
      68550,
      1000,
      1700000000000,
      {
        isBarClosed: true,
        currentBar: { time: 1000, open: 68000, high: 68600, low: 67900, close: 68550, volume: 10 },
        orderIntents: [{ barIndex: 10, time: 1000, type: "ENTRY", orderId: "b1", direction: "long" }],
      }
    );

    expect(batch.triggeredLogs).toHaveLength(2);
    expect(batch.triggeredLogs[0].alertId).toBe("p-1");
    expect(batch.triggeredLogs[1].alertId).toBe("strat-alert-1");
    expect(batch.triggeredLogs[1].strategyOrderSide).toBe("long");
  });

  it("removes POI alarms from evaluateAlertsBatch when hit or invalidated while keeping non-POI alerts", () => {
    const poiHitAlert: PriceAlert = {
      id: "alert-poi-btc-hit",
      symbol: "BTCUSDT",
      targetPrice: 68500,
      condition: "crossing_up",
      frequency: "only_once",
      sourceType: "price",
      label: "BTC 1h Bearish OB Hit",
      active: true,
      triggeredCount: 0,
      createdAt: 1700000000000,
      invalidationPrice: 68800,
      poiMetadata: {
        poiId: "poi-1",
        category: "order_block",
        direction: "BEARISH",
        timeframe: "1h",
        zoneTop: 68800,
        zoneBottom: 68500,
        invalidationPrice: 68800,
      },
    };
    const poiInvAlert: PriceAlert = {
      id: "alert-poi-btc-inv",
      symbol: "BTCUSDT",
      targetPrice: 68600,
      condition: "crossing_down",
      frequency: "only_once",
      sourceType: "price",
      label: "BTC 15m Bullish OB Inv",
      active: true,
      triggeredCount: 0,
      createdAt: 1700000000000,
      invalidationPrice: 68520,
      notifyOnInvalidation: true,
      poiMetadata: {
        poiId: "poi-2",
        category: "order_block",
        direction: "BULLISH",
        timeframe: "15m",
        zoneTop: 68600,
        zoneBottom: 68520,
        invalidationPrice: 68520,
      },
    };
    const chartOnceAlert: PriceAlert = {
      id: "chart-once-1",
      symbol: "BTCUSDT",
      targetPrice: 68490,
      condition: "crossing_up",
      frequency: "only_once",
      sourceType: "price",
      label: "BTC 68490 Chart Alert",
      active: true,
      triggeredCount: 0,
      createdAt: 1700000000000,
    };

    // Hit poiHitAlert (68450 -> 68550), chartOnceAlert pauses (active: false), poiInvAlert invalidated? Wait: 68550 > 68520 so invert: move to 68400 invalidates BULLISH poiInvAlert!
    const res1 = evaluateAlertsBatch(
      [poiHitAlert, chartOnceAlert],
      "BTCUSDT",
      68450,
      68550,
      1000,
      1700000000000
    );
    expect(res1.triggeredLogs).toHaveLength(2);
    expect(res1.removedAlertIds).toEqual(["alert-poi-btc-hit"]);
    expect(res1.updatedAlerts).toHaveLength(1);
    expect(res1.updatedAlerts[0].id).toBe("chart-once-1");
    expect(res1.updatedAlerts[0].active).toBe(false);

    // Move price below poiInvAlert invalidation (68530 -> 68490, doesn't cross 68600 from above because prev <= 68600)
    const res2 = evaluateAlertsBatch(
      [poiInvAlert],
      "BTCUSDT",
      68530,
      68490,
      1001,
      1700000001000
    );
    expect(res2.removedAlertIds).toEqual(["alert-poi-btc-inv"]);
    expect(res2.updatedAlerts).toHaveLength(0);
    expect(res2.triggeredLogs).toHaveLength(1);
    expect(res2.triggeredLogs[0].message).toContain("POI invalidated");
  });
});
