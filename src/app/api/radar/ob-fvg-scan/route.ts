import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import {
  fetchExchangeKlines,
  fetchExchangeTickers,
  ExchangeTicker,
} from "@/lib/screener/multi-exchange-client";
import {
  AutoObCategory,
  AutoObFvgSetup,
  AutoObTouchMode,
  detectUnmitigatedObFvgBars,
  ObSearchExchangePreference,
  pickObExchangeForToken,
  rankTopTokensOnMexc,
  resolveCandidateExchanges,
  selectNonDuplicateAutoAlarms,
} from "@/lib/alerts/auto-ob-fvg-engine";
import {
  getServerAlerts,
  saveServerAlertsBatch,
} from "@/lib/alerts/server-alerts-store";
import { serverAlertDaemon } from "@/lib/alerts/server-alert-daemon";
import { ObZoneType } from "@/lib/indicators/validated-ob-engine";

export const dynamic = "force-dynamic";

async function resolveUserId(request: NextRequest): Promise<string> {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");
  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload?.userId) return payload.userId;
    } catch {}
  }
  return request.headers.get("X-User-Id") || "default-trader";
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    const body = await request.json().catch(() => ({}));

    const rawCat = String(body.category || "majors").toLowerCase();
    const category: AutoObCategory =
      rawCat === "memes"
        ? "memes"
        : rawCat === "ai"
        ? "ai"
        : rawCat === "all"
        ? "all"
        : "majors";

    const rawPref = String(body.exchangePreference || "auto").toLowerCase();
    const exchangePreference: ObSearchExchangePreference =
      rawPref === "bybit" ? "bybit" : rawPref === "binance" ? "binance" : "auto";

    const topLimit = Math.max(5, Math.min(100, Number(body.topLimit) || 25));
    const timeframes: string[] =
      Array.isArray(body.timeframes) && body.timeframes.length > 0
        ? body.timeframes.map((tf: any) => String(tf))
        : ["15m", "1H", "4H"];

    const autoArm = body.autoArm !== undefined ? Boolean(body.autoArm) : true;
    const touchMode: AutoObTouchMode =
      body.touchMode === "fifty_pct" ? "fifty_pct" : "entry";
    const obZoneType: ObZoneType = body.obZoneType === "body" ? "body" : "full";
    const minGapPct = Math.max(0, Number(body.minGapPct) || 0);
    const minDisplacementPct = Math.max(0, Number(body.minDisplacementPct) || 0);
    const notifyDiscord = body.notifyDiscord !== undefined ? Boolean(body.notifyDiscord) : true;
    const notifyTelegram = body.notifyTelegram !== undefined ? Boolean(body.notifyTelegram) : true;
    const notifyTradingWebhook = Boolean(body.notifyTradingWebhook);
    const notifyOnInvalidation =
      body.notifyOnInvalidation !== undefined ? Boolean(body.notifyOnInvalidation) : true;

    // 1. Search & rank top tokens in selected category from MEXC Futures
    const targetExchanges = resolveCandidateExchanges(exchangePreference);
    const [mexcTickers, bybitTickers, binanceTickers] = await Promise.all([
      fetchExchangeTickers("mexc").catch(() => new Map<string, ExchangeTicker>()),
      targetExchanges.includes("bybit")
        ? fetchExchangeTickers("bybit").catch(() => new Map<string, ExchangeTicker>())
        : Promise.resolve(new Map<string, ExchangeTicker>()),
      targetExchanges.includes("binance")
        ? fetchExchangeTickers("binance").catch(() => new Map<string, ExchangeTicker>())
        : Promise.resolve(new Map<string, ExchangeTicker>()),
    ]);

    const rankedTokens = rankTopTokensOnMexc(category, mexcTickers, topLimit);

    // 2. For each MEXC top token, search Bybit / Binance klines for strict unmitigated OB+FVG
    const CHUNK_SIZE = 10;
    const allSetups: AutoObFvgSetup[] = [];

    for (let i = 0; i < rankedTokens.length; i += CHUNK_SIZE) {
      const chunk = rankedTokens.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (token) => {
          const picked = pickObExchangeForToken(token.symbol, exchangePreference, {
            bybit: bybitTickers,
            binance: binanceTickers,
          });
          if (!picked) return [];

          const tokenSetups: AutoObFvgSetup[] = [];
          await Promise.all(
            timeframes.map(async (tf) => {
              try {
                const bars = await fetchExchangeKlines(picked.exchange, token.symbol, tf, 150);
                if (!bars || bars.length < 4) return;
                const found = detectUnmitigatedObFvgBars(
                  bars,
                  token,
                  tf,
                  picked.exchange,
                  {
                    minGapPct,
                    minDisplacementPct,
                    obZoneType,
                    livePriceOverride: picked.ticker?.price,
                  }
                );
                tokenSetups.push(...found);
              } catch {}
            })
          );
          return tokenSetups;
        })
      );

      for (const rows of chunkResults) {
        allSetups.push(...rows);
      }
    }

    // Sort closest setups first, then highest MEXC rank
    allSetups.sort((a, b) => {
      if (a.distanceToEntryPct !== b.distanceToEntryPct) {
        return a.distanceToEntryPct - b.distanceToEntryPct;
      }
      return a.mexcRank - b.mexcRank;
    });

    // 3. Auto-arm non-duplicate alarms on strict unmitigated OBs
    let newlyArmedAlerts: any[] = [];
    let skippedDuplicatesCount = 0;

    if (autoArm && allSetups.length > 0) {
      const existingAlerts = await getServerAlerts(userId);
      const selection = selectNonDuplicateAutoAlarms(allSetups, existingAlerts, {
        touchMode,
        notifyDiscord,
        notifyTelegram,
        notifyTradingWebhook,
        notifyOnInvalidation,
      });
      skippedDuplicatesCount = selection.skippedDuplicatesCount;
      if (selection.alertsToArm.length > 0) {
        newlyArmedAlerts = await saveServerAlertsBatch(selection.alertsToArm, userId);
        serverAlertDaemon.startIfNotRunning();
        serverAlertDaemon.notifyAlertsChanged().catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      category,
      exchangePreference,
      scannedTokensCount: rankedTokens.length,
      rankedTokens,
      setups: allSetups,
      newlyArmedAlerts,
      newlyArmedCount: newlyArmedAlerts.length,
      skippedDuplicatesCount,
      scannedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to scan OB+FVG setups" },
      { status: 500 }
    );
  }
}
