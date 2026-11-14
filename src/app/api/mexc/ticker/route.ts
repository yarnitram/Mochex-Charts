import { NextRequest, NextResponse } from "next/server";
import {
  fromMexcContractSymbol,
  toMexcContractSymbol,
} from "@/lib/screener/multi-exchange-client";

export const dynamic = "force-dynamic";

function normalizeContractTickerRow(item: any) {
  return {
    symbol: fromMexcContractSymbol(String(item?.symbol || "")),
    contractSymbol: item?.symbol,
    lastPrice: String(item?.lastPrice ?? 0),
    priceChangePercent: String(Number(item?.riseFallRate ?? 0) * 100),
    volume: String(item?.volume24 ?? 0),
    quoteVolume: String(item?.amount24 ?? 0),
    highPrice: String(item?.high24Price ?? 0),
    lowPrice: String(item?.lower24Price ?? 0),
  };
}

async function fetchMexcContractTicker(symbol: string | null) {
  const contractUrl = symbol
    ? `https://contract.mexc.com/api/v1/contract/ticker?symbol=${encodeURIComponent(toMexcContractSymbol(symbol))}`
    : "https://contract.mexc.com/api/v1/contract/ticker";
  const res = await fetch(contractUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    next: { revalidate: 2 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json?.success || !json?.data) return null;
  if (Array.isArray(json.data)) {
    return json.data.map(normalizeContractTickerRow);
  }
  return normalizeContractTickerRow(json.data);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const market = (searchParams.get("market") || "").toLowerCase();

  if (market === "futures") {
    try {
      const futuresData = await fetchMexcContractTicker(symbol);
      if (futuresData) {
        return NextResponse.json(futuresData);
      }
    } catch {
      // Fall through to Spot endpoint
    }
  }

  const mexcBase = process.env.NEXT_PUBLIC_MEXC_API_BASE || "https://api.mexc.co";

  try {
    const upstreamUrl = symbol
      ? `${mexcBase}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol.toUpperCase())}`
      : `${mexcBase}/api/v3/ticker/24hr`;

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 2 }, // 2-second cache
    });

    if (!response.ok) {
      if (market !== "futures") {
        const futuresData = await fetchMexcContractTicker(symbol).catch(() => null);
        if (futuresData) {
          return NextResponse.json(futuresData);
        }
      }
      return NextResponse.json(
        { error: `Upstream MEXC error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch ticker from MEXC upstream" },
      { status: 502 }
    );
  }
}
