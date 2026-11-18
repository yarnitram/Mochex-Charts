import { calculateEma } from "@/lib/indicators/mtf-ema/ema-calculator";
import { EmaPeriod } from "@/lib/indicators/mtf-ema/types";
import {
  AlertCondition,
  PriceAlert,
  normalizeAlertTimeframe,
} from "./alerts-engine";
import { SupportedExchange } from "@/lib/screener/multi-exchange-client";

export interface TimeframeEmaLevels {
  ema100: number | null;
  ema200: number | null;
  ema20?: number | null;
  ema50?: number | null;
}

const TIMEFRAME_ALIAS_MAP: Record<string, string[]> = {
  "15m": ["15m", "15"],
  "30m": ["30m", "30"],
  "60": ["60", "1H", "1h", "60m"],
  "1H": ["1H", "60", "1h", "60m"],
  "120": ["120", "2H", "2h", "120m"],
  "2H": ["2H", "120", "2h", "120m"],
  "240": ["240", "4H", "4h", "240m"],
  "4H": ["4H", "240", "4h", "240m"],
  "1D": ["1D", "1d", "D", "1440"],
  "1W": ["1W", "1w", "W", "10080"],
};

/**
 * Resolves a timeframe-keyed dictionary even when callers use equivalent labels ("1H" vs "60").
 */
export function resolveTimeframeValue<T>(
  byTimeframe: Record<string, T> | undefined,
  tf: string
): T | undefined {
  if (!byTimeframe) return undefined;
  if (byTimeframe[tf] !== undefined) return byTimeframe[tf];
  const alternatives = TIMEFRAME_ALIAS_MAP[tf] || TIMEFRAME_ALIAS_MAP[normalizeAlertTimeframe(tf)] || [];
  for (const alt of alternatives) {
    if (byTimeframe[alt] !== undefined) {
      return byTimeframe[alt];
    }
  }
  return undefined;
}

/**
 * Extracts the latest finite EMA value for `period` from chronological closing prices.
 */
export function getLatestEmaValue(closes: number[], period: EmaPeriod): number | null {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const series = calculateEma(closes, period);
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      return v;
    }
  }
  return null;
}

/**
 * Computes the latest supported EMA levels from chronological closes.
 */
export function computeLatestEmaLevels(closes: number[]): TimeframeEmaLevels {
  return {
    ema20: getLatestEmaValue(closes, 20),
    ema50: getLatestEmaValue(closes, 50),
    ema100: getLatestEmaValue(closes, 100),
    ema200: getLatestEmaValue(closes, 200),
  };
}

/** Keeps the established 100/200 result shape for existing consumers. */
export function computeLatestEma100And200(closes: number[]): TimeframeEmaLevels {
  const levels = computeLatestEmaLevels(closes);
  return { ema100: levels.ema100, ema200: levels.ema200 };
}

export interface BuildEmaAlertParams {
  idPrefix?: "alert" | "bulk" | "auto";
  symbol: string;
  timeframe: string;
  period: EmaPeriod;
  emaPrice: number;
  currentPrice?: number;
  notifyDiscord?: boolean;
  notifyTelegram?: boolean;
  notifyTradingWebhook?: boolean;
  soundType?: string;
  exchange?: SupportedExchange;
  now?: number;
  randSuffix?: number;
}

/**
 * Formats an EMA target price consistently across asset scales.
 */
export function formatEmaPrice(price: number): string {
  if (!Number.isFinite(price)) return "0.00";
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(5);
  return price.toFixed(6);
}

/**
 * Constructs a 24/7 hit alarm for the selected EMA period and timeframe.
 */
export function buildEmaTouchAlert({
  idPrefix = "alert",
  symbol,
  timeframe,
  period,
  emaPrice,
  currentPrice = 0,
  notifyDiscord = true,
  notifyTelegram = true,
  notifyTradingWebhook = false,
  soundType,
  exchange,
  now = Date.now(),
  randSuffix = Math.floor(Math.random() * 1000),
}: BuildEmaAlertParams): PriceAlert {
  const normSym = symbol.toUpperCase().replace(/[\/\-_]/g, "");
  const cleanSym = normSym.replace("USDT", "");
  const normTf = normalizeAlertTimeframe(timeframe) || timeframe;

  let direction: "SUPPORT" | "RESISTANCE" | undefined;
  let condition: AlertCondition = "crossing";
  if (Number.isFinite(currentPrice) && currentPrice > 0) {
    if (currentPrice > emaPrice) {
      direction = "SUPPORT";
      condition = "crossing_down";
    } else if (currentPrice < emaPrice) {
      direction = "RESISTANCE";
      condition = "crossing_up";
    }
  }

  return {
    id: `${idPrefix}-ema-${normSym}-${normTf}-${period}-${now}-${randSuffix}`,
    symbol: normSym,
    targetPrice: emaPrice,
    condition,
    frequency: "only_once",
    sourceType: "indicator_condition",
    indicatorName: `EMA ${period}`,
    label: `${cleanSym} ${normTf} EMA ${period} Hit`,
    conditionMessage: `Price hit ${normTf} EMA ${period} @ $${formatEmaPrice(emaPrice)}`,
    active: true,
    triggeredCount: 0,
    createdAt: now,
    notifyDiscord,
    notifyTelegram,
    notifyTradingWebhook,
    soundType,
    exchange,
    emaMetadata: {
      period,
      timeframe: normTf,
      direction,
      autoArmed: idPrefix === "auto",
    },
  };
}
