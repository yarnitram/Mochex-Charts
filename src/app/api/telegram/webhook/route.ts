import { NextRequest, NextResponse } from "next/server";
import {
  processTelegramUpdate,
  TelegramUpdate,
} from "@/lib/telegram/telegram-bot-engine";
import { MexcClient } from "@/lib/mexc/client";
import { computeRadarPois, RadarPoiItem } from "@/lib/indicators/radar-poi-engine";
import { MAJORS_UNIVERSE } from "@/lib/screener/universe-catalog";

export const dynamic = "force-dynamic";

// In-memory 30s cache of live POIs for fast Telegram response
let cachedTelegramPois: RadarPoiItem[] = [];
let lastPoiFetchTime = 0;
const POI_CACHE_TTL = 30_000;

async function getLiveRadarPois(symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "SUIUSDT"]): Promise<RadarPoiItem[]> {
  const now = Date.now();
  if (cachedTelegramPois.length > 0 && now - lastPoiFetchTime < POI_CACHE_TTL) {
    return cachedTelegramPois;
  }

  try {
    const mexcClient = new MexcClient();
    const results: RadarPoiItem[] = [];

    for (const sym of symbols) {
      try {
        const klines = await mexcClient.getKlines({ symbol: sym, resolution: "240", limit: 70 });
        if (klines && klines.length >= 20) {
          const pois = computeRadarPois(klines, sym, "240");
          results.push(...pois);
        }
      } catch {}
    }

    if (results.length > 0) {
      cachedTelegramPois = results.sort((a, b) => a.distanceToEntryPct - b.distanceToEntryPct);
      lastPoiFetchTime = now;
    }

    return cachedTelegramPois;
  } catch {
    return cachedTelegramPois;
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    service: "Mochex Telegram Bot Webhook",
    status: "listening",
    timestamp: new Date().toISOString(),
    commands: ["/radar", "/alerts", "/watchlist", "/ping", "/help"],
  });
}

export async function POST(req: NextRequest) {
  try {
    const update: TelegramUpdate = await req.json();

    if (!update || (!update.message && !update.callback_query)) {
      return NextResponse.json(
        { ok: false, error: "Invalid Telegram update payload" },
        { status: 400 }
      );
    }

    // Optional token override from query params (e.g. ?token=...)
    const { searchParams } = new URL(req.url);
    const queryToken = searchParams.get("token") || undefined;

    // Fetch or use cached POIs
    const livePois = await getLiveRadarPois();

    const result = await processTelegramUpdate(update, {
      defaultBotToken: queryToken || process.env.TELEGRAM_BOT_TOKEN,
      samplePois: livePois,
    });

    return NextResponse.json({
      ok: true,
      handled: result.handled,
      command: result.command,
      description: result.description,
    });
  } catch (err: any) {
    console.error("[Telegram Webhook] Error processing update:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
