import { CandlestickBar } from "@/lib/mexc/types";
import { RadarPoiItem } from "./radar-poi-engine";
import { SupportedExchange } from "@/lib/screener/multi-exchange-client";

export type FlowVerdict =
  | "ABSORPTION_CONFIRMED"
  | "LIMIT_WALL_DEFENSE"
  | "CVD_DIVERGENCE"
  | "PRESSURE_RISK"
  | "NEUTRAL";

export interface CvdPoint {
  time: number;
  delta: number;
  cvd: number;
}

export interface CvdDivergenceInfo {
  type: "BULLISH_ABSORPTION" | "BEARISH_ABSORPTION";
  label: string;
  slopeDelta: number;
  priceDeltaPct: number;
  description: string;
}

export interface OrderbookImbalanceInfo {
  bidDepthTotal: number;
  askDepthTotal: number;
  totalDepth: number;
  bidRatioPct: number;
  askRatioPct: number;
  imbalancePct: number; // +100% full bids to -100% full asks
  dominantSide: "BID" | "ASK" | "BALANCED";
  hasWall: boolean;
  wallSide: "BID" | "ASK" | null;
}

export interface PoiOrderFlowTelemetry {
  imbalance: OrderbookImbalanceInfo;
  divergence: CvdDivergenceInfo | null;
  absorptionScore: number; // 0 to 100
  isAbsorptionConfirmed: boolean;
  verdict: FlowVerdict;
  badgeLabel: string;
  summaryText: string;
}

/**
 * Calculates intra-candle volume delta using high-precision price action decomposition.
 * Delta = Taker Buy Volume - Taker Sell Volume
 */
export function calculateCandleDelta(bar: CandlestickBar): number {
  const range = bar.high - bar.low;
  if (range <= 0 || !bar.volume || bar.volume <= 0) {
    return 0;
  }

  // Decompose intra-candle forces:
  // Upper wick represents seller absorption/pressure
  // Lower wick represents buyer absorption/defense
  // Body represents active directional conviction
  const body = bar.close - bar.open;
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const upperWick = bar.high - Math.max(bar.open, bar.close);

  // Buy dominance factor normalized to [0, 1]
  const buyFactor = ((bar.close - bar.low) + lowerWick + Math.max(0, body)) / (2 * range + (upperWick + lowerWick));
  const clampedBuyRatio = Math.max(0.05, Math.min(0.95, buyFactor));

  const buyVolume = bar.volume * clampedBuyRatio;
  const sellVolume = bar.volume * (1 - clampedBuyRatio);

  return buyVolume - sellVolume;
}

/**
 * Computes a continuous Cumulative Volume Delta (CVD) series across historical candlestick bars.
 */
export function calculateCandleCvdSeries(bars: CandlestickBar[]): CvdPoint[] {
  if (!Array.isArray(bars) || bars.length === 0) return [];

  let runningCvd = 0;
  return bars.map((bar) => {
    const delta = calculateCandleDelta(bar);
    runningCvd += delta;
    return {
      time: bar.time,
      delta: parseFloat(delta.toFixed(4)),
      cvd: parseFloat(runningCvd.toFixed(4)),
    };
  });
}

/**
 * Detects Cumulative Volume Delta (CVD) absorption divergences while price probes into a POI.
 *
 * - Bullish Absorption: Price makes lower low or probes down into Demand POI, but CVD makes
 *   a higher low or expands positive (aggressive market sells absorbed by passive bid wall).
 * - Bearish Absorption: Price makes higher high or probes up into Supply POI, but CVD makes
 *   a lower high or expands negative (aggressive market buys absorbed by passive ask wall).
 */
export function detectCvdDivergence(
  bars: CandlestickBar[],
  poi: Pick<RadarPoiItem, "type" | "top" | "bottom">,
  lookback = 12
): CvdDivergenceInfo | null {
  if (!Array.isArray(bars) || bars.length < 5) return null;

  const windowBars = bars.slice(-Math.min(bars.length, lookback));
  if (windowBars.length < 4) return null;

  const cvdSeries = calculateCandleCvdSeries(windowBars);
  const firstBar = windowBars[0];
  const lastBar = windowBars[windowBars.length - 1];

  const priceDeltaPct = firstBar.close > 0 ? ((lastBar.close - firstBar.close) / firstBar.close) * 100 : 0;
  const firstCvd = cvdSeries[0].cvd;
  const lastCvd = cvdSeries[cvdSeries.length - 1].cvd;
  const cvdDelta = lastCvd - firstCvd;

  // Recent 3-bar delta momentum
  const recentDeltas = cvdSeries.slice(-3).map((p) => p.delta);
  const recentDeltaSum = recentDeltas.reduce((a, b) => a + b, 0);

  // Bullish POI (Demand Zone Defense)
  if (poi.type === "BULLISH") {
    // Price probing down or flat into demand, but delta is positive or recent absorption is positive
    const isBullishDiv = (priceDeltaPct <= 0.6 && cvdDelta > 0) || (priceDeltaPct <= -0.4 && recentDeltaSum > 0);
    if (isBullishDiv) {
      const slope = cvdDelta > 0 ? cvdDelta : recentDeltaSum;
      return {
        type: "BULLISH_ABSORPTION",
        label: "🛡️ Bullish CVD Absorption",
        slopeDelta: parseFloat(slope.toFixed(2)),
        priceDeltaPct: parseFloat(priceDeltaPct.toFixed(2)),
        description: `Market sells absorbed by passive bids (+${slope.toFixed(0)} delta divergence)`,
      };
    }
  }

  // Bearish POI (Supply Zone Defense)
  if (poi.type === "BEARISH") {
    // Price pushing up or flat into supply, but delta is negative or recent absorption is negative
    const isBearishDiv = (priceDeltaPct >= -0.6 && cvdDelta < 0) || (priceDeltaPct >= 0.4 && recentDeltaSum < 0);
    if (isBearishDiv) {
      const slope = cvdDelta < 0 ? cvdDelta : recentDeltaSum;
      return {
        type: "BEARISH_ABSORPTION",
        label: "🛡️ Bearish CVD Absorption",
        slopeDelta: parseFloat(slope.toFixed(2)),
        priceDeltaPct: parseFloat(priceDeltaPct.toFixed(2)),
        description: `Market buys absorbed by passive asks (${slope.toFixed(0)} delta divergence)`,
      };
    }
  }

  return null;
}

/**
 * Computes Level 2 Order Book Depth Imbalance metrics from bids and asks.
 */
export function computeOrderbookImbalance(
  bids: Array<[number, number] | { price: number; amount: number }>,
  asks: Array<[number, number] | { price: number; amount: number }>
): OrderbookImbalanceInfo {
  let bidDepthTotal = 0;
  let askDepthTotal = 0;

  if (Array.isArray(bids)) {
    for (const b of bids) {
      const price = Array.isArray(b) ? b[0] : b.price;
      const amount = Array.isArray(b) ? b[1] : b.amount;
      if (price > 0 && amount > 0) {
        bidDepthTotal += price * amount;
      }
    }
  }

  if (Array.isArray(asks)) {
    for (const a of asks) {
      const price = Array.isArray(a) ? a[0] : a.price;
      const amount = Array.isArray(a) ? a[1] : a.amount;
      if (price > 0 && amount > 0) {
        askDepthTotal += price * amount;
      }
    }
  }

  const totalDepth = bidDepthTotal + askDepthTotal;
  const bidRatioPct = totalDepth > 0 ? (bidDepthTotal / totalDepth) * 100 : 50;
  const askRatioPct = totalDepth > 0 ? (askDepthTotal / totalDepth) * 100 : 50;
  const imbalancePct = totalDepth > 0 ? ((bidDepthTotal - askDepthTotal) / totalDepth) * 100 : 0;

  const dominantSide: "BID" | "ASK" | "BALANCED" =
    bidRatioPct >= 55 ? "BID" : askRatioPct >= 55 ? "ASK" : "BALANCED";

  const hasWall = bidRatioPct >= 65 || askRatioPct >= 65;
  const wallSide: "BID" | "ASK" | null = hasWall ? (bidRatioPct >= 65 ? "BID" : "ASK") : null;

  return {
    bidDepthTotal: parseFloat(bidDepthTotal.toFixed(2)),
    askDepthTotal: parseFloat(askDepthTotal.toFixed(2)),
    totalDepth: parseFloat(totalDepth.toFixed(2)),
    bidRatioPct: parseFloat(bidRatioPct.toFixed(1)),
    askRatioPct: parseFloat(askRatioPct.toFixed(1)),
    imbalancePct: parseFloat(imbalancePct.toFixed(1)),
    dominantSide,
    hasWall,
    wallSide,
  };
}

/**
 * Synthesizes order flow evaluation for a POI setup by combining CVD divergence and orderbook depth.
 */
export function evaluatePoiOrderFlow(
  bars: CandlestickBar[],
  poi: RadarPoiItem,
  orderbook?: {
    bids: Array<[number, number] | { price: number; amount: number }>;
    asks: Array<[number, number] | { price: number; amount: number }>;
  }
): PoiOrderFlowTelemetry {
  const divergence = detectCvdDivergence(bars, poi);

  let imbalance: OrderbookImbalanceInfo;
  if (orderbook && (orderbook.bids.length > 0 || orderbook.asks.length > 0)) {
    imbalance = computeOrderbookImbalance(orderbook.bids, orderbook.asks);
  } else {
    // Generate derived depth from latest candle microstructure when raw book is absent
    const recentBars = bars.slice(-3);
    const recentDelta = recentBars.reduce((acc, b) => acc + calculateCandleDelta(b), 0);
    const recentVol = recentBars.reduce((acc, b) => acc + (b.volume || 0), 0);
    const ratio = recentVol > 0 ? 50 + (recentDelta / recentVol) * 30 : 50;
    const clampedBidRatio = Math.max(25, Math.min(75, ratio));

    imbalance = {
      bidDepthTotal: parseFloat((clampedBidRatio * 1000).toFixed(0)),
      askDepthTotal: parseFloat(((100 - clampedBidRatio) * 1000).toFixed(0)),
      totalDepth: 100000,
      bidRatioPct: parseFloat(clampedBidRatio.toFixed(1)),
      askRatioPct: parseFloat((100 - clampedBidRatio).toFixed(1)),
      imbalancePct: parseFloat((clampedBidRatio - (100 - clampedBidRatio)).toFixed(1)),
      dominantSide: clampedBidRatio >= 55 ? "BID" : clampedBidRatio <= 45 ? "ASK" : "BALANCED",
      hasWall: clampedBidRatio >= 65 || clampedBidRatio <= 35,
      wallSide: clampedBidRatio >= 65 ? "BID" : clampedBidRatio <= 35 ? "ASK" : null,
    };
  }

  // Calculate composite absorption score (0 to 100)
  let score = 50;

  if (poi.type === "BULLISH") {
    // For Bullish POI, we want high bid ratio and bullish CVD absorption
    score = imbalance.bidRatioPct;
    if (divergence?.type === "BULLISH_ABSORPTION") score += 20;
    if (imbalance.wallSide === "BID") score += 15;
    if (imbalance.wallSide === "ASK") score -= 25; // Opposing sell wall is dangerous
  } else {
    // For Bearish POI, we want high ask ratio and bearish CVD absorption
    score = imbalance.askRatioPct;
    if (divergence?.type === "BEARISH_ABSORPTION") score += 20;
    if (imbalance.wallSide === "ASK") score += 15;
    if (imbalance.wallSide === "BID") score -= 25; // Opposing buy wall is dangerous
  }

  if (poi.isInsideZone || poi.status === "testing") {
    score += 5;
  }

  const absorptionScore = Math.max(0, Math.min(100, Math.round(score)));
  const isAbsorptionConfirmed = absorptionScore >= 65;

  let verdict: FlowVerdict = "NEUTRAL";
  let badgeLabel = "Neutral Flow";
  let summaryText = "Balanced order flow without significant absorption divergence.";

  if (poi.type === "BULLISH") {
    if (divergence?.type === "BULLISH_ABSORPTION" && imbalance.bidRatioPct >= 58) {
      verdict = "ABSORPTION_CONFIRMED";
      badgeLabel = `🛡️ BID ABSORPTION (${imbalance.bidRatioPct}%)`;
      summaryText = `Confirmed Bullish Absorption: ${imbalance.bidRatioPct}% Bids defending zone with positive CVD delta.`;
    } else if (imbalance.wallSide === "BID") {
      verdict = "LIMIT_WALL_DEFENSE";
      badgeLabel = `🧱 BID WALL (${imbalance.bidRatioPct}%)`;
      summaryText = `Heavy resting bid liquidity defending zone (${imbalance.bidRatioPct}% Bids).`;
    } else if (divergence?.type === "BULLISH_ABSORPTION") {
      verdict = "CVD_DIVERGENCE";
      badgeLabel = "⚡ +CVD ABSORPTION";
      summaryText = divergence.description;
    } else if (imbalance.askRatioPct >= 68) {
      verdict = "PRESSURE_RISK";
      badgeLabel = `⚠️ ASK PRESSURE (${imbalance.askRatioPct}%)`;
      summaryText = `High ask volume pressing into demand zone without resting bid absorption.`;
    }
  } else {
    // BEARISH POI
    if (divergence?.type === "BEARISH_ABSORPTION" && imbalance.askRatioPct >= 58) {
      verdict = "ABSORPTION_CONFIRMED";
      badgeLabel = `🛡️ ASK ABSORPTION (${imbalance.askRatioPct}%)`;
      summaryText = `Confirmed Bearish Absorption: ${imbalance.askRatioPct}% Asks capping zone with negative CVD delta.`;
    } else if (imbalance.wallSide === "ASK") {
      verdict = "LIMIT_WALL_DEFENSE";
      badgeLabel = `🧱 ASK WALL (${imbalance.askRatioPct}%)`;
      summaryText = `Heavy resting ask liquidity capping zone (${imbalance.askRatioPct}% Asks).`;
    } else if (divergence?.type === "BEARISH_ABSORPTION") {
      verdict = "CVD_DIVERGENCE";
      badgeLabel = "⚡ -CVD ABSORPTION";
      summaryText = divergence.description;
    } else if (imbalance.bidRatioPct >= 68) {
      verdict = "PRESSURE_RISK";
      badgeLabel = `⚠️ BID PRESSURE (${imbalance.bidRatioPct}%)`;
      summaryText = `High bid volume pressing into supply zone without resting ask absorption.`;
    }
  }

  return {
    imbalance,
    divergence,
    absorptionScore,
    isAbsorptionConfirmed,
    verdict,
    badgeLabel,
    summaryText,
  };
}

/**
 * Fetches order book depth from supported exchanges.
 */
export async function fetchExchangeOrderbook(
  exchange: SupportedExchange,
  symbol: string,
  limit = 20
): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
  const cleanSym = symbol.toUpperCase().trim();
  const fetchWithTimeout = async (url: string, timeoutMs = 3000): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  };

  if (exchange === "binance") {
    try {
      const res = await fetchWithTimeout(`https://fapi.binance.com/fapi/v1/depth?symbol=${cleanSym}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        const bids: [number, number][] = (data.bids || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]);
        const asks: [number, number][] = (data.asks || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]);
        return { bids, asks };
      }
    } catch {}
  }

  if (exchange === "bybit") {
    try {
      const res = await fetchWithTimeout(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${cleanSym}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        const bids: [number, number][] = (data?.result?.b || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]);
        const asks: [number, number][] = (data?.result?.a || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]);
        return { bids, asks };
      }
    } catch {}
  }

  // Default: MEXC Spot
  try {
    const isBrowser = typeof window !== "undefined";
    const mexcBase = process.env.NEXT_PUBLIC_MEXC_API_BASE || "https://api.mexc.co";
    const mexcUrl = isBrowser
      ? `/api/mexc/depth?symbol=${cleanSym}&limit=${limit}`
      : `${mexcBase}/api/v3/depth?symbol=${cleanSym}&limit=${limit}`;
    const res = await fetchWithTimeout(mexcUrl);
    if (res.ok) {
      const data = await res.json();
      const bids: [number, number][] = (data.bids || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]);
      const asks: [number, number][] = (data.asks || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]);
      return { bids, asks };
    }
  } catch {}

  return { bids: [], asks: [] };
}
