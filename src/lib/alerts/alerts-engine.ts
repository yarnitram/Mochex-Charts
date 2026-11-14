import { ChartDrawing } from "@/lib/chart/drawing-math";
import { CandlestickBar } from "@/lib/mexc/types";
import { StrategyOrderIntent } from "@/lib/strategy/types";

export type AlertCondition =
  | "crossing"
  | "crossing_up"
  | "crossing_down"
  | "strategy_entry_long"
  | "strategy_entry_short"
  | "strategy_close"
  | "strategy_any_order"
  | "indicator_bullish_cross"
  | "indicator_bearish_cross"
  | "indicator_oversold"
  | "indicator_overbought"
  | "indicator_bb_squeeze"
  | "script_condition";

export type AlertFrequency = "only_once" | "every_time" | "once_per_bar_close";

export type AlertSourceType =
  | "price"
  | "horizontal_line"
  | "trendline"
  | "rectangle"
  | "position_tp"
  | "position_sl"
  | "strategy_order"
  | "indicator_condition";

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  /** Optional 2-point time/price anchors for dynamic Trendline slope interpolation */
  trendlinePoints?: {
    startTime: number;
    startPrice: number;
    endTime: number;
    endPrice: number;
  };
  condition: AlertCondition;
  frequency: AlertFrequency;
  sourceType: AlertSourceType;
  drawingId?: string;
  scriptId?: string;
  scriptName?: string;
  indicatorName?: string;
  conditionMessage?: string;
  lastTriggeredBarTime?: number;
  label: string;
  active: boolean;
  triggeredCount: number;
  lastTriggeredAt?: number;
  createdAt: number;
  /** Optional channel delivery overrides (DEC-130, DEC-148) */
  notifyDiscord?: boolean;
  notifyTelegram?: boolean;
  notifyTradingWebhook?: boolean;
  tradingWebhookOverride?: {
    platform?: "3commas" | "cornix" | "custom";
    webhookUrl?: string;
    customTemplate?: string;
  };
  /** Optional custom chime sound preset (DEC-140) */
  soundType?: string;
  /** Optional POI invalidation stop-out telemetry (DEC-150) */
  notifyOnInvalidation?: boolean;
  invalidationPrice?: number;
  poiMetadata?: {
    poiId: string;
    category: "order_block" | "sandwich_zone" | "fvg";
    direction: "BULLISH" | "BEARISH";
    timeframe: string;
    zoneTop: number;
    zoneBottom: number;
    invalidationPrice?: number;
  };
  breakTelemetry?: any;
}

export interface ChannelDeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
  skipped?: boolean;
  skippedReason?: string;
}

export interface AlertDeliveryResults {
  discord?: ChannelDeliveryResult;
  telegram?: ChannelDeliveryResult;
  tradingWebhook?: ChannelDeliveryResult;
  attemptedAt?: number;
}

export interface AlertLogEntry {
  id: string;
  alertId: string;
  symbol: string;
  triggerPrice: number;
  targetPrice: number;
  condition: AlertCondition;
  sourceType?: AlertSourceType;
  strategyOrderSide?: "long" | "short";
  label: string;
  message?: string;
  triggeredAt: number;
  logType?: "trigger" | "test" | "system" | "error";
  deliveryResults?: AlertDeliveryResults;
}

export const ALERT_COOLDOWN_MS = 60_000;

/**
 * Identifies whether a PriceAlert is a Radar/POI alarm (as opposed to a standard chart alert).
 */
export function isPoiPriceAlert(alert: PriceAlert): boolean {
  return Boolean(
    alert.poiMetadata ||
      alert.id.startsWith("alert-poi-") ||
      alert.id.startsWith("bulk-poi-")
  );
}

/**
 * Resolves the effective invalidation boundary price for a POI alarm.
 */
export function getPoiAlertInvalidationPrice(alert: PriceAlert): number | null {
  if (typeof alert.invalidationPrice === "number" && alert.invalidationPrice > 0) {
    return alert.invalidationPrice;
  }
  const meta = alert.poiMetadata;
  if (!meta) return null;
  if (typeof meta.invalidationPrice === "number" && meta.invalidationPrice > 0) {
    return meta.invalidationPrice;
  }
  const fallback = meta.direction === "BULLISH" ? meta.zoneBottom : meta.zoneTop;
  return typeof fallback === "number" && fallback > 0 ? fallback : null;
}

/**
 * Returns true when `currentPrice` has breached a POI alarm's invalidation boundary.
 */
export function isPoiAlertInvalidated(alert: PriceAlert, currentPrice: number): boolean {
  if (!isPoiPriceAlert(alert) || currentPrice <= 0 || !alert.poiMetadata) {
    return false;
  }
  const invPrice = getPoiAlertInvalidationPrice(alert);
  if (invPrice === null || invPrice <= 0) {
    return false;
  }
  return alert.poiMetadata.direction === "BULLISH"
    ? currentPrice < invPrice
    : currentPrice > invPrice;
}

/**
 * Computes the effective target price of an alert at `currentTimeSec`.
 * For dynamic trendline alerts with distinct start/end times, linearly interpolates the ray price.
 */
export function getEffectiveAlertTargetPrice(
  alert: PriceAlert,
  currentTimeSec?: number
): number {
  if (
    alert.sourceType === "trendline" &&
    alert.trendlinePoints &&
    typeof currentTimeSec === "number"
  ) {
    const { startTime, startPrice, endTime, endPrice } = alert.trendlinePoints;
    const dt = endTime - startTime;
    if (Math.abs(dt) > 0) {
      const slope = (endPrice - startPrice) / dt;
      return startPrice + slope * (currentTimeSec - startTime);
    }
  }
  return alert.targetPrice;
}

/**
 * Pure evaluation of whether a single price transition (`prevPrice` -> `currentPrice`)
 * triggers `alert` at `nowMs`.
 */
export function evaluateAlertCrossing(
  alert: PriceAlert,
  prevPrice: number,
  currentPrice: number,
  currentTimeSec?: number,
  nowMs: number = Date.now()
): { triggered: boolean; effectiveTarget: number } {
  const effectiveTarget = getEffectiveAlertTargetPrice(alert, currentTimeSec);

  if (!alert.active) {
    return { triggered: false, effectiveTarget };
  }
  if (!Number.isFinite(prevPrice) || !Number.isFinite(currentPrice) || prevPrice <= 0 || currentPrice <= 0) {
    return { triggered: false, effectiveTarget };
  }
  if (prevPrice === currentPrice) {
    return { triggered: false, effectiveTarget };
  }

  // Cooldown check for "every_time" frequency
  if (
    alert.frequency === "every_time" &&
    typeof alert.lastTriggeredAt === "number" &&
    nowMs - alert.lastTriggeredAt < ALERT_COOLDOWN_MS
  ) {
    return { triggered: false, effectiveTarget };
  }

  const crossedUp = prevPrice < effectiveTarget && currentPrice >= effectiveTarget;
  const crossedDown = prevPrice > effectiveTarget && currentPrice <= effectiveTarget;

  let triggered = false;
  if (alert.condition === "crossing_up") {
    triggered = crossedUp;
  } else if (alert.condition === "crossing_down") {
    triggered = crossedDown;
  } else {
    triggered = crossedUp || crossedDown;
  }

  return { triggered, effectiveTarget };
}

export interface StrategyAlertEvaluationContext {
  symbol: string;
  currentPrice: number;
  prevPrice?: number;
  currentTimeSec?: number;
  currentBar?: CandlestickBar;
  prevBar?: CandlestickBar;
  isBarClosed?: boolean;
  orderIntents?: StrategyOrderIntent[];
  scriptAlertConditions?: Array<{ title: string; message: string; triggered: boolean }>;
  rsi14?: number;
  prevRsi14?: number;
  emaFast?: number;
  prevEmaFast?: number;
  emaSlow?: number;
  prevEmaSlow?: number;
  bbWidthPct?: number;
  nowMs?: number;
}

/**
 * Pure evaluation of whether a strategy order intent or indicator condition triggers `alert`.
 */
export function evaluateStrategyConditionAlert(
  alert: PriceAlert,
  ctx: StrategyAlertEvaluationContext
): { triggered: boolean; message?: string; orderSide?: "long" | "short" } {
  if (!alert.active || alert.symbol !== ctx.symbol) {
    return { triggered: false };
  }

  const nowMs = ctx.nowMs ?? Date.now();

  // Cooldown check for "every_time"
  if (
    alert.frequency === "every_time" &&
    typeof alert.lastTriggeredAt === "number" &&
    nowMs - alert.lastTriggeredAt < ALERT_COOLDOWN_MS
  ) {
    return { triggered: false };
  }

  // Deduplication check for "once_per_bar_close"
  if (alert.frequency === "once_per_bar_close") {
    if (!ctx.isBarClosed && ctx.currentBar) {
      return { triggered: false };
    }
    if (ctx.currentBar && alert.lastTriggeredBarTime === ctx.currentBar.time) {
      return { triggered: false };
    }
  }

  // 1. Strategy Order Alerts
  if (alert.sourceType === "strategy_order") {
    const orders = ctx.orderIntents || [];
    if (alert.condition === "strategy_entry_long") {
      const match = orders.find((o) => o.type === "ENTRY" && o.direction === "long");
      if (match) {
        return {
          triggered: true,
          message: `Strategy entered LONG @ $${ctx.currentPrice.toFixed(2)} (${match.orderId})`,
          orderSide: "long",
        };
      }
    } else if (alert.condition === "strategy_entry_short") {
      const match = orders.find((o) => o.type === "ENTRY" && o.direction === "short");
      if (match) {
        return {
          triggered: true,
          message: `Strategy entered SHORT @ $${ctx.currentPrice.toFixed(2)} (${match.orderId})`,
          orderSide: "short",
        };
      }
    } else if (alert.condition === "strategy_close") {
      const match = orders.find((o) => o.type === "CLOSE" || o.type === "EXIT");
      if (match) {
        return {
          triggered: true,
          message: `Strategy closed position @ $${ctx.currentPrice.toFixed(2)} (${match.orderId})`,
        };
      }
    } else if (alert.condition === "strategy_any_order") {
      const match = orders[0];
      if (match) {
        return {
          triggered: true,
          message: `Strategy order executed: ${match.type} ${match.direction || ""} @ $${ctx.currentPrice.toFixed(2)}`,
          orderSide: match.direction,
        };
      }
    }
  }

  // 2. Custom Script alertcondition()
  if (alert.sourceType === "indicator_condition" && alert.condition === "script_condition") {
    const matchedCond = (ctx.scriptAlertConditions || []).find(
      (c) =>
        c.triggered &&
        (!alert.conditionMessage ||
          c.title === alert.conditionMessage ||
          c.title === alert.label)
    );
    if (matchedCond) {
      return {
        triggered: true,
        message: matchedCond.message || `Custom condition "${matchedCond.title}" triggered`,
      };
    }
  }

  // 3. Built-in Technical Indicator Conditions
  if (alert.sourceType === "indicator_condition") {
    // EMA Golden Cross
    if (alert.condition === "indicator_bullish_cross") {
      if (
        ctx.emaFast !== undefined &&
        ctx.prevEmaFast !== undefined &&
        ctx.emaSlow !== undefined &&
        ctx.prevEmaSlow !== undefined
      ) {
        if (ctx.prevEmaFast <= ctx.prevEmaSlow && ctx.emaFast > ctx.emaSlow) {
          return {
            triggered: true,
            message: `EMA Bullish Golden Cross (Fast ${ctx.emaFast.toFixed(2)} > Slow ${ctx.emaSlow.toFixed(2)})`,
            orderSide: "long",
          };
        }
      }
    }
    // EMA Death Cross
    if (alert.condition === "indicator_bearish_cross") {
      if (
        ctx.emaFast !== undefined &&
        ctx.prevEmaFast !== undefined &&
        ctx.emaSlow !== undefined &&
        ctx.prevEmaSlow !== undefined
      ) {
        if (ctx.prevEmaFast >= ctx.prevEmaSlow && ctx.emaFast < ctx.emaSlow) {
          return {
            triggered: true,
            message: `EMA Bearish Death Cross (Fast ${ctx.emaFast.toFixed(2)} < Slow ${ctx.emaSlow.toFixed(2)})`,
            orderSide: "short",
          };
        }
      }
    }
    // RSI Oversold (<= 30)
    if (alert.condition === "indicator_oversold") {
      if (ctx.rsi14 !== undefined && ctx.prevRsi14 !== undefined) {
        if (ctx.prevRsi14 >= 30 && ctx.rsi14 < 30) {
          return {
            triggered: true,
            message: `RSI Oversold signal (${ctx.rsi14.toFixed(1)} ≤ 30)`,
            orderSide: "long",
          };
        }
      }
    }
    // RSI Overbought (>= 70)
    if (alert.condition === "indicator_overbought") {
      if (ctx.rsi14 !== undefined && ctx.prevRsi14 !== undefined) {
        if (ctx.prevRsi14 <= 70 && ctx.rsi14 > 70) {
          return {
            triggered: true,
            message: `RSI Overbought signal (${ctx.rsi14.toFixed(1)} ≥ 70)`,
            orderSide: "short",
          };
        }
      }
    }
    // Bollinger Band Squeeze (Width <= 2.2%)
    if (alert.condition === "indicator_bb_squeeze") {
      if (ctx.bbWidthPct !== undefined && ctx.bbWidthPct <= 2.2) {
        return {
          triggered: true,
          message: `Bollinger Band Volatility Squeeze detected (${ctx.bbWidthPct.toFixed(2)}%)`,
        };
      }
    }
  }

  return { triggered: false };
}

/**
 * Evaluates a batch of alerts for a specific `symbol` transition (`prevPrice` -> `currentPrice`),
 * supporting both price/drawing crossings and strategy/indicator conditions.
 * Returns updated alerts list and any newly generated `AlertLogEntry` items.
 */
export function evaluateAlertsBatch(
  alerts: PriceAlert[],
  symbol: string,
  prevPrice: number,
  currentPrice: number,
  currentTimeSec?: number,
  nowMs: number = Date.now(),
  strategyContext?: Partial<StrategyAlertEvaluationContext>
): { updatedAlerts: PriceAlert[]; triggeredLogs: AlertLogEntry[]; removedAlertIds: string[] } {
  let changed = false;
  const triggeredLogs: AlertLogEntry[] = [];
  const removedAlertIds: string[] = [];

  const fullCtx: StrategyAlertEvaluationContext = {
    symbol,
    currentPrice,
    prevPrice,
    currentTimeSec,
    nowMs,
    ...strategyContext,
  };

  const updatedAlerts: PriceAlert[] = [];

  for (const alert of alerts) {
    if (alert.symbol !== symbol || !alert.active) {
      updatedAlerts.push(alert);
      continue;
    }

    let triggered = false;
    let effectiveTarget = alert.targetPrice;
    let customMessage: string | undefined = undefined;
    let orderSide: "long" | "short" | undefined = undefined;

    if (
      alert.sourceType === "strategy_order" ||
      alert.sourceType === "indicator_condition"
    ) {
      const res = evaluateStrategyConditionAlert(alert, fullCtx);
      triggered = res.triggered;
      customMessage = res.message;
      orderSide = res.orderSide;
      effectiveTarget = currentPrice;
    } else {
      const res = evaluateAlertCrossing(
        alert,
        prevPrice,
        currentPrice,
        currentTimeSec,
        nowMs
      );
      triggered = res.triggered;
      effectiveTarget = res.effectiveTarget;
    }

    if (triggered) {
      changed = true;
      triggeredLogs.push({
        id: `log-${nowMs}-${alert.id}-${alert.triggeredCount + 1}`,
        alertId: alert.id,
        symbol: alert.symbol,
        triggerPrice: currentPrice,
        targetPrice: effectiveTarget,
        condition: alert.condition,
        sourceType: alert.sourceType,
        strategyOrderSide: orderSide,
        label: alert.label,
        message: customMessage,
        triggeredAt: nowMs,
      });

      if (isPoiPriceAlert(alert)) {
        // POI alarms are automatically removed once hit
        removedAlertIds.push(alert.id);
        continue;
      }

      updatedAlerts.push({
        ...alert,
        active: alert.frequency === "only_once" ? false : true,
        triggeredCount: alert.triggeredCount + 1,
        lastTriggeredAt: nowMs,
        lastTriggeredBarTime: fullCtx.currentBar ? fullCtx.currentBar.time : alert.lastTriggeredBarTime,
      });
      continue;
    }

    if (isPoiAlertInvalidated(alert, currentPrice)) {
      // POI alarms are automatically removed once invalidated
      changed = true;
      removedAlertIds.push(alert.id);
      if (alert.notifyOnInvalidation) {
        const invPrice = getPoiAlertInvalidationPrice(alert) ?? alert.targetPrice;
        triggeredLogs.push({
          id: `log-${nowMs}-${alert.id}-inv`,
          alertId: alert.id,
          symbol: alert.symbol,
          triggerPrice: currentPrice,
          targetPrice: invPrice,
          condition: alert.poiMetadata?.direction === "BULLISH" ? "crossing_down" : "crossing_up",
          sourceType: alert.sourceType,
          label: alert.label,
          message: `POI invalidated beyond ${invPrice} — alarm automatically removed`,
          triggeredAt: nowMs,
        });
      }
      continue;
    }

    updatedAlerts.push(alert);
  }

  return {
    updatedAlerts: changed ? updatedAlerts : alerts,
    triggeredLogs,
    removedAlertIds,
  };
}

/**
 * Converts a selected `ChartDrawing` into one or more `PriceAlert` definitions.
 * - Horizontal Line -> Crossing at `startPrice`
 * - Trendline -> Dynamic slope Crossing anchored to `(startTime, startPrice)` and `(endTime, endPrice)`
 * - Rectangle -> Resistance Crossing Up (`max`) and Support Crossing Down (`min`)
 * - Long / Short Position -> Take Profit and Stop Loss Crossing alerts
 */
export function createAlertsFromDrawing(
  drawing: ChartDrawing,
  symbol: string,
  nowMs: number = Date.now()
): PriceAlert[] {
  if (drawing.type === "horizontal_line") {
    return [
      {
        id: `alert-${drawing.id}-hline-${nowMs}`,
        symbol,
        targetPrice: drawing.startPrice,
        condition: "crossing",
        frequency: "only_once",
        sourceType: "horizontal_line",
        drawingId: drawing.id,
        label: drawing.text
          ? `H-Line (${drawing.text})`
          : `Horizontal Line @ $${drawing.startPrice.toFixed(2)}`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
        notifyDiscord: true,
        notifyTelegram: true,
      },
    ];
  }

  if (drawing.type === "trendline") {
    return [
      {
        id: `alert-${drawing.id}-tline-${nowMs}`,
        symbol,
        targetPrice: drawing.endPrice,
        trendlinePoints: {
          startTime: drawing.startTime,
          startPrice: drawing.startPrice,
          endTime: drawing.endTime,
          endPrice: drawing.endPrice,
        },
        condition: "crossing",
        frequency: "only_once",
        sourceType: "trendline",
        drawingId: drawing.id,
        label: drawing.text
          ? `Trendline (${drawing.text})`
          : `Trendline Ray Cross`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
        notifyDiscord: true,
        notifyTelegram: true,
      },
    ];
  }

  if (drawing.type === "rectangle") {
    const topPrice = Math.max(drawing.startPrice, drawing.endPrice);
    const bottomPrice = Math.min(drawing.startPrice, drawing.endPrice);
    return [
      {
        id: `alert-${drawing.id}-rect-top-${nowMs}`,
        symbol,
        targetPrice: topPrice,
        condition: "crossing_up",
        frequency: "only_once",
        sourceType: "rectangle",
        drawingId: drawing.id,
        label: `Rect Resistance Breakout @ $${topPrice.toFixed(2)}`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
        notifyDiscord: true,
        notifyTelegram: true,
      },
      {
        id: `alert-${drawing.id}-rect-bot-${nowMs}`,
        symbol,
        targetPrice: bottomPrice,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "rectangle",
        drawingId: drawing.id,
        label: `Rect Support Breakdown @ $${bottomPrice.toFixed(2)}`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
        notifyDiscord: true,
        notifyTelegram: true,
      },
    ];
  }

  if (drawing.type === "long_position" || drawing.type === "short_position") {
    const isLong = drawing.type === "long_position";
    const tpPrice = drawing.endPrice;
    const slPrice =
      drawing.stopPrice ??
      (isLong ? drawing.startPrice * 0.99 : drawing.startPrice * 1.01);

    return [
      {
        id: `alert-${drawing.id}-tp-${nowMs}`,
        symbol,
        targetPrice: tpPrice,
        condition: isLong ? "crossing_up" : "crossing_down",
        frequency: "only_once",
        sourceType: "position_tp",
        drawingId: drawing.id,
        label: `${isLong ? "Long" : "Short"} Take Profit @ $${tpPrice.toFixed(2)}`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
        notifyDiscord: true,
        notifyTelegram: true,
      },
      {
        id: `alert-${drawing.id}-sl-${nowMs}`,
        symbol,
        targetPrice: slPrice,
        condition: isLong ? "crossing_down" : "crossing_up",
        frequency: "only_once",
        sourceType: "position_sl",
        drawingId: drawing.id,
        label: `${isLong ? "Long" : "Short"} Stop Loss @ $${slPrice.toFixed(2)}`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
        notifyDiscord: true,
        notifyTelegram: true,
      },
    ];
  }

  // Fallback for any other drawing tool: create a crossing alert at startPrice
  return [
    {
      id: `alert-${drawing.id}-generic-${nowMs}`,
      symbol,
      targetPrice: drawing.startPrice,
      condition: "crossing",
      frequency: "only_once",
      sourceType: "price",
      drawingId: drawing.id,
      label: `${drawing.type.replace("_", " ").toUpperCase()} @ $${drawing.startPrice.toFixed(2)}`,
      active: true,
      triggeredCount: 0,
      createdAt: nowMs,
    },
  ];
}

/**
 * Synthesizes an institutional dual-tone bell chime (A5 -> E6) using Web Audio API.
 */
export function playInstitutionalAlertChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // First tone: A5 (880 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.14, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Second tone: E6 (1318.5 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1318.5, now + 0.12);
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.setValueAtTime(0.16, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.48);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

// Re-export Webhook Dispatcher types (DEC-130)
export * from "./webhook-dispatcher";
