import { CandlestickBar } from "@/lib/mexc/types";
import { PriceAlert, normalizeAlertTimeframe } from "@/lib/alerts/alerts-engine";
import { buildEmaTouchAlert, computeLatestEmaLevels, formatEmaPrice } from "@/lib/alerts/ema-alerts";
import type { EmaPeriod } from "@/lib/indicators/mtf-ema/types";
import {
  SUPPORTED_EXCHANGES,
  SupportedExchange,
} from "@/lib/screener/multi-exchange-client";
import type { MexcRankedToken } from "@/lib/alerts/auto-ob-fvg-engine";

export interface AutoEmaSetup extends MexcRankedToken {
  id: string;
  exchange: "bybit" | "binance";
  exchangeLabel: string;
  timeframe: string;
  period: EmaPeriod;
  emaPrice: number;
  currentPrice: number;
  distancePct: number;
  direction: "SUPPORT" | "RESISTANCE";
}

export function detectEmaSetups(
  bars: CandlestickBar[],
  token: MexcRankedToken,
  timeframe: string,
  exchange: "bybit" | "binance",
  options: { livePriceOverride?: number; maxDistancePct?: number } = {}
): AutoEmaSetup[] {
  if (!Array.isArray(bars) || bars.length < 20) return [];
  const currentPrice = options.livePriceOverride && options.livePriceOverride > 0
    ? options.livePriceOverride
    : bars[bars.length - 1].close;
  if (!(currentPrice > 0)) return [];

  const levels = computeLatestEmaLevels(bars.map((bar) => bar.close));
  const tf = normalizeAlertTimeframe(timeframe) || timeframe;
  const maxDistancePct = Math.max(0, options.maxDistancePct ?? 5);
  const exchangeLabel = SUPPORTED_EXCHANGES[exchange]?.badgeLabel || exchange.toUpperCase();

  return ([20, 50, 100, 200] as const).flatMap((period) => {
    const emaPrice = levels[`ema${period}`];
    if (typeof emaPrice !== "number" || !Number.isFinite(emaPrice) || emaPrice <= 0) return [];
    const distancePct = (Math.abs(currentPrice - emaPrice) / currentPrice) * 100;
    if (distancePct > maxDistancePct) return [];
    return [{
      ...token,
      id: `${exchange}|${token.symbol}|${tf}|${period}`,
      exchange,
      exchangeLabel,
      timeframe: tf,
      period,
      emaPrice,
      currentPrice,
      distancePct,
      direction: currentPrice > emaPrice ? "SUPPORT" as const : "RESISTANCE" as const,
    }];
  });
}

export function buildAutoEmaAlarm(
  setup: AutoEmaSetup,
  options: {
    notifyDiscord?: boolean;
    notifyTelegram?: boolean;
    notifyTradingWebhook?: boolean;
    now?: number;
    randSuffix?: number;
  } = {}
): PriceAlert {
  const alert = buildEmaTouchAlert({
    idPrefix: "auto",
    symbol: setup.symbol,
    timeframe: setup.timeframe,
    period: setup.period,
    emaPrice: setup.emaPrice,
    currentPrice: setup.currentPrice,
    exchange: setup.exchange as SupportedExchange,
    notifyDiscord: options.notifyDiscord,
    notifyTelegram: options.notifyTelegram,
    notifyTradingWebhook: options.notifyTradingWebhook,
    now: options.now,
    randSuffix: options.randSuffix,
  });
  alert.id = `auto-ema-${setup.exchange}-${setup.symbol}-${setup.timeframe}-${setup.period}-${options.now ?? Date.now()}-${options.randSuffix ?? 0}`;
  alert.label = `${setup.symbol.replace("USDT", "")} ${setup.timeframe} EMA ${setup.period} Hit (${setup.exchange.toUpperCase()})`;
  alert.conditionMessage = `[${setup.exchange.toUpperCase()} Perps] Price hit ${setup.timeframe} EMA ${setup.period} @ $${formatEmaPrice(setup.emaPrice)} (${setup.direction})`;
  return alert;
}

function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().trim().replace(/[\/_-]/g, "");
}

function getAlertExchange(alert: PriceAlert): string {
  return alert.exchange || "mexc";
}

export function selectNonDuplicateAutoEmaAlarms(
  setups: AutoEmaSetup[],
  existingAlerts: PriceAlert[],
  options: Parameters<typeof buildAutoEmaAlarm>[1] = {}
): { alertsToArm: PriceAlert[]; skippedDuplicatesCount: number } {
  const seen = new Set(existingAlerts
    .filter((alert) => alert.active && alert.emaMetadata)
    .map((alert) => `${getAlertExchange(alert)}|${normalizeSymbol(alert.symbol)}|${normalizeAlertTimeframe(alert.emaMetadata!.timeframe)}|${alert.emaMetadata!.period}`));

  const alertsToArm: PriceAlert[] = [];
  let skippedDuplicatesCount = 0;
  setups.forEach((setup, index) => {
    const key = `${setup.exchange}|${normalizeSymbol(setup.symbol)}|${normalizeAlertTimeframe(setup.timeframe)}|${setup.period}`;
    if (seen.has(key)) {
      skippedDuplicatesCount++;
      return;
    }
    seen.add(key);
    alertsToArm.push(buildAutoEmaAlarm(setup, { ...options, randSuffix: index }));
  });
  return { alertsToArm, skippedDuplicatesCount };
}

