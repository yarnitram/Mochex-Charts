import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectPoiInvalidationBreak,
  formatPoiInvalidationTelegramMessage,
  formatPoiInvalidationDiscordPayload,
  dispatchPoiInvalidationWebhook,
} from "../src/lib/indicators/poi-invalidation-engine";
import { RadarPoiItem } from "../src/lib/indicators/radar-poi-engine";
import {
  formatTelegramMessage,
  formatDiscordPayload,
} from "../src/lib/alerts/webhook-dispatcher";
import { PriceAlert, AlertLogEntry } from "../src/lib/alerts/alerts-engine";
import {
  generateRadarCsv,
  generateRadarJson,
  ExportableRadarItem,
} from "../src/lib/screener/radar-export";
import { formatTelegramRadarReport } from "../src/lib/telegram/telegram-bot-engine";

describe("Real-Time POI Break & Invalidation Telegram Push with Stop-Out Telemetry (DEC-150)", () => {
  const bullishPoi: RadarPoiItem = {
    id: "poi-bull-1",
    symbol: "BTCUSDT",
    timeframe: "15m",
    category: "order_block",
    type: "BULLISH",
    label: "BULLISH OB (+2C FVG)",
    top: 65200,
    bottom: 65000,
    meanThreshold: 65100,
    entryPrice: 65200,
    fullRetestPrice: 65000,
    invalidationPrice: 65000,
    status: "testing",
    isInsideZone: true,
    distanceToEntryPct: 0,
    distanceToMtPct: 0.1,
    currentPrice: 65050,
    time: Date.now(),
  };

  const bearishPoi: RadarPoiItem = {
    ...bullishPoi,
    id: "poi-bear-1",
    type: "BEARISH",
    category: "sandwich_zone",
    label: "Supply Sandwich (RGRR) ++",
    top: 66000,
    bottom: 65800,
    meanThreshold: 65900,
    entryPrice: 65800,
    fullRetestPrice: 66000,
    invalidationPrice: 66000,
  };

  describe("detectPoiInvalidationBreak unit tests", () => {
    it("returns null when price remains intact inside or above a Bullish POI", () => {
      expect(detectPoiInvalidationBreak(bullishPoi, 65300)).toBeNull();
      expect(detectPoiInvalidationBreak(bullishPoi, 65050)).toBeNull();
      expect(detectPoiInvalidationBreak(bullishPoi, 65000)).toBeNull();
    });

    it("detects Bullish Demand breakdown and calculates overshoot and severity", () => {
      // 1. Clean Stop (<= 0.5% overshoot): 64850 vs 65000 -> -150 / 65000 = 0.23%
      const cleanBreak = detectPoiInvalidationBreak(bullishPoi, 64850, 65010);
      expect(cleanBreak).not.toBeNull();
      expect(cleanBreak!.direction).toBe("BULLISH");
      expect(cleanBreak!.invalidationPrice).toBe(65000);
      expect(cleanBreak!.breachPrice).toBe(64850);
      expect(cleanBreak!.overshootUsd).toBe(150);
      expect(cleanBreak!.overshootPct).toBeCloseTo(0.23, 1);
      expect(cleanBreak!.breachType).toBe("WICK_PENETRATION");
      expect(cleanBreak!.severity).toBe("CLEAN_STOP");
      expect(cleanBreak!.actionRecommendation).toContain("Cancel resting BUY limit orders");

      // 2. Gap Slippage (0.5% - 1.5%): 64350 vs 65000 -> -650 / 65000 = 1.0%
      const slippageBreak = detectPoiInvalidationBreak(bullishPoi, 64350, 64350);
      expect(slippageBreak!.severity).toBe("GAP_SLIPPAGE");
      expect(slippageBreak!.breachType).toBe("CANDLE_CLOSE_BREAK");

      // 3. Flash Breach (> 1.5%): 63500 vs 65000 -> -1500 / 65000 = 2.31%
      const flashBreak = detectPoiInvalidationBreak(bullishPoi, 63500, 63500);
      expect(flashBreak!.severity).toBe("FLASH_BREACH");
      expect(flashBreak!.mitigationAdvice).toContain("Aggressive liquidation cascade");
    });

    it("detects Bearish Supply breakout and calculates overshoot and severity", () => {
      // Price pushes above 66000 to 66500 -> +500 / 66000 = 0.76%
      const bearBreak = detectPoiInvalidationBreak(bearishPoi, 66500, 66500);
      expect(bearBreak).not.toBeNull();
      expect(bearBreak!.direction).toBe("BEARISH");
      expect(bearBreak!.overshootUsd).toBe(500);
      expect(bearBreak!.overshootPct).toBeCloseTo(0.76, 1);
      expect(bearBreak!.severity).toBe("GAP_SLIPPAGE");
      expect(bearBreak!.breachType).toBe("CANDLE_CLOSE_BREAK");
      expect(bearBreak!.actionRecommendation).toContain("Cancel resting SHORT limit orders");
    });
  });

  describe("Telegram & Discord Payload Formatters", () => {
    it("formats institutional HTML Telegram message and Discord embed", () => {
      const telemetry = detectPoiInvalidationBreak(bullishPoi, 64800, 64800)!;
      const tgMsg = formatPoiInvalidationTelegramMessage(telemetry);

      expect(tgMsg).toContain("MOCHEX POI INVALIDATION & STOP-OUT ALERT");
      expect(tgMsg).toContain("BTCUSDT [15m]");
      expect(tgMsg).toContain("$64800");
      expect(tgMsg).toContain("CANDLE CLOSE BREAK");
      expect(tgMsg).toContain("CLEAN STOP-OUT");

      const dcPayload = formatPoiInvalidationDiscordPayload(telemetry);
      expect(dcPayload.embeds.length).toBe(1);
      expect(dcPayload.embeds[0].color).toBe(0xef4444);
      expect(dcPayload.embeds[0].title).toContain("POI INVALIDATED: BTCUSDT [15m]");
      expect(dcPayload.embeds[0].fields.length).toBe(6);
    });

    it("integrates seamlessly with webhook-dispatcher formatTelegramMessage and formatDiscordPayload", () => {
      const telemetry = detectPoiInvalidationBreak(bearishPoi, 67200, 67200)!;
      const mockAlert: PriceAlert = {
        id: "alert-inv-1",
        symbol: "BTCUSDT",
        targetPrice: 66000,
        condition: "crossing_up",
        frequency: "only_once",
        sourceType: "indicator_condition",
        label: "BTC 15m Supply Sandwich",
        active: false,
        triggeredCount: 1,
        createdAt: Date.now(),
        breakTelemetry: telemetry,
      };
      const mockLog: AlertLogEntry = {
        id: "log-1",
        alertId: "alert-inv-1",
        symbol: "BTCUSDT",
        triggerPrice: 67200,
        targetPrice: 66000,
        condition: "crossing_up",
        label: "BTC 15m Supply Sandwich",
        triggeredAt: Date.now(),
      };

      const tgText = formatTelegramMessage(mockAlert, mockLog);
      expect(tgText).toContain("MOCHEX POI INVALIDATION & STOP-OUT ALERT");
      expect(tgText).toContain("FLASH BREACH");

      const dcBody = formatDiscordPayload(mockAlert, mockLog);
      expect(dcBody.username).toBe("Mochex Invalidation Alert");
      expect(dcBody.embeds?.[0].color).toBe(0xef4444);
    });
  });

  describe("dispatchPoiInvalidationWebhook network dispatch", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("dispatches HTTP POST to Telegram and Discord endpoints", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "ok",
      } as Response);

      const telemetry = detectPoiInvalidationBreak(bullishPoi, 64700, 64700)!;
      const res = await dispatchPoiInvalidationWebhook(
        {
          discordEnabled: true,
          discordWebhookUrl: "https://discord.com/api/webhooks/12345/abcdef",
          telegramEnabled: true,
          telegramBotToken: "123456:ABC-DEF",
          telegramChatId: "-100987654",
        },
        telemetry
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(res.telegram?.ok).toBe(true);
      expect(res.discord?.ok).toBe(true);
    });
  });

  describe("Export & Telegram Bot Radar Filter Integration", () => {
    it("includes Invalidation Status and Stop-Out Overshoot % in CSV and JSON exports", () => {
      const telemetry = detectPoiInvalidationBreak(bullishPoi, 64500, 64500)!;
      const item: ExportableRadarItem = {
        symbol: "BTCUSDT",
        name: "Bitcoin",
        price: 64500,
        change24h: -2.4,
        volume24h: 1200000000,
        selectedPoi: {
          ...bullishPoi,
          status: "broken",
          breakTelemetry: telemetry,
        },
      };

      const csv = generateRadarCsv([item]);
      expect(csv).toContain("Invalidation Status");
      expect(csv).toContain("Stop-Out Overshoot %");
      expect(csv).toContain("BROKEN (GAP_SLIPPAGE)");
      expect(csv).toContain("-0.77%");

      const json = generateRadarJson([item], {
        universeName: "Majors",
        categoryFilter: "broken",
        timeframe: "15m",
        totalCoins: 1,
      });
      const parsed = JSON.parse(json);
      expect(parsed.items[0].poi.breakTelemetry).toBeDefined();
      expect(parsed.items[0].poi.breakTelemetry.severity).toBe("GAP_SLIPPAGE");
    });

    it("filters broken POIs and renders stop-out badge in Telegram Bot /broken report", () => {
      const telemetry = detectPoiInvalidationBreak(bullishPoi, 64500, 64500)!;
      const brokenPoi: RadarPoiItem = {
        ...bullishPoi,
        status: "broken",
        breakTelemetry: telemetry,
      };

      const report = formatTelegramRadarReport([brokenPoi, bearishPoi], "broken");
      expect(report.text).toContain("Invalidated / Collapsed Setups");
      expect(report.text).toContain("🚨 <b>BROKEN (-0.77%)</b>");
    });
  });
});
