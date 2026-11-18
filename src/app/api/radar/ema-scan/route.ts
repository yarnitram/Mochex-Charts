import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import {
  AutoObCategory,
  MAX_AUTO_OB_TOP_LIMIT,
  ObSearchExchangePreference,
  pickObExchangeForToken,
  rankTopTokensOnMexc,
  resolveCandidateExchanges,
} from "@/lib/alerts/auto-ob-fvg-engine";
import {
  detectEmaSetups,
  selectNonDuplicateAutoEmaAlarms,
  AutoEmaSetup,
} from "@/lib/alerts/auto-ema-engine";
import { normalizeSelectedEmaPeriods, SELECTABLE_EMA_PERIODS } from "@/lib/alerts/ema-alerts";
import { ExchangeTicker, fetchExchangeKlines, fetchExchangeTickers } from "@/lib/screener/multi-exchange-client";
import { getServerAlerts, saveServerAlertsBatch } from "@/lib/alerts/server-alerts-store";
import { serverAlertDaemon } from "@/lib/alerts/server-alert-daemon";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function resolveUserId(request: NextRequest): Promise<string> {
  const token = request.cookies.get("mochex_token")?.value ||
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
    const rawCategory = String(body.category || "majors").toLowerCase();
    const category: AutoObCategory = rawCategory === "memes"
      ? "memes"
      : rawCategory === "ai"
      ? "ai"
      : rawCategory === "all"
      ? "all"
      : "majors";
    const rawPreference = String(body.exchangePreference || "auto").toLowerCase();
    const exchangePreference: ObSearchExchangePreference = rawPreference === "bybit" || rawPreference === "binance"
      ? rawPreference
      : "auto";
    const topLimit = Math.max(5, Math.min(MAX_AUTO_OB_TOP_LIMIT, Number(body.topLimit) || 25));
    const timeframes: string[] = Array.isArray(body.timeframes) && body.timeframes.length
      ? body.timeframes.map((tf: unknown) => String(tf))
      : ["1H"];
    const periods = normalizeSelectedEmaPeriods(body.periods, [...SELECTABLE_EMA_PERIODS]);
    const maxDistancePct = Math.max(0.1, Math.min(50, Number(body.maxDistancePct) || 5));
    const autoArm = body.autoArm !== false;
    const notificationOptions = {
      notifyDiscord: body.notifyDiscord !== false,
      notifyTelegram: body.notifyTelegram !== false,
      notifyTradingWebhook: Boolean(body.notifyTradingWebhook),
    };

    const targetExchanges = resolveCandidateExchanges(exchangePreference);
    const [mexcTickers, bybitTickers, binanceTickers] = await Promise.all([
      fetchExchangeTickers("mexc").catch(() => new Map<string, ExchangeTicker>()),
      targetExchanges.includes("bybit") ? fetchExchangeTickers("bybit").catch(() => new Map<string, ExchangeTicker>()) : Promise.resolve(new Map<string, ExchangeTicker>()),
      targetExchanges.includes("binance") ? fetchExchangeTickers("binance").catch(() => new Map<string, ExchangeTicker>()) : Promise.resolve(new Map<string, ExchangeTicker>()),
    ]);
    const rankedTokens = rankTopTokensOnMexc(category, mexcTickers, topLimit);
    const eligible = rankedTokens.map((token) => ({
      token,
      picked: pickObExchangeForToken(token.symbol, exchangePreference, { bybit: bybitTickers, binance: binanceTickers }),
    })).filter((entry) => entry.picked !== null) as Array<{
      token: (typeof rankedTokens)[number];
      picked: NonNullable<ReturnType<typeof pickObExchangeForToken>>;
    }>;

    const allSetups: AutoEmaSetup[] = [];
    const chunkSize = 16;
    for (let i = 0; i < eligible.length; i += chunkSize) {
      const chunkResults = await Promise.all(eligible.slice(i, i + chunkSize).map(async ({ token, picked }) => {
        const found: AutoEmaSetup[] = [];
        await Promise.all(timeframes.map(async (timeframe) => {
          try {
            const bars = await fetchExchangeKlines(picked.exchange, token.symbol, timeframe, 220);
            if (bars?.length) found.push(...detectEmaSetups(bars, token, timeframe, picked.exchange, {
              livePriceOverride: picked.ticker?.price,
              maxDistancePct,
              periods,
            }));
          } catch {}
        }));
        return found;
      }));
      chunkResults.forEach((rows) => allSetups.push(...rows));
    }

    allSetups.sort((a, b) => a.distancePct - b.distancePct || a.mexcRank - b.mexcRank || a.period - b.period);
    let newlyArmedAlerts = [] as Awaited<ReturnType<typeof saveServerAlertsBatch>>;
    let skippedDuplicatesCount = 0;
    if (autoArm && allSetups.length) {
      const existing = await getServerAlerts(userId);
      const selection = selectNonDuplicateAutoEmaAlarms(allSetups, existing, notificationOptions);
      skippedDuplicatesCount = selection.skippedDuplicatesCount;
      if (selection.alertsToArm.length) {
        newlyArmedAlerts = await saveServerAlertsBatch(selection.alertsToArm, userId);
        serverAlertDaemon.startIfNotRunning();
        serverAlertDaemon.notifyAlertsChanged().catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      category,
      exchangePreference,
      periods,
      maxDistancePct,
      scannedTokensCount: rankedTokens.length,
      rankedTokens,
      setups: allSetups,
      newlyArmedAlerts,
      newlyArmedCount: newlyArmedAlerts.length,
      skippedDuplicatesCount,
      scannedAt: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to scan EMA levels" }, { status: 500 });
  }
}
