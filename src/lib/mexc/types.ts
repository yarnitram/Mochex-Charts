/**
 * MEXC Spot V3 Market Data Types & Schemas
 */

export type MexcResolution = "1m" | "5m" | "15m" | "30m" | "60m" | "4h" | "1d" | "1W" | "1M";

export const RESOLUTION_MAP: Record<string, MexcResolution> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "60m",
  "120": "60m",
  "240": "4h",
  "1D": "1d",
  "D": "1d",
  "1W": "1W",
  "W": "1W",
  "1M": "1M",
  "M": "1M",
};

export const WS_INTERVAL_MAP: Record<string, string> = {
  "1m": "Min1",
  "5m": "Min5",
  "15m": "Min15",
  "30m": "Min30",
  "60m": "Min60",
  "4h": "Hour4",
  "1d": "Day1",
  "1W": "Week1",
  "1M": "Month1",
};

/**
 * Raw MEXC Kline array format:
 * [0] Open time (ms)
 * [1] Open price (string)
 * [2] High price (string)
 * [3] Low price (string)
 * [4] Close price (string)
 * [5] Volume (string)
 * [6] Close time (ms)
 * [7] Turnover amount (string)
 */
export type MexcRawKline = [
  number, // 0: Open time
  string, // 1: Open
  string, // 2: High
  string, // 3: Low
  string, // 4: Close
  string, // 5: Volume
  number, // 6: Close time
  string  // 7: Turnover
];

export interface CandlestickBar {
  time: number; // UTC timestamp in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MexcKlineWsPayload {
  d: {
    k: {
      t: number;  // Bar start time (ms)
      o: string;  // Open
      c: string;  // Close
      h: string;  // High
      l: string;  // Low
      v: string;  // Volume
      a: string;  // Amount (Turnover)
      T: number;  // Bar end time (ms)
    };
  };
  c: string;      // Channel name (e.g. spot@public.kline.v3.api@BTCUSDT@Min15)
  s: string;      // Symbol (e.g. BTCUSDT)
  t: number;      // Message timestamp
}

export interface MexcMiniTickerItem {
  s: string; // Symbol
  p: string; // Last price
  r: string; // 24h percentage change
  h: string; // 24h High
  l: string; // 24h Low
  v: string; // 24h Volume
  a: string; // 24h Turnover
}

export interface MexcMiniTickerWsPayload {
  d: MexcMiniTickerItem[];
  c: string;
  t: number;
}

export interface DepthLevel {
  price: number;
  amount: number;
  total?: number;
}

export interface MexcDepthData {
  symbol: string;
  asks: DepthLevel[];
  bids: DepthLevel[];
  timestamp: number;
}

export interface MexcDepthWsPayload {
  c: string; // e.g. spot@public.limit.depth.v3.api@BTCUSDT@5
  d: {
    asks?: Array<{ p: string; v: string } | [string, string]>;
    bids?: Array<{ p: string; v: string } | [string, string]>;
  };
  s?: string;
  t?: number;
}

export function parseDepthLevels(rawLevels?: Array<{ p: string; v: string } | [string, string]>): DepthLevel[] {
  if (!rawLevels || !Array.isArray(rawLevels)) return [];
  let runningTotal = 0;
  return rawLevels.map((item) => {
    let p = 0;
    let v = 0;
    if (Array.isArray(item)) {
      p = parseFloat(item[0]);
      v = parseFloat(item[1]);
    } else if (item && typeof item === "object") {
      p = parseFloat(item.p);
      v = parseFloat(item.v);
    }
    runningTotal += isNaN(v) ? 0 : v;
    return {
      price: isNaN(p) ? 0 : p,
      amount: isNaN(v) ? 0 : v,
      total: runningTotal,
    };
  });
}

export function parseRawKline(raw: MexcRawKline): CandlestickBar {
  return {
    time: Number(raw[0]),
    open: parseFloat(raw[1]),
    high: parseFloat(raw[2]),
    low: parseFloat(raw[3]),
    close: parseFloat(raw[4]),
    volume: parseFloat(raw[5]),
  };
}

export function parseWsKline(data: MexcKlineWsPayload["d"]["k"]): CandlestickBar {
  return {
    time: Number(data.t),
    open: parseFloat(data.o),
    high: parseFloat(data.h),
    low: parseFloat(data.l),
    close: parseFloat(data.c),
    volume: parseFloat(data.v),
  };
}

export interface MexcDealItem {
  id?: string;
  price: number;
  amount: number;
  time: number;
  side: "buy" | "sell";
  quoteAmount: number; // price * amount
}

export interface MexcDealsWsPayload {
  c: string; // e.g. spot@public.deals.v3.api@BTCUSDT
  d: {
    deals: Array<{
      p: string | number; // price
      v: string | number; // volume / amount
      S: 1 | 2 | "1" | "2" | "buy" | "sell"; // 1: Buy, 2: Sell
      t: number; // timestamp in ms
    }>;
  };
  s?: string;
  t?: number;
}

export function parseWsDeals(rawDeals?: MexcDealsWsPayload["d"]["deals"]): MexcDealItem[] {
  if (!rawDeals || !Array.isArray(rawDeals)) return [];
  return rawDeals.map((d, idx) => {
    const price = typeof d.p === "number" ? d.p : parseFloat(d.p) || 0;
    const amount = typeof d.v === "number" ? d.v : parseFloat(d.v) || 0;
    const side = d.S === 1 || d.S === "1" || d.S === "buy" ? "buy" : "sell";
    const quoteAmount = price * amount;
    return {
      id: `${d.t || Date.now()}-${idx}-${price}-${amount}`,
      price,
      amount,
      time: d.t || Date.now(),
      side,
      quoteAmount,
    };
  });
}

