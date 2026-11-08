import { NextRequest, NextResponse } from "next/server";
import { MexcClient } from "@/lib/mexc/client";
import {
  computeRadarPois,
  RadarPoiItem,
} from "@/lib/indicators/radar-poi-engine";
import { MAJORS_UNIVERSE } from "@/lib/screener/universe-catalog";

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
    poisByTimeframe: Record<string, RadarPoiItem[]>;
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

    // Limit batch to max 60 symbols per request to prevent timeouts
    const symbols = rawSymbols.slice(0, 60);

    const mexcClient = new MexcClient();
    const now = Date.now();

    // 1. Fetch 24h tickers
    let tickerMap = new Map<string, { price: number; change24h: number; volume24h: number; high24h: number; low24h: number }>();
    try {
      const mexcBase = process.env.NEXT_PUBLIC_MEXC_API_BASE || "https://api.mexc.co";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${mexcBase}/api/v3/ticker/24hr`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const tickers = await res.json();
        if (Array.isArray(tickers)) {
          tickers.forEach((t: any) => {
            tickerMap.set(t.symbol, {
              price: parseFloat(t.lastPrice || t.price || "0"),
              change24h: parseFloat(t.priceChangePercent || "0"),
              volume24h: parseFloat(t.quoteVolume || t.volume || "0"),
              high24h: parseFloat(t.highPrice || "0"),
              low24h: parseFloat(t.lowPrice || "0"),
            });
          });
        }
      }
    } catch {}

    // 2. Compute Validated POIs per symbol across requested timeframes
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const upperSym = sym.toUpperCase();
        const cacheKey = `${upperSym}_${timeframes.sort().join("_")}`;
        const cached = radarPoiCache.get(cacheKey);

        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          return cached.data;
        }

        const ticker = tickerMap.get(upperSym) || {
          price: 0,
          change24h: 0,
          volume24h: 0,
          high24h: 0,
          low24h: 0,
        };

        const poisByTimeframe: Record<string, RadarPoiItem[]> = {};
        const allPois: RadarPoiItem[] = [];

        for (const tf of timeframes) {
          try {
            // Map common resolution strings
            const resolution =
              tf === "15m" || tf === "15"
                ? "15"
                : tf === "1H" || tf === "60"
                ? "60"
                : tf === "4H" || tf === "240"
                ? "240"
                : tf === "1D" || tf === "D"
                ? "1D"
                : tf;

            const bars = await mexcClient.getKlines({
              symbol: upperSym,
              resolution,
              limit: 100,
              forceProxy: false,
            });

            if (bars && bars.length >= 4) {
              const detected = computeRadarPois(bars, upperSym, tf);
              poisByTimeframe[tf] = detected;
              allPois.push(...detected);
            } else {
              poisByTimeframe[tf] = [];
            }
          } catch {
            poisByTimeframe[tf] = [];
          }
        }

        // Sort all POIs by proximity
        allPois.sort((a, b) => a.distanceToEntryPct - b.distanceToEntryPct);
        const nearestPoi = allPois.length > 0 ? allPois[0] : null;

        // Separate nearest OB and nearest Sandwich Zone
        const nearestOb = allPois.find((p) => p.category === "order_block") || null;
        const nearestSandwich = allPois.find((p) => p.category === "sandwich_zone") || null;

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
          poisByTimeframe,
        };

        radarPoiCache.set(cacheKey, { timestamp: now, data });
        return data;
      })
    );

    return NextResponse.json({
      success: true,
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
