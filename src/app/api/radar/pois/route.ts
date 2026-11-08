import { NextRequest, NextResponse } from "next/server";
import {
  computeRadarPois,
  RadarPoiItem,
} from "@/lib/indicators/radar-poi-engine";
import { MAJORS_UNIVERSE } from "@/lib/screener/universe-catalog";
import {
  SupportedExchange,
  ExchangeFilter,
  fetchExchangeKlines,
  fetchExchangeTickers,
  ExchangeTicker,
} from "@/lib/screener/multi-exchange-client";

export const dynamic = "force-dynamic";

interface CachedPoiEntry {
  timestamp: number;
  data: {
    symbol: string;
    price: number;
    change24h: number;
    volume24h: number;
    high24h: number;
    low24h: number;
    nearestPoi: RadarPoiItem | null;
    nearestOb: RadarPoiItem | null;
    nearestSandwich: RadarPoiItem | null;
    nearestFvg: RadarPoiItem | null;
    poisByTimeframe: Record<string, RadarPoiItem[]>;
    exchange?: string;
    metrics?: any;
  };
}

// In-memory cache for radar results (TTL: 20 seconds)
const radarPoiCache = new Map<string, CachedPoiEntry>();
const CACHE_TTL_MS = 20_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawSymbols: string[] = Array.isArray(body.symbols) && body.symbols.length > 0
      ? body.symbols
      : MAJORS_UNIVERSE.map((c) => c.symbol);

    const timeframes: string[] = Array.isArray(body.timeframes) && body.timeframes.length > 0
      ? body.timeframes
      : ["240"]; // Default 4H

    const rawExchange: string = (body.exchange || "mexc").toLowerCase();
    const exchangeFilter: ExchangeFilter =
      rawExchange === "binance"
        ? "binance"
        : rawExchange === "bybit"
        ? "bybit"
        : rawExchange === "all"
        ? "all"
        : "mexc";

    // Limit batch to max 60 symbols per request to prevent timeouts
    const symbols = rawSymbols.slice(0, 60);
    const now = Date.now();

    // 1. Fetch 24h tickers based on exchange filter
    let tickerMaps: Partial<Record<SupportedExchange, Map<string, ExchangeTicker>>> = {};

    if (exchangeFilter === "all") {
      const [mexcT, binanceT, bybitT] = await Promise.all([
        fetchExchangeTickers("mexc").catch(() => new Map<string, ExchangeTicker>()),
        fetchExchangeTickers("binance").catch(() => new Map<string, ExchangeTicker>()),
        fetchExchangeTickers("bybit").catch(() => new Map<string, ExchangeTicker>()),
      ]);
      tickerMaps.mexc = mexcT;
      tickerMaps.binance = binanceT;
      tickerMaps.bybit = bybitT;
    } else {
      const tMap = await fetchExchangeTickers(exchangeFilter).catch(
        () => new Map<string, ExchangeTicker>()
      );
      tickerMaps[exchangeFilter] = tMap;
    }

    const targetExchanges: SupportedExchange[] =
      exchangeFilter === "all" ? ["mexc", "binance", "bybit"] : [exchangeFilter];

    // 2. Compute Validated POIs per symbol across requested timeframes and exchanges
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const upperSym = sym.toUpperCase();
        const cacheKey = `${exchangeFilter}_${upperSym}_${timeframes.sort().join("_")}`;
        const cached = radarPoiCache.get(cacheKey);

        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          return cached.data;
        }

        // Resolve primary ticker
        let primaryTicker: ExchangeTicker | undefined;
        for (const ex of targetExchanges) {
          const map = tickerMaps[ex];
          if (map && map.has(upperSym)) {
            primaryTicker = map.get(upperSym);
            break;
          }
        }

        const ticker = primaryTicker || {
          symbol: upperSym,
          price: 0,
          change24h: 0,
          volume24h: 0,
          high24h: 0,
          low24h: 0,
          exchange: targetExchanges[0],
        };

        const poisByTimeframe: Record<string, RadarPoiItem[]> = {};
        const allPois: RadarPoiItem[] = [];

        for (const tf of timeframes) {
          poisByTimeframe[tf] = [];

          // Query each target exchange
          for (const ex of targetExchanges) {
            try {
              const bars = await fetchExchangeKlines(ex, upperSym, tf, 100);
              if (bars && bars.length >= 4) {
                const detected = computeRadarPois(bars, upperSym, tf, ex);
                poisByTimeframe[tf].push(...detected);
                allPois.push(...detected);
              }
            } catch {}
          }
        }

        // Sort all POIs by proximity
        allPois.sort((a, b) => a.distanceToEntryPct - b.distanceToEntryPct);
        const nearestPoi = allPois.length > 0 ? allPois[0] : null;

        // Separate nearest OB, Sandwich Zone, and Standalone FVG
        const nearestOb = allPois.find((p) => p.category === "order_block") || null;
        const nearestSandwich = allPois.find((p) => p.category === "sandwich_zone") || null;
        const nearestFvg = allPois.find((p) => p.category === "fvg") || null;

        const data = {
          symbol: upperSym,
          price: ticker.price || (nearestPoi ? nearestPoi.currentPrice : 0),
          change24h: ticker.change24h,
          volume24h: ticker.volume24h,
          high24h: ticker.high24h,
          low24h: ticker.low24h,
          nearestPoi,
          nearestOb,
          nearestSandwich,
          nearestFvg,
          poisByTimeframe,
          exchange: exchangeFilter,
          metrics: nearestPoi?.metrics || null,
        };

        radarPoiCache.set(cacheKey, { timestamp: now, data });
        return data;
      })
    );

    return NextResponse.json({
      success: true,
      exchange: exchangeFilter,
      count: results.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to scan radar POIs" },
      { status: 500 }
    );
  }
}
