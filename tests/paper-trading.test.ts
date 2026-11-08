import { describe, it, expect, beforeEach } from "vitest";
import {
  createInitialPaperAccount,
  placePaperOrder,
  evaluatePaperTick,
  closePaperPosition,
  calculatePositionUnrealizedPnl,
  calculateAccountEquity,
  createOrderInputFromDrawing,
  createOrderInputFromPoi,
  executePoiPaperTrade,
  loadStoredPaperAccount,
  saveStoredPaperAccount,
} from "../src/lib/trading/paper-trading-engine";
import { ChartDrawing } from "../src/lib/chart/drawing-math";
import { RadarPoiItem } from "../src/lib/indicators/radar-poi-engine";

class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

describe("Paper Trading & Order Execution Engine (DEC-072)", () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = new MockLocalStorage();
  });
  it("executes a Market Long order immediately and calculates live Unrealized PnL & ROE%", () => {
    const initial = createInitialPaperAccount(100000);
    const result = placePaperOrder(
      initial,
      {
        symbol: "BTCUSDT",
        side: "long",
        orderType: "market",
        marginAmountUsdt: 2000,
        leverage: 5,
        takeProfit: 72000,
        stopLoss: 67000,
      },
      68000,
      1700000000000
    );

    expect(result.status).toBe("filled");
    expect(result.state.positions).toHaveLength(1);
    const pos = result.state.positions[0];
    expect(pos.entryPrice).toBe(68000);
    expect(pos.marginUsed).toBe(2000);
    expect(pos.leverage).toBe(5);
    // Notional = 10,000 -> Qty = 10,000 / 68,000
    expect(pos.quantity).toBeCloseTo(10000 / 68000, 6);

    // Price rises to $71,400 (+5% move -> +25% ROE at 5x leverage -> +$500 PnL)
    const pnl = calculatePositionUnrealizedPnl(pos, 71400);
    expect(pnl.unrealizedPnl).toBeCloseTo(500, 2);
    expect(pnl.roePercent).toBeCloseTo(25, 2);

    const equity = calculateAccountEquity(result.state, { BTCUSDT: 71400 });
    expect(equity.equity).toBeCloseTo(100500, 2);
    expect(equity.usedMargin).toBe(2000);
    expect(equity.freeMargin).toBeCloseTo(98500, 2);
  });

  it("places a resting Limit order and fills it automatically when price crosses on tick", () => {
    const initial = createInitialPaperAccount(100000);
    const placed = placePaperOrder(
      initial,
      {
        symbol: "ETHUSDT",
        side: "long",
        orderType: "limit",
        price: 3400,
        marginAmountUsdt: 1000,
        leverage: 10,
        takeProfit: 3600,
        stopLoss: 3300,
      },
      3500,
      1700000001000
    );

    expect(placed.status).toBe("placed");
    expect(placed.state.orders).toHaveLength(1);
    expect(placed.state.positions).toHaveLength(0);

    // Tick at 3450 -> still resting
    const tick1 = evaluatePaperTick(placed.state, "ETHUSDT", 3450, 1700000002000);
    expect(tick1.filledOrders).toHaveLength(0);
    expect(tick1.state.orders).toHaveLength(1);

    // Tick at 3395 -> crosses <= 3400 -> fills at 3400 limit price!
    const tick2 = evaluatePaperTick(tick1.state, "ETHUSDT", 3395, 1700000003000);
    expect(tick2.filledOrders).toHaveLength(1);
    expect(tick2.state.orders).toHaveLength(0);
    expect(tick2.state.positions).toHaveLength(1);
    expect(tick2.state.positions[0].entryPrice).toBe(3400);
  });

  it("automatically triggers Take Profit and Stop Loss brackets on open positions", () => {
    const initial = createInitialPaperAccount(100000);
    const opened = placePaperOrder(
      initial,
      {
        symbol: "SOLUSDT",
        side: "short",
        orderType: "market",
        marginAmountUsdt: 1000,
        leverage: 5,
        takeProfit: 180,
        stopLoss: 210,
      },
      200,
      1700000010000
    );

    expect(opened.state.positions).toHaveLength(1);
    // Short @ $200, notional $5000 -> 25 SOL. TP @ $180 -> +$20 * 25 = +$500 profit
    const tickTp = evaluatePaperTick(opened.state, "SOLUSDT", 179.5, 1700000020000);
    expect(tickTp.closedTrades).toHaveLength(1);
    expect(tickTp.closedTrades[0].exitReason).toBe("take_profit");
    expect(tickTp.closedTrades[0].realizedPnl).toBeCloseTo(500, 2);
    expect(tickTp.state.positions).toHaveLength(0);
    expect(tickTp.state.balance).toBeCloseTo(100500, 2);
  });

  it("converts a Long Position or Short Position chart drawing into a PaperOrderInput", () => {
    const drawing: ChartDrawing = {
      id: "draw-long-1",
      type: "long_position",
      startTime: 1700000000000,
      startPrice: 68000,
      endTime: 1700003600000,
      endPrice: 70000,
      targetPrice: 71400,
      stopPrice: 66640,
      accountSize: 10000,
      riskPercent: 1,
    };

    const orderInput = createOrderInputFromDrawing(drawing, "BTCUSDT", 68020, 5);
    expect(orderInput).not.toBeNull();
    expect(orderInput?.side).toBe("long");
    expect(orderInput?.orderType).toBe("market"); // within 0.15% of 68000
    expect(orderInput?.takeProfit).toBe(71400);
    expect(orderInput?.stopLoss).toBe(66640);
    expect(orderInput?.sourceDrawingId).toBe("draw-long-1");
  });

  it("manually closes an open position and updates account balance and history", () => {
    const initial = createInitialPaperAccount(100000);
    const opened = placePaperOrder(
      initial,
      {
        symbol: "BTCUSDT",
        side: "long",
        orderType: "market",
        marginAmountUsdt: 1000,
        leverage: 10,
      },
      50000,
      1700000000000
    );

    const posId = opened.state.positions[0].id;
    const closed = closePaperPosition(opened.state, posId, 51000, "manual", 1700000050000);
    expect(closed.closedTrade).not.toBeNull();
    expect(closed.closedTrade?.realizedPnl).toBeCloseTo(200, 2);
    expect(closed.state.balance).toBeCloseTo(100200, 2);
    expect(closed.state.history).toHaveLength(1);
  });

  describe("Automated Paper Trading Execution from POI Touch (DEC-142)", () => {
    const mockBullishPoi: RadarPoiItem = {
      id: "poi-btc-4h-ob",
      symbol: "BTCUSDT",
      timeframe: "4H",
      category: "order_block",
      type: "BULLISH",
      label: "4H Bullish OB",
      isPlus: true,
      entryPrice: 76000,
      meanThreshold: 75500,
      fullRetestPrice: 75000,
      top: 76000,
      bottom: 75000,
      status: "fresh",
      isInsideZone: false,
      distanceToEntryPct: 1.0,
      distanceToMtPct: 1.65,
      currentPrice: 76760,
      time: 1730000000,
    };

    const mockBearishPoi: RadarPoiItem = {
      id: "poi-sol-1h-sandwich",
      symbol: "SOLUSDT",
      timeframe: "1H",
      category: "sandwich_zone",
      type: "BEARISH",
      label: "1H Bearish Sandwich",
      isPlus: false,
      entryPrice: 200.0,
      meanThreshold: 202.5,
      fullRetestPrice: 205.0,
      top: 205.0,
      bottom: 200.0,
      status: "testing",
      isInsideZone: true,
      distanceToEntryPct: 0.0,
      distanceToMtPct: 1.25,
      currentPrice: 202.5,
      time: 1730000000,
    };

    it("creates a Long PaperOrderInput from Bullish POI with invalidation Stop Loss and 2R Take Profit", () => {
      const order = createOrderInputFromPoi(mockBullishPoi, 76760, {
        touchLevel: "entry",
        riskRewardRatio: 2.0,
        marginAmountUsdt: 500,
        leverage: 5,
        slBufferPct: 0.002,
      });

      expect(order.symbol).toBe("BTCUSDT");
      expect(order.side).toBe("long");
      expect(order.orderType).toBe("limit"); // price 76760 is > 76000 entry
      expect(order.price).toBe(76000);
      // SL = 75000 * (1 - 0.002) = 74850
      expect(order.stopLoss).toBe(74850);
      // Risk = 76000 - 74850 = 1150
      // TP (2R) = 76000 + (1150 * 2) = 78300
      expect(order.takeProfit).toBe(78300);
      expect(order.marginAmountUsdt).toBe(500);
      expect(order.leverage).toBe(5);
    });

    it("creates an immediate Market Short order when price is already inside Bearish POI zone", () => {
      const order = createOrderInputFromPoi(mockBearishPoi, 202.5, {
        touchLevel: "fifty_pct",
        riskRewardRatio: 3.0,
        marginAmountUsdt: 250,
        leverage: 10,
        slBufferPct: 0.002,
      });

      expect(order.symbol).toBe("SOLUSDT");
      expect(order.side).toBe("short");
      expect(order.orderType).toBe("market"); // mockBearishPoi.isInsideZone is true
      expect(order.price).toBe(202.5); // 50% MT level
      // SL = 205.0 * (1 + 0.002) = 205.41
      expect(order.stopLoss).toBeCloseTo(205.41, 2);
      // Risk = 205.41 - 202.5 = 2.91
      // TP (3R) = 202.5 - (2.91 * 3) = 193.77
      expect(order.takeProfit).toBeCloseTo(193.77, 2);
    });

    it("executes POI paper trade and automatically persists to stored account", () => {
      const res = executePoiPaperTrade(mockBullishPoi, 76760, {
        touchLevel: "entry",
        marginAmountUsdt: 500,
      });

      expect(res.status).toBe("placed");
      expect(res.state.orders).toHaveLength(1);
      expect(res.state.orders[0].symbol).toBe("BTCUSDT");

      // Verify rehydration from storage
      const rehydrated = loadStoredPaperAccount();
      expect(rehydrated.orders).toHaveLength(1);
      expect(rehydrated.orders[0].limitPrice).toBe(76000);
    });
  });
});
