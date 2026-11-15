import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { CandlestickBar } from "../src/lib/mexc/types";
import { ExchangeTicker } from "../src/lib/screener/multi-exchange-client";
import {
  buildAutoObFvgAlarm,
  detectUnmitigatedObFvgBars,
  MexcRankedToken,
  pickObExchangeForToken,
  rankTopTokensOnMexc,
  selectNonDuplicateAutoAlarms,
} from "../src/lib/alerts/auto-ob-fvg-engine";
import {
  formatDiscordPayload,
  formatTelegramMessage,
} from "../src/lib/alerts/webhook-dispatcher";
import { ServerAlertDaemon } from "../src/lib/alerts/server-alert-daemon";
import {
  saveServerAlert,
  getServerAlertLogs,
} from "../src/lib/alerts/server-alerts-store";

function makeBar(
  idx: number,
  open: number,
  high: number,
  low: number,
  close: number
): CandlestickBar {
  return {
    time: 1700000000000 + idx * 3600_000,
    open,
    high,
    low,
    close,
    volume: 1000,
  };
}

describe("Auto Validated OB+FVG Monitor (MEXC Top -> Bybit/Binance)", () => {
  it("ranks top tokens across the 3 curated universes by MEXC Futures 24h volume", () => {
    const mexcMap = new Map<string, ExchangeTicker>([
      [
        "PEPEUSDT",
        {
          symbol: "PEPEUSDT",
          price: 0.000012,
          change24h: 8,
          volume24h: 800_000_000,
          high24h: 0.000013,
          low24h: 0.000011,
          exchange: "mexc",
        },
      ],
      [
        "DOGEUSDT",
        {
          symbol: "DOGEUSDT",
          price: 0.25,
          change24h: 5,
          volume24h: 1_500_000_000,
          high24h: 0.26,
          low24h: 0.24,
          exchange: "mexc",
        },
      ],
      [
        "TAOUSDT",
        {
          symbol: "TAOUSDT",
          price: 510,
          change24h: 4,
          volume24h: 420_000_000,
          high24h: 520,
          low24h: 495,
          exchange: "mexc",
        },
      ],
    ]);

    const memes = rankTopTokensOnMexc("memes", mexcMap, 5);
    expect(memes).toHaveLength(5);
    expect(memes[0].symbol).toBe("DOGEUSDT");
    expect(memes[0].mexcRank).toBe(1);
    expect(memes[1].symbol).toBe("PEPEUSDT");

    const ai = rankTopTokensOnMexc("ai", mexcMap, 3);
    expect(ai[0].symbol).toBe("TAOUSDT");

    const all = rankTopTokensOnMexc("all", mexcMap, 5);
    expect(all[0].symbol).toBe("DOGEUSDT");
  });

  it("picks Bybit or Binance according to preference with Auto fallback", () => {
    const bybitMap = new Map<string, ExchangeTicker>([
      [
        "BTCUSDT",
        {
          symbol: "BTCUSDT",
          price: 90000,
          change24h: 1,
          volume24h: 1e9,
          high24h: 91000,
          low24h: 89000,
          exchange: "bybit",
        },
      ],
    ]);
    const binanceMap = new Map<string, ExchangeTicker>([
      [
        "XYZUSDT",
        {
          symbol: "XYZUSDT",
          price: 2.5,
          change24h: 2,
          volume24h: 5e7,
          high24h: 2.6,
          low24h: 2.4,
          exchange: "binance",
        },
      ],
    ]);

    expect(
      pickObExchangeForToken("BTCUSDT", "auto", { bybit: bybitMap, binance: binanceMap })
        ?.exchange
    ).toBe("bybit");

    expect(
      pickObExchangeForToken("XYZUSDT", "auto", { bybit: bybitMap, binance: binanceMap })
        ?.exchange
    ).toBe("binance");

    expect(
      pickObExchangeForToken("XYZUSDT", "bybit", { bybit: bybitMap, binance: binanceMap })
    ).toBeNull();
  });

  it("detects strictly unmitigated 3-Candle RGG OB+FVG and rejects touched OBs", () => {
    const token: MexcRankedToken = {
      symbol: "SOLUSDT",
      name: "Solana",
      category: "majors",
      mexcRank: 3,
      mexcPrice: 180,
      mexcVolume24h: 500_000_000,
      mexcChange24h: 4.5,
    };

    // Bars: C0=R(100..95), C1=G(96..106), C2=G(106..115, low=104 > C0.high 101), C3 forming above
    const unmitigatedBars: CandlestickBar[] = [
      makeBar(0, 100, 101, 95, 96), // R OB (Full 95..101)
      makeBar(1, 96, 107, 96, 106), // G displacement
      makeBar(2, 106, 115, 104, 114), // G confirm (low 104 > 101 => FVG 101..104)
      makeBar(3, 114, 118, 112, 117), // Closing/live bar strictly above OB top 101
    ];

    const freshSetups = detectUnmitigatedObFvgBars(unmitigatedBars, token, "4H", "bybit");
    expect(freshSetups).toHaveLength(1);
    expect(freshSetups[0].pattern).toBe("RGG");
    expect(freshSetups[0].exchange).toBe("bybit");
    expect(freshSetups[0].bottom).toBe(95);
    expect(freshSetups[0].top).toBe(101);
    expect(freshSetups[0].touched).toBe(false);

    // Touching OB (wick low = 100.5 <= 101) must exclude it completely!
    const touchedBars: CandlestickBar[] = [
      ...unmitigatedBars.slice(0, 3),
      makeBar(3, 114, 114, 100.5, 109),
      makeBar(4, 109, 112, 108, 111),
    ];
    const mitigatedSetups = detectUnmitigatedObFvgBars(touchedBars, token, "4H", "bybit");
    expect(mitigatedSetups).toHaveLength(0);
  });

  it("deduplicates auto-armed alarms and formats exchange + OB price range into webhooks", () => {
    const token: MexcRankedToken = {
      symbol: "ETHUSDT",
      name: "Ethereum",
      category: "majors",
      mexcRank: 2,
      mexcPrice: 3200,
      mexcVolume24h: 1e9,
      mexcChange24h: 3,
    };
    const bars: CandlestickBar[] = [
      makeBar(0, 3020, 3030, 2980, 2990), // R OB [2980, 3030]
      makeBar(1, 2990, 3100, 2990, 3090),
      makeBar(2, 3090, 3180, 3060, 3170), // FVG [3030, 3060]
      makeBar(3, 3170, 3210, 3160, 3200),
    ];

    const setups = detectUnmitigatedObFvgBars(bars, token, "1H", "binance");
    expect(setups).toHaveLength(1);

    const existing = buildAutoObFvgAlarm(setups[0], { now: 1700000000000, randSuffix: 1 });
    expect(existing.exchange).toBe("binance");
    expect(existing.poiMetadata?.zoneBottom).toBe(2980);
    expect(existing.poiMetadata?.zoneTop).toBe(3030);

    const { alertsToArm, skippedDuplicatesCount } = selectNonDuplicateAutoAlarms(
      setups,
      [existing]
    );
    expect(alertsToArm).toHaveLength(0);
    expect(skippedDuplicatesCount).toBe(1);

    const log = {
      id: "log-1",
      alertId: existing.id,
      symbol: existing.symbol,
      triggerPrice: 3029.5,
      targetPrice: existing.targetPrice,
      condition: existing.condition,
      sourceType: existing.sourceType,
      label: existing.label,
      triggeredAt: Date.now(),
      exchange: existing.exchange,
      poiMetadata: existing.poiMetadata,
    };

    const discord = formatDiscordPayload(existing, log);
    const fields = discord.embeds?.[0]?.fields || [];
    expect(fields.some((f) => f.name === "Exchange" && f.value.includes("BINANCE PERPS"))).toBe(
      true
    );
    expect(
      fields.some(
        (f) => f.name.includes("Validated OB Range") && f.value.includes("2,980.00")
      )
    ).toBe(true);

    const tg = formatTelegramMessage(existing, log);
    expect(tg).toContain("BINANCE PERPS");
    expect(tg).toContain("Validated OB Range (1H)");
  });
});

describe("ServerAlertDaemon exchange isolation for Bybit & Binance OB+FVG alarms", () => {
  const testUserId = "test-user-bybit-ob-fvg";
  const dataDir = path.join(process.cwd(), ".data");
  const alertsFile = path.join(dataDir, "alerts.json");
  const logsFile = path.join(dataDir, "alert-logs.json");
  let originalAlerts: string | null = null;
  let originalLogs: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(alertsFile)) originalAlerts = fs.readFileSync(alertsFile, "utf-8");
    if (fs.existsSync(logsFile)) originalLogs = fs.readFileSync(logsFile, "utf-8");
  });

  afterEach(() => {
    const restoreOrClean = (file: string, orig: string | null) => {
      if (orig !== null) {
        fs.writeFileSync(file, orig, "utf-8");
      } else if (fs.existsSync(file)) {
        try {
          const map = JSON.parse(fs.readFileSync(file, "utf-8"));
          delete map[testUserId];
          fs.writeFileSync(file, JSON.stringify(map, null, 2), "utf-8");
        } catch {}
      }
    };
    restoreOrClean(alertsFile, originalAlerts);
    restoreOrClean(logsFile, originalLogs);
    vi.restoreAllMocks();
  });

  it("checks Bybit OB alarms strictly on Bybit updates and preserves OB range + exchange in logs", async () => {
    const token: MexcRankedToken = {
      symbol: "BTCUSDT",
      name: "Bitcoin",
      category: "majors",
      mexcRank: 1,
      mexcPrice: 88000,
      mexcVolume24h: 3e9,
      mexcChange24h: 2,
    };
    const bars: CandlestickBar[] = [
      makeBar(0, 86000, 86200, 85500, 85600),
      makeBar(1, 85600, 87500, 85600, 87400),
      makeBar(2, 87400, 88600, 87000, 88500),
      makeBar(3, 88500, 89000, 88200, 88800),
    ];
    const [setup] = detectUnmitigatedObFvgBars(bars, token, "4H", "bybit");
    const alert = buildAutoObFvgAlarm(setup, {
      notifyDiscord: false,
      notifyTelegram: false,
      now: Date.now(),
    });
    await saveServerAlert(alert, testUserId);

    const daemon = new ServerAlertDaemon();
    await daemon.refreshActiveAlerts();

    // MEXC price crossing 86200 must NOT trigger a Bybit-scoped alarm
    await daemon.processPriceUpdate("BTCUSDT", 87000, "mexc");
    await daemon.processPriceUpdate("BTCUSDT", 86100, "mexc");
    let logs = await getServerAlertLogs(testUserId);
    expect(logs.some((l) => l.alertId === alert.id)).toBe(false);

    // Bybit price crossing 86200 MUST trigger & record exchange + OB range on log
    await daemon.processPriceUpdate("BTCUSDT", 86500, "bybit");
    await daemon.processPriceUpdate("BTCUSDT", 86150, "bybit");
    logs = await getServerAlertLogs(testUserId);
    const hit = logs.find((l) => l.alertId === alert.id);
    expect(hit).toBeDefined();
    expect(hit!.exchange).toBe("bybit");
    expect(hit!.poiMetadata?.zoneBottom).toBe(85500);
    expect(hit!.poiMetadata?.zoneTop).toBe(86200);
  });
});
