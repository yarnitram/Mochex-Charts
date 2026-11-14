import { CandlestickBar } from "@/lib/mexc/types";

export type SupportedExchange = "mexc" | "binance" | "bybit";
export type ExchangeFilter = "all" | SupportedExchange;

export interface ExchangeConfig {
  id: SupportedExchange;
  name: string;
  shortName: string;
  badgeLabel: string;
  marketType: "spot" | "perpetual";
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  apiBase: string;
}

export const SUPPORTED_EXCHANGES: Record<SupportedExchange, ExchangeConfig> = {
  mexc: {
    id: "mexc",
    name: "MEXC Futures (USDT-M)",
    shortName: "MEXC",
    badgeLabel: "MEXC Perps",
    marketType: "perpetual",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-400",
    badgeBorder: "border-emerald-500/20",
    apiBase: "https://contract.mexc.com",
  },
  binance: {
    id: "binance",
    name: "Binance Futures (USDT-M)",
    shortName: "BINANCE",
    badgeLabel: "Binance Perps",
    marketType: "perpetual",
    badgeBg: "bg-amber-500/10",
    badgeText: "text-amber-400",
    badgeBorder: "border-amber-500/20",
    apiBase: "https://fapi.binance.com",
  },
  bybit: {
    id: "bybit",
    name: "Bybit Linear Perpetuals",
    shortName: "BYBIT",
    badgeLabel: "Bybit Perps",
    marketType: "perpetual",
    badgeBg: "bg-orange-500/10",
    badgeText: "text-orange-400",
    badgeBorder: "border-orange-500/20",
    apiBase: "https://api.bybit.com",
  },
};

export interface ExchangeTicker {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  exchange: SupportedExchange;
}

/**
 * Normalizes common timeframes into the target exchange's expected interval parameter.
 */
export function normalizeIntervalForExchange(
  exchange: SupportedExchange,
  interval: string
): string {
  const raw = interval.trim();
  const norm = raw.toLowerCase();
  switch (exchange) {
    case "mexc":
      if (raw === "1M" || raw === "M") return "1M";
      if (norm === "15m" || norm === "15") return "15m";
      if (norm === "30m" || norm === "30") return "30m";
      if (norm === "1h" || norm === "60" || norm === "60m") return "60m";
      if (norm === "2h" || norm === "120" || norm === "120m") return "60m";
      if (norm === "4h" || norm === "240") return "4h";
      if (norm === "1d" || norm === "d") return "1d";
      if (norm === "1w" || norm === "w") return "1W";
      if (norm === "1m" || norm === "1") return "1m";
      if (norm === "5m" || norm === "5") return "5m";
      return "4h";

    case "binance":
      if (norm === "15m" || norm === "15") return "15m";
      if (norm === "30m" || norm === "30") return "30m";
      if (norm === "1h" || norm === "60") return "1h";
      if (norm === "2h" || norm === "120") return "2h";
      if (norm === "4h" || norm === "240") return "4h";
      if (norm === "1d" || norm === "d") return "1d";
      if (norm === "1w" || norm === "w") return "1w";
      if (norm === "1m" || norm === "1") return "1m";
      if (norm === "5m" || norm === "5") return "5m";
      return "4h";

    case "bybit":
      if (norm === "15m" || norm === "15") return "15";
      if (norm === "30m" || norm === "30") return "30";
      if (norm === "1h" || norm === "60") return "60";
      if (norm === "2h" || norm === "120") return "120";
      if (norm === "4h" || norm === "240") return "240";
      if (norm === "1d" || norm === "d") return "D";
      if (norm === "1w" || norm === "w") return "W";
      if (norm === "1m" || norm === "1") return "1";
      if (norm === "5m" || norm === "5") return "5";
      return "240";

    default:
      return "240";
  }
}

/**
 * Converts Binance raw klines array into CandlestickBar array.
 * Binance format: [ openTime, open, high, low, close, volume, closeTime, quoteVol, ... ]
 */
export function convertBinanceKlines(raw: any[]): CandlestickBar[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k) => ({
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .filter((b) => !isNaN(b.time) && !isNaN(b.close) && b.close > 0);
}

/**
 * Converts Bybit V5 raw klines list into CandlestickBar array.
 * Bybit format: [ startTime, open, high, low, close, volume, turnover ]
 * Bybit returns newest candle first, so we reverse to chronological order.
 */
export function convertBybitKlines(raw: any[]): CandlestickBar[] {
  if (!Array.isArray(raw)) return [];
  const list = [...raw].reverse();
  return list
    .map((k) => ({
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .filter((b) => !isNaN(b.time) && !isNaN(b.close) && b.close > 0);
}

const MEXC_SPOT_TO_CONTRACT_ALIASES: Record<string, string> = {
  FILUSDT: "FILECOIN_USDT",
  ZKUSDT: "ZKSYNC_USDT",
  PUMPUSDT: "PUMPFUN_USDT",
  TRUMPUSDT: "TRUMPOFFICIAL_USDT",
  OPENUSDT: "OPENLEDGER_USDT",
};

const MEXC_CONTRACT_TO_CANONICAL: Record<string, string> = {
  FILECOIN_USDT: "FILECOINUSDT",
  ZKSYNC_USDT: "ZKSYNCUSDT",
  PUMPFUN_USDT: "PUMPFUNUSDT",
  TRUMPOFFICIAL_USDT: "TRUMPOFFICIALUSDT",
  OPENLEDGER_USDT: "OPENLEDGERUSDT",
};

/**
 * Converts canonical symbol (e.g. "BTCUSDT") to MEXC Perpetual contract symbol ("BTC_USDT").
 */
export function toMexcContractSymbol(symbol: string): string {
  const clean = symbol.toUpperCase().trim().replace(/[\/\-_]/g, "");
  if (MEXC_SPOT_TO_CONTRACT_ALIASES[clean]) {
    return MEXC_SPOT_TO_CONTRACT_ALIASES[clean];
  }
  if (clean.endsWith("USDT") && !clean.includes("_")) {
    return `${clean.slice(0, -4)}_USDT`;
  }
  return clean;
}

/**
 * Converts MEXC Perpetual contract symbol (e.g. "BTC_USDT") back to canonical "BTCUSDT".
 */
export function fromMexcContractSymbol(contractSym: string): string {
  const upper = contractSym.toUpperCase().trim();
  if (MEXC_CONTRACT_TO_CANONICAL[upper]) return MEXC_CONTRACT_TO_CANONICAL[upper];
  return upper.replace("_", "");
}

/**
 * Maps canonical MEXC Futures symbol to Binance/Bybit Perpetual Futures equivalents
 * when contract naming differs (e.g. PEPEUSDT -> 1000PEPEUSDT, FILECOINUSDT -> FILUSDT).
 */
export function mapSymbolForPerpExchange(
  exchange: SupportedExchange,
  symbol: string
): string {
  const clean = symbol.toUpperCase().trim().replace(/[\/\-_]/g, "");
  if (exchange === "mexc") return clean;

  const sharedAliases: Record<string, string> = {
    PEPEUSDT: "1000PEPEUSDT",
    SHIBUSDT: "1000SHIBUSDT",
    FLOKIUSDT: "1000FLOKIUSDT",
    SATSUSDT: "1000SATSUSDT",
    FILECOINUSDT: "FILUSDT",
    ZKSYNCUSDT: "ZKUSDT",
    PUMPFUNUSDT: "PUMPUSDT",
    TRUMPOFFICIALUSDT: "TRUMPUSDT",
    OPENLEDGERUSDT: "OPENUSDT",
    LUNANEWUSDT: "LUNA2USDT",
  };
  if (sharedAliases[clean]) return sharedAliases[clean];
  if (exchange === "binance" && clean === "1000000BABYDOGEUSDT") return "1MBABYDOGEUSDT";
  return clean;
}

/**
 * Normalizes timeframe strings for MEXC Perpetual Futures kline API.
 */
export function normalizeMexcContractInterval(resolution: string): string {
  const raw = resolution.trim();
  const norm = raw.toLowerCase();
  if (raw === "1M" || raw === "M") return "Month1";
  if (norm === "1w" || norm === "w") return "Week1";
  if (norm === "1d" || norm === "d") return "Day1";
  if (norm === "4h" || norm === "240") return "Hour4";
  if (norm === "1h" || norm === "60" || norm === "60m" || norm === "2h" || norm === "120" || norm === "120m") {
    return "Min60";
  }
  if (norm === "30m" || norm === "30") return "Min30";
  if (norm === "15m" || norm === "15") return "Min15";
  if (norm === "5m" || norm === "5") return "Min5";
  if (norm === "1m" || norm === "1") return "Min1";
  return "Hour4";
}

/**
 * Converts MEXC Futures contract kline object `{ time[], open[], high[], low[], close[], vol[] }`
 * into chronological CandlestickBar[].
 */
export function convertMexcContractKlines(rawData: {
  time?: number[];
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  vol?: number[];
} | null | undefined): CandlestickBar[] {
  if (!rawData || !Array.isArray(rawData.time) || !Array.isArray(rawData.close)) return [];
  const len = rawData.time.length;
  const bars: CandlestickBar[] = [];
  for (let i = 0; i < len; i++) {
    const rawTime = Number(rawData.time[i]);
    const timeMs = rawTime < 1e12 ? rawTime * 1000 : rawTime;
    const close = Number(rawData.close[i]);
    if (!Number.isFinite(timeMs) || !Number.isFinite(close) || close <= 0) continue;
    bars.push({
      time: timeMs,
      open: Number(rawData.open?.[i] ?? close),
      high: Number(rawData.high?.[i] ?? close),
      low: Number(rawData.low?.[i] ?? close),
      close,
      volume: Number(rawData.vol?.[i] ?? 0),
    });
  }
  return bars;
}

/**
 * Converts MEXC raw klines array into CandlestickBar array.
 */
export function convertMexcKlines(raw: any[]): CandlestickBar[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k) => ({
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .filter((b) => !isNaN(b.time) && !isNaN(b.close) && b.close > 0);
}

/**
 * Aggregates smaller duration bars into higher timeframe bars (e.g. 1h -> 2h).
 */
export function aggregateBars(bars: CandlestickBar[], factor = 2): CandlestickBar[] {
  if (!bars || bars.length < factor) return bars;
  const bucketMs = factor * 3600 * 1000;
  const map = new Map<number, CandlestickBar>();
  for (const b of bars) {
    const bucketTime = Math.floor(b.time / bucketMs) * bucketMs;
    const existing = map.get(bucketTime);
    if (!existing) {
      map.set(bucketTime, {
        time: bucketTime,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      });
    } else {
      existing.high = Math.max(existing.high, b.high);
      existing.low = Math.min(existing.low, b.low);
      existing.close = b.close;
      existing.volume += b.volume;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/**
 * Fetch klines for a given exchange with automatic fallback (e.g. Futures -> Spot).
 */
export async function fetchExchangeKlines(
  exchange: SupportedExchange,
  symbol: string,
  resolution: string,
  limit = 100
): Promise<CandlestickBar[]> {
  const cleanSym = symbol.toUpperCase().trim();
  const interval = normalizeIntervalForExchange(exchange, resolution);

  const fetchWithTimeout = async (url: string, timeoutMs = 4000): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  if (exchange === "binance") {
    const targetSym = mapSymbolForPerpExchange("binance", cleanSym);
    // 1. Try Binance USDT-M Futures endpoint
    try {
      const futuresUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${targetSym}&interval=${interval}&limit=${limit}`;
      const res = await fetchWithTimeout(futuresUrl);
      if (res.ok) {
        const raw = await res.json();
        const bars = convertBinanceKlines(raw);
        if (bars.length > 0) return bars;
      }
    } catch {}

    // 2. Fallback to Binance Spot endpoint
    try {
      const spotUrl = `https://api.binance.com/api/v3/klines?symbol=${cleanSym}&interval=${interval}&limit=${limit}`;
      const res = await fetchWithTimeout(spotUrl);
      if (res.ok) {
        const raw = await res.json();
        return convertBinanceKlines(raw);
      }
    } catch {}
    return [];
  }

  if (exchange === "bybit") {
    const targetSym = mapSymbolForPerpExchange("bybit", cleanSym);
    // 1. Try Bybit Linear Perpetuals
    try {
      const linearUrl = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${targetSym}&interval=${interval}&limit=${limit}`;
      const res = await fetchWithTimeout(linearUrl);
      if (res.ok) {
        const data = await res.json();
        if (data?.retCode === 0 && Array.isArray(data?.result?.list)) {
          const bars = convertBybitKlines(data.result.list);
          if (bars.length > 0) return bars;
        }
      }
    } catch {}

    // 2. Fallback to Bybit Spot
    try {
      const spotUrl = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${cleanSym}&interval=${interval}&limit=${limit}`;
      const res = await fetchWithTimeout(spotUrl);
      if (res.ok) {
        const data = await res.json();
        if (data?.retCode === 0 && Array.isArray(data?.result?.list)) {
          return convertBybitKlines(data.result.list);
        }
      }
    } catch {}
    return [];
  }

  // Default: MEXC Perpetual Futures first, with Spot fallback if contract unavailable
  const is2h = resolution.toLowerCase() === "2h" || resolution === "120" || resolution === "120m";
  const effectiveLimit = is2h ? limit * 2 : limit;
  const isBrowser = typeof window !== "undefined";

  try {
    const contractSym = toMexcContractSymbol(cleanSym);
    const contractIv = normalizeMexcContractInterval(resolution);
    if (isBrowser) {
      const proxyUrl = `/api/mexc/klines?symbol=${cleanSym}&interval=${interval}&limit=${effectiveLimit}&market=futures`;
      const res = await fetchWithTimeout(proxyUrl);
      if (res.ok) {
        const raw = await res.json();
        const bars = convertMexcKlines(raw);
        if (bars.length > 0) return is2h ? aggregateBars(bars, 2) : bars;
      }
    } else {
      const futUrl = `https://contract.mexc.com/api/v1/contract/kline/${encodeURIComponent(contractSym)}?interval=${contractIv}`;
      const res = await fetchWithTimeout(futUrl);
      if (res.ok) {
        const payload = await res.json();
        if (payload?.success && payload?.data) {
          const allBars = convertMexcContractKlines(payload.data);
          if (allBars.length > 0) {
            const sliced = allBars.slice(-effectiveLimit);
            return is2h ? aggregateBars(sliced, 2) : sliced;
          }
        }
      }
    }
  } catch {}

  try {
    const mexcBase = process.env.NEXT_PUBLIC_MEXC_API_BASE || "https://api.mexc.co";
    const mexcUrl = isBrowser
      ? `/api/mexc/klines?symbol=${cleanSym}&interval=${interval}&limit=${effectiveLimit}`
      : `${mexcBase}/api/v3/klines?symbol=${cleanSym}&interval=${interval}&limit=${effectiveLimit}`;
    const res = await fetchWithTimeout(mexcUrl);
    if (res.ok) {
      const raw = await res.json();
      const bars = convertMexcKlines(raw);
      return is2h ? aggregateBars(bars, 2) : bars;
    }
  } catch {}

  return [];
}

/**
 * Fetch 24hr tickers for a given exchange.
 */
export async function fetchExchangeTickers(
  exchange: SupportedExchange
): Promise<Map<string, ExchangeTicker>> {
  const tickerMap = new Map<string, ExchangeTicker>();

  const fetchWithTimeout = async (url: string, timeoutMs = 4000): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  if (exchange === "binance") {
    try {
      // Fetch Binance Futures 24hr tickers
      const res = await fetchWithTimeout("https://fapi.binance.com/fapi/v1/ticker/24hr");
      if (res.ok) {
        const tickers = await res.json();
        if (Array.isArray(tickers)) {
          tickers.forEach((t: any) => {
            if (t.symbol) {
              tickerMap.set(t.symbol, {
                symbol: t.symbol,
                price: parseFloat(t.lastPrice || "0"),
                change24h: parseFloat(t.priceChangePercent || "0"),
                volume24h: parseFloat(t.quoteVolume || "0"),
                high24h: parseFloat(t.highPrice || "0"),
                low24h: parseFloat(t.lowPrice || "0"),
                exchange: "binance",
              });
            }
          });
        }
      }
    } catch {}
    return tickerMap;
  }

  if (exchange === "bybit") {
    try {
      // Fetch Bybit Linear Perpetuals 24hr tickers
      const res = await fetchWithTimeout("https://api.bybit.com/v5/market/tickers?category=linear");
      if (res.ok) {
        const data = await res.json();
        if (data?.retCode === 0 && Array.isArray(data?.result?.list)) {
          data.result.list.forEach((t: any) => {
            if (t.symbol) {
              const rawPct = parseFloat(t.price24hPcnt || "0");
              const change24h = Math.abs(rawPct) <= 1.0 ? rawPct * 100 : rawPct;
              tickerMap.set(t.symbol, {
                symbol: t.symbol,
                price: parseFloat(t.lastPrice || "0"),
                change24h,
                volume24h: parseFloat(t.turnover24h || t.volume24h || "0"),
                high24h: parseFloat(t.highPrice24h || "0"),
                low24h: parseFloat(t.lowPrice24h || "0"),
                exchange: "bybit",
              });
            }
          });
        }
      }
    } catch {}
    return tickerMap;
  }

  // Default: MEXC Perpetual Futures first, with Spot fallback
  const isBrowser = typeof window !== "undefined";
  try {
    const futUrl = isBrowser
      ? "/api/mexc/ticker?market=futures"
      : "https://contract.mexc.com/api/v1/contract/ticker";
    const res = await fetchWithTimeout(futUrl, 6000);
    if (res.ok) {
      const payload = await res.json();
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      for (const t of rows) {
        if (!t?.symbol) continue;
        const sym = fromMexcContractSymbol(String(t.symbol));
        const rawPct = parseFloat(t.riseFallRate ?? t.priceChangePercent ?? "0");
        const change24h = Math.abs(rawPct) <= 1.0 ? rawPct * 100 : rawPct;
        const price = parseFloat(t.lastPrice ?? t.fairPrice ?? t.price ?? "0");
        if (!Number.isFinite(price) || price <= 0) continue;
        tickerMap.set(sym, {
          symbol: sym,
          price,
          change24h,
          volume24h: parseFloat(t.amount24 ?? t.quoteVolume ?? t.volume24 ?? "0"),
          high24h: parseFloat(t.high24Price ?? t.highPrice ?? "0"),
          low24h: parseFloat(t.low24Price ?? t.lowPrice ?? "0"),
          exchange: "mexc",
        });
      }
      if (tickerMap.size > 0) return tickerMap;
    }
  } catch {}

  try {
    const mexcBase = process.env.NEXT_PUBLIC_MEXC_API_BASE || "https://api.mexc.co";
    const mexcUrl = isBrowser
      ? "/api/mexc/ticker"
      : `${mexcBase}/api/v3/ticker/24hr`;
    const res = await fetchWithTimeout(mexcUrl, 6000);
    if (res.ok) {
      const tickers = await res.json();
      if (Array.isArray(tickers)) {
        tickers.forEach((t: any) => {
          if (t.symbol) {
            const rawPct = parseFloat(t.priceChangePercent || "0");
            const change24h = Math.abs(rawPct) <= 1.0 ? rawPct * 100 : rawPct;
            tickerMap.set(t.symbol, {
              symbol: t.symbol,
              price: parseFloat(t.lastPrice || t.price || "0"),
              change24h,
              volume24h: parseFloat(t.quoteVolume || t.volume || "0"),
              high24h: parseFloat(t.highPrice || "0"),
              low24h: parseFloat(t.lowPrice || "0"),
              exchange: "mexc",
            });
          }
        });
      }
    }
  } catch {}

  return tickerMap;
}
