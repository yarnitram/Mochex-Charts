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
    name: "MEXC Global",
    shortName: "MEXC",
    badgeLabel: "MEXC Spot",
    marketType: "spot",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-400",
    badgeBorder: "border-emerald-500/20",
    apiBase: "https://api.mexc.co",
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
      if (norm === "1h" || norm === "60" || norm === "60m") return "60m";
      if (norm === "4h" || norm === "240") return "4h";
      if (norm === "1d" || norm === "d") return "1d";
      if (norm === "1m" || norm === "1") return "1m";
      if (norm === "5m" || norm === "5") return "5m";
      if (norm === "30m" || norm === "30") return "30m";
      if (norm === "1w" || norm === "w") return "1W";
      return "4h";

    case "binance":
      if (norm === "15m" || norm === "15") return "15m";
      if (norm === "1h" || norm === "60") return "1h";
      if (norm === "4h" || norm === "240") return "4h";
      if (norm === "1d" || norm === "d") return "1d";
      return "4h";

    case "bybit":
      if (norm === "15m" || norm === "15") return "15";
      if (norm === "1h" || norm === "60") return "60";
      if (norm === "4h" || norm === "240") return "240";
      if (norm === "1d" || norm === "d") return "D";
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
    // 1. Try Binance USDT-M Futures endpoint
    try {
      const futuresUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${cleanSym}&interval=${interval}&limit=${limit}`;
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
    // 1. Try Bybit Linear Perpetuals
    try {
      const linearUrl = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${cleanSym}&interval=${interval}&limit=${limit}`;
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

  // Default: MEXC Spot
  try {
    const isBrowser = typeof window !== "undefined";
    const mexcBase = process.env.NEXT_PUBLIC_MEXC_API_BASE || "https://api.mexc.co";
    const mexcUrl = isBrowser
      ? `/api/mexc/klines?symbol=${cleanSym}&interval=${interval}&limit=${limit}`
      : `${mexcBase}/api/v3/klines?symbol=${cleanSym}&interval=${interval}&limit=${limit}`;
    const res = await fetchWithTimeout(mexcUrl);
    if (res.ok) {
      const raw = await res.json();
      return convertMexcKlines(raw);
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

  // Default: MEXC Spot
  try {
    const isBrowser = typeof window !== "undefined";
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
