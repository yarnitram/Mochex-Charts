import { CandlestickBar } from "@/lib/mexc/types";
import {
  computeValidatedOrderBlocks,
  ObZoneType,
  ValidatedOrderBlock,
} from "@/lib/indicators/validated-ob-engine";
import { formatPoiPrice } from "@/lib/indicators/radar-poi-engine";
import {
  CuratedCoin,
  MAJORS_UNIVERSE,
  TOP_150_MEMES,
  TOP_150_AI,
} from "@/lib/screener/universe-catalog";
import {
  ExchangeTicker,
  SupportedExchange,
  SUPPORTED_EXCHANGES,
  mapSymbolForPerpExchange,
} from "@/lib/screener/multi-exchange-client";
import {
  normalizeAlertTimeframe,
  PriceAlert,
} from "@/lib/alerts/alerts-engine";

export type AutoObCategory = "majors" | "memes" | "ai" | "all";
export type ObSearchExchangePreference = "auto" | "bybit" | "binance";
export type AutoObTouchMode = "entry" | "fifty_pct";

export const MAX_AUTO_OB_TOP_LIMIT = 600;

export interface MexcRankedToken {
  symbol: string;
  name: string;
  category: "majors" | "memes" | "ai";
  mexcRank: number;
  mexcPrice: number;
  mexcVolume24h: number;
  mexcChange24h: number;
}

export interface AutoObFvgSetup {
  id: string;
  symbol: string;
  name: string;
  tokenCategory: "majors" | "memes" | "ai";
  mexcRank: number;
  mexcVolume24h: number;
  mexcPrice: number;
  mexcChange24h: number;
  exchange: "bybit" | "binance";
  exchangeLabel: string;
  timeframe: string;
  pattern: "RGG" | "GRR";
  type: "BULLISH" | "BEARISH";
  zoneType: ObZoneType;
  top: number;
  bottom: number;
  meanThreshold: number;
  entryPrice: number;
  fullRetestPrice: number;
  fvgTop: number;
  fvgBottom: number;
  fvgGapPct: number;
  currentPrice: number;
  distanceToEntryPct: number;
  obTime: number;
  confirmTime: number;
  zoneRangeText: string;
  spreadPct: number;
  touched: false;
}

function normalizeSymbolKey(sym: string): string {
  return sym.toUpperCase().trim().replace(/[\/\-_]/g, "");
}

export function getCatalogCoinsForCategory(category: AutoObCategory): CuratedCoin[] {
  if (category === "majors") return MAJORS_UNIVERSE;
  if (category === "memes") return TOP_150_MEMES;
  if (category === "ai") return TOP_150_AI;

  const seen = new Set<string>();
  const combined: CuratedCoin[] = [];
  for (const c of [...MAJORS_UNIVERSE, ...TOP_150_MEMES, ...TOP_150_AI]) {
    const key = normalizeSymbolKey(c.symbol);
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(c);
    }
  }
  return combined;
}

export function getCatalogCategoryCount(category: AutoObCategory): number {
  return getCatalogCoinsForCategory(category).length;
}

/**
 * Ranks tokens from the 3 curated universes using live MEXC Futures 24h volume
 * so we discover the top active tokens on MEXC before scanning Bybit / Binance for OBs.
 * When `category === "all"` and `limit` exceeds the combined catalog size, additional
 * live MEXC USDT perpetual pairs are appended by 24h volume.
 */
export function rankTopTokensOnMexc(
  category: AutoObCategory,
  mexcTickers: Map<string, ExchangeTicker>,
  limit = 30
): MexcRankedToken[] {
  const coins = getCatalogCoinsForCategory(category);
  const seenSymbols = new Set<string>();

  const enriched = coins.map((c, idx) => {
    const cleanSym = normalizeSymbolKey(c.symbol);
    seenSymbols.add(cleanSym);
    const ticker = mexcTickers.get(cleanSym) || mexcTickers.get(c.symbol.toUpperCase());
    return {
      symbol: cleanSym,
      name: c.name,
      category: c.category,
      catalogIdx: idx,
      mexcPrice: ticker?.price ?? 0,
      mexcVolume24h: ticker?.volume24h ?? 0,
      mexcChange24h: ticker?.change24h ?? 0,
    };
  });

  const cappedLimit = Math.max(1, Math.min(MAX_AUTO_OB_TOP_LIMIT, Math.floor(limit)));

  if (category === "all" && cappedLimit > enriched.length && mexcTickers.size > 0) {
    let extraIdx = enriched.length;
    for (const [rawKey, ticker] of mexcTickers.entries()) {
      const cleanSym = normalizeSymbolKey(ticker?.symbol || rawKey);
      if (
        !cleanSym.endsWith("USDT") ||
        cleanSym.length <= 4 ||
        seenSymbols.has(cleanSym) ||
        !(ticker?.price > 0)
      ) {
        continue;
      }
      seenSymbols.add(cleanSym);
      enriched.push({
        symbol: cleanSym,
        name: cleanSym.slice(0, -4),
        category: "majors",
        catalogIdx: extraIdx++,
        mexcPrice: ticker.price,
        mexcVolume24h: ticker.volume24h ?? 0,
        mexcChange24h: ticker.change24h ?? 0,
      });
    }
  }

  enriched.sort((a, b) => {
    if (b.mexcVolume24h !== a.mexcVolume24h) {
      return b.mexcVolume24h - a.mexcVolume24h;
    }
    return a.catalogIdx - b.catalogIdx;
  });

  return enriched.slice(0, cappedLimit).map((item, rankIdx) => ({
    symbol: item.symbol,
    name: item.name,
    category: item.category,
    mexcRank: rankIdx + 1,
    mexcPrice: item.mexcPrice,
    mexcVolume24h: item.mexcVolume24h,
    mexcChange24h: item.mexcChange24h,
  }));
}

export function resolveCandidateExchanges(
  preference: ObSearchExchangePreference
): Array<"bybit" | "binance"> {
  if (preference === "bybit") return ["bybit"];
  if (preference === "binance") return ["binance"];
  return ["bybit", "binance"];
}

export function pickObExchangeForToken(
  symbol: string,
  preference: ObSearchExchangePreference,
  exchangeTickers: Partial<Record<"bybit" | "binance", Map<string, ExchangeTicker>>>
): { exchange: "bybit" | "binance"; ticker?: ExchangeTicker } | null {
  const order = resolveCandidateExchanges(preference);
  const hasAnyTickerData =
    (exchangeTickers.bybit?.size ?? 0) > 0 || (exchangeTickers.binance?.size ?? 0) > 0;

  for (const ex of order) {
    const map = exchangeTickers[ex];
    if (!map || map.size === 0) continue;
    const mappedSym = mapSymbolForPerpExchange(ex, symbol);
    const ticker = map.get(symbol.toUpperCase()) || map.get(mappedSym);
    if (ticker && ticker.price > 0) {
      return { exchange: ex, ticker };
    }
  }

  // Fallback when no ticker maps were preloaded (e.g., direct probe or tests)
  if (!hasAnyTickerData) {
    return { exchange: order[0] };
  }
  return null;
}

/**
 * Filters bars through strict 3-Candle RGG/GRR OB+FVG validation requiring:
 * 1) Closed Candle 3 confirmation (`confirmClosedOnly: true`)
 * 2) Mandatory FVG wick gap
 * 3) Zero mitigation (`mitigationMode: "first_touch"`, `touched === false`, `0% hit`)
 * 4) Live price strictly outside the zone boundary so the touch alarm isn't already breached
 */
export function detectUnmitigatedObFvgBars(
  bars: CandlestickBar[],
  token: MexcRankedToken,
  timeframe: string,
  exchange: "bybit" | "binance",
  options: {
    minGapPct?: number;
    minDisplacementPct?: number;
    obZoneType?: ObZoneType;
    livePriceOverride?: number;
  } = {}
): AutoObFvgSetup[] {
  if (!bars || bars.length < 4) return [];

  const canonicalTf = normalizeAlertTimeframe(timeframe);
  const obZoneType = options.obZoneType || "full";
  const blocks: ValidatedOrderBlock[] = computeValidatedOrderBlocks(
    bars,
    token.symbol,
    canonicalTf,
    {
      enableBullishRgg: true,
      enableBearishGrr: true,
      requireValidFvg: true,
      minGapPct: options.minGapPct ?? 0,
      minDisplacementPct: options.minDisplacementPct ?? 0,
      obZoneType,
      confirmClosedOnly: true,
      mitigationMode: "first_touch",
      includeMitigated: false,
      includeBroken: false,
      maxActiveObZones: 50,
      maxResults: 20,
    }
  );

  const barLastClose = bars[bars.length - 1].close;
  const currentPrice =
    options.livePriceOverride && options.livePriceOverride > 0
      ? options.livePriceOverride
      : barLastClose;

  const exchangeLabel = SUPPORTED_EXCHANGES[exchange]?.badgeLabel || exchange.toUpperCase();
  const results: AutoObFvgSetup[] = [];

  for (const ob of blocks) {
    if (ob.touched || ob.lifecycleState !== "ACTIVE") continue;

    // Live ticker guard: ensure current exchange price hasn't already touched/entered the OB
    if (ob.type === "BULLISH" && currentPrice <= ob.top) continue;
    if (ob.type === "BEARISH" && currentPrice >= ob.bottom) continue;

    const low = Math.min(ob.bottom, ob.top);
    const high = Math.max(ob.bottom, ob.top);
    const spreadPct = low > 0 ? ((high - low) / low) * 100 : 0;
    const distEntry =
      currentPrice > 0
        ? (Math.abs(currentPrice - ob.entryPrice) / currentPrice) * 100
        : 0;

    results.push({
      id: `${exchange}-${ob.id}`,
      symbol: token.symbol,
      name: token.name,
      tokenCategory: token.category,
      mexcRank: token.mexcRank,
      mexcVolume24h: token.mexcVolume24h,
      mexcPrice: token.mexcPrice,
      mexcChange24h: token.mexcChange24h,
      exchange,
      exchangeLabel,
      timeframe: canonicalTf,
      pattern: ob.pattern || (ob.type === "BULLISH" ? "RGG" : "GRR"),
      type: ob.type,
      zoneType: obZoneType,
      top: high,
      bottom: low,
      meanThreshold: ob.meanThreshold,
      entryPrice: ob.entryPrice,
      fullRetestPrice: ob.fullRetestPrice,
      fvgTop: ob.fvgTop,
      fvgBottom: ob.fvgBottom,
      fvgGapPct: ob.fvgGapPct,
      currentPrice,
      distanceToEntryPct: distEntry,
      obTime: ob.obTime,
      confirmTime: ob.confirmTime ?? ob.fvgTime,
      zoneRangeText: `$${formatPoiPrice(low)} - $${formatPoiPrice(high)}`,
      spreadPct,
      touched: false,
    });
  }

  return results;
}

export function buildAutoObFvgAlarm(
  setup: AutoObFvgSetup,
  options: {
    touchMode?: AutoObTouchMode;
    notifyDiscord?: boolean;
    notifyTelegram?: boolean;
    notifyTradingWebhook?: boolean;
    notifyOnInvalidation?: boolean;
    now?: number;
    randSuffix?: number;
  } = {}
): PriceAlert {
  const touchMode = options.touchMode || "entry";
  const targetPrice = touchMode === "fifty_pct" ? setup.meanThreshold : setup.entryPrice;
  const touchLabel = touchMode === "fifty_pct" ? "50% MT" : "OB Entry";
  const now = options.now ?? Date.now();
  const rand = options.randSuffix ?? Math.floor(Math.random() * 10000);
  const exTag = setup.exchange.toUpperCase();

  return {
    id: `auto-ob-${setup.exchange}-${setup.symbol}-${setup.timeframe}-${setup.obTime}-${now}-${rand}`,
    symbol: setup.symbol.toUpperCase(),
    targetPrice,
    condition: setup.type === "BULLISH" ? "crossing_down" : "crossing_up",
    frequency: "only_once",
    sourceType: "indicator_condition",
    indicatorName: `Validated OB + FVG (${setup.pattern})`,
    label: `${setup.symbol.replace("USDT", "")} ${setup.timeframe} ${setup.type} OB (${setup.pattern} • ${exTag}) [${touchLabel}]`,
    conditionMessage: `[${exTag} Perps] ${setup.type} ${setup.pattern} OB+FVG touched ${touchLabel} @ $${formatPoiPrice(targetPrice)} (Range ${setup.zoneRangeText})`,
    active: true,
    triggeredCount: 0,
    createdAt: now,
    notifyDiscord: options.notifyDiscord ?? true,
    notifyTelegram: options.notifyTelegram ?? true,
    notifyTradingWebhook: options.notifyTradingWebhook ?? false,
    notifyOnInvalidation: options.notifyOnInvalidation ?? true,
    invalidationPrice: setup.fullRetestPrice,
    exchange: setup.exchange as SupportedExchange,
    poiMetadata: {
      poiId: setup.id,
      category: "order_block",
      direction: setup.type,
      timeframe: setup.timeframe,
      zoneTop: setup.top,
      zoneBottom: setup.bottom,
      invalidationPrice: setup.fullRetestPrice,
      pattern: setup.pattern,
      autoArmed: true,
      exchange: setup.exchange,
    },
  };
}

/**
 * Deduplicates candidate setups against existing armed alerts so repeated auto-scans
 * never arm duplicate alarms for the same unmitigated OB+FVG zone or identical trigger level.
 */
export function selectNonDuplicateAutoAlarms(
  setups: AutoObFvgSetup[],
  existingAlerts: PriceAlert[],
  options: {
    touchMode?: AutoObTouchMode;
    notifyDiscord?: boolean;
    notifyTelegram?: boolean;
    notifyTradingWebhook?: boolean;
    notifyOnInvalidation?: boolean;
    now?: number;
  } = {}
): { alertsToArm: PriceAlert[]; skippedDuplicatesCount: number } {
  const seenPoiIds = new Set<string>();
  const seenPriceKeys = new Set<string>();

  for (const a of existingAlerts) {
    if (!a) continue;
    if (a.poiMetadata?.poiId) {
      seenPoiIds.add(a.poiMetadata.poiId);
    }
    const sym = normalizeSymbolKey(a.symbol);
    const tf = normalizeAlertTimeframe(a.poiMetadata?.timeframe || "");
    const priceKey = Number.isFinite(a.targetPrice)
      ? Number(a.targetPrice.toPrecision(8)).toString()
      : String(a.targetPrice);
    const ex = a.exchange || a.poiMetadata?.exchange || "mexc";
    seenPriceKeys.add(`${ex}|${sym}|${tf}|${priceKey}`);
  }

  const alertsToArm: PriceAlert[] = [];
  let skippedDuplicatesCount = 0;

  for (let i = 0; i < setups.length; i++) {
    const setup = setups[i];
    if (seenPoiIds.has(setup.id)) {
      skippedDuplicatesCount++;
      continue;
    }

    const candidate = buildAutoObFvgAlarm(setup, {
      ...options,
      randSuffix: i,
    });
    const priceKey = Number.isFinite(candidate.targetPrice)
      ? Number(candidate.targetPrice.toPrecision(8)).toString()
      : String(candidate.targetPrice);
    const composite = `${setup.exchange}|${normalizeSymbolKey(setup.symbol)}|${normalizeAlertTimeframe(setup.timeframe)}|${priceKey}`;

    if (seenPriceKeys.has(composite)) {
      skippedDuplicatesCount++;
      continue;
    }

    seenPoiIds.add(setup.id);
    seenPriceKeys.add(composite);
    alertsToArm.push(candidate);
  }

  return { alertsToArm, skippedDuplicatesCount };
}
