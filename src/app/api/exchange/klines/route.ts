import { NextRequest, NextResponse } from "next/server";
import {
  fetchExchangeKlines,
  SupportedExchange,
} from "@/lib/screener/multi-exchange-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase().trim();
  const interval = searchParams.get("interval") || "4H";
  const rawEx = (searchParams.get("exchange") || "mexc").toLowerCase();
  const exchange: SupportedExchange =
    rawEx === "bybit" ? "bybit" : rawEx === "binance" ? "binance" : "mexc";
  const rawLimit = parseInt(searchParams.get("limit") || "120", 10);
  const limit = Math.max(20, Math.min(300, Number.isFinite(rawLimit) ? rawLimit : 120));

  try {
    const bars = await fetchExchangeKlines(exchange, symbol, interval, limit);
    return NextResponse.json({
      success: true,
      exchange,
      symbol,
      interval,
      bars,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch exchange klines", bars: [] },
      { status: 500 }
    );
  }
}
