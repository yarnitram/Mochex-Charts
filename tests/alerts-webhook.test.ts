import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  isValidDiscordWebhookUrl,
  isValidTelegramBotToken,
  isValidTelegramChatId,
  formatDiscordPayload,
  formatTelegramMessage,
  escapeHtml,
  resolveDiscordWebhookTarget,
  getDiscordWebhookStatus,
  dispatchDirectWebhooks,
  AlertWebhookConfig,
} from "../src/lib/alerts/webhook-dispatcher";
import { PriceAlert, AlertLogEntry } from "../src/lib/alerts/alerts-engine";
import {
  buildMochexChartUrl,
  normalizeChartSymbolParam,
  normalizeChartTimeframeParam,
  resolveChartIndicatorsParam,
} from "../src/lib/chart/chart-url";
import {
  clearMaxLeverageCache,
  resolveMaxLeverageInfo,
} from "../src/lib/screener/leverage-lookup";

describe("Discord & Telegram Alert Webhook Dispatcher (DEC-130)", () => {
  const sampleAlert: PriceAlert = {
    id: "alert-btc-1",
    symbol: "BTCUSDT",
    targetPrice: 68500,
    condition: "crossing_up",
    frequency: "only_once",
    sourceType: "horizontal_line",
    label: "BTC Key Breakout",
    active: true,
    triggeredCount: 1,
    createdAt: 1700000000000,
    notifyDiscord: true,
    notifyTelegram: true,
  };

  const sampleLog: AlertLogEntry = {
    id: "log-1",
    alertId: "alert-btc-1",
    symbol: "BTCUSDT",
    triggerPrice: 68520.5,
    targetPrice: 68500,
    condition: "crossing_up",
    sourceType: "horizontal_line",
    label: "BTC Key Breakout",
    message: "Resistance flipped into support",
    triggeredAt: 1700000060000,
  };

  describe("URL & Token Validation", () => {
    it("validates Discord webhook URLs accurately", () => {
      expect(
        isValidDiscordWebhookUrl(
          "https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz"
        )
      ).toBe(true);
      expect(
        isValidDiscordWebhookUrl(
          "https://discordapp.com/api/webhooks/987654321/token123"
        )
      ).toBe(true);
      expect(isValidDiscordWebhookUrl("http://localhost:3000/mock-webhook")).toBe(true);

      // Invalid URLs
      expect(isValidDiscordWebhookUrl("https://slack.com/webhook")).toBe(false);
      expect(isValidDiscordWebhookUrl("https://discord.com/other-endpoint")).toBe(false);
      expect(isValidDiscordWebhookUrl("")).toBe(false);
      expect(isValidDiscordWebhookUrl(undefined)).toBe(false);
    });

    it("validates Telegram bot tokens and chat IDs accurately", () => {
      expect(isValidTelegramBotToken("123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_1234")).toBe(true);
      expect(isValidTelegramBotToken("invalid-token-no-colon")).toBe(false);
      expect(isValidTelegramBotToken("12345:short")).toBe(false);
      expect(isValidTelegramBotToken("")).toBe(false);
      expect(isValidTelegramBotToken(undefined)).toBe(false);

      expect(isValidTelegramChatId("987654321")).toBe(true);
      expect(isValidTelegramChatId("-1001234567890")).toBe(true);
      expect(isValidTelegramChatId("@my_trading_channel")).toBe(true);
      expect(isValidTelegramChatId("")).toBe(false);
      expect(isValidTelegramChatId(undefined)).toBe(false);
    });
  });

  describe("Discord Payload Formatting", () => {
    it("generates institutional rich embeds with color coding and field badges", () => {
      const payload = formatDiscordPayload(sampleAlert, sampleLog);

      expect(payload.username).toBe("Mochex Alerts");
      expect(payload.embeds).toHaveLength(1);

      const embed = payload.embeds![0];
      expect(embed.title).toContain("[BTC/USDT] Alert Triggered: BTC Key Breakout");
      expect(embed.description).toContain("Market event detected on **BTC/USDT**");
      expect(embed.color).toBe(49287); // Green for crossing_up

      const fields = embed.fields!;
      expect(fields.find((f) => f.name === "Trigger Price")?.value).toContain("68,520.50");
      expect(fields.find((f) => f.name === "Target Level")?.value).toContain("68,500.00");
      expect(fields.find((f) => f.name === "Condition")?.value).toBe("**CROSSING UP**");
      expect(fields.find((f) => f.name === "Source")?.value).toBe("HORIZONTAL LINE");
      expect(fields.find((f) => f.name === "Signal Note")?.value).toBe("Resistance flipped into support");
      expect(embed.footer?.text).toContain("Mochex Institutional Charts");
    });

    it("applies red color for bearish crossing_down events", () => {
      const bearishLog: AlertLogEntry = {
        ...sampleLog,
        condition: "crossing_down",
        triggerPrice: 68480,
      };
      const payload = formatDiscordPayload(sampleAlert, bearishLog);
      expect(payload.embeds![0].color).toBe(16726832); // Red (#ff3b30)
    });
  });

  describe("Telegram HTML Formatting", () => {
    it("generates structured HTML with proper escaping for Telegram sendMessage", () => {
      const tgText = formatTelegramMessage(sampleAlert, sampleLog);

      expect(tgText).toContain("🚨 <b>[Mochex Alert] BTC/USDT</b>");
      expect(tgText).toContain("<b>Event:</b> BTC Key Breakout");
      expect(tgText).toContain("<b>Condition:</b> <code>CROSSING UP</code>");
      expect(tgText).toContain("<b>Trigger Price:</b> <code>$68,520.50</code>");
      expect(tgText).toContain("<b>Target Level:</b> <code>$68,500.00</code>");
      expect(tgText).toContain("<b>Signal:</b> Resistance flipped into support");
    });

    it("escapes special HTML characters properly", () => {
      expect(escapeHtml("<script>alert('xss')</script> & 1 < 2")).toBe(
        "&lt;script&gt;alert('xss')&lt;/script&gt; &amp; 1 &lt; 2"
      );
    });
  });

  describe("Per-Account Webhook Database Persistence (DEC-162)", () => {
    const testUserA = "test-trader-account-a";
    const testUserB = "test-trader-account-b";
    const webhooksFile = path.join(process.cwd(), ".data", "webhooks.json");
    let originalWebhooks: string | null = null;

    beforeEach(() => {
      try {
        if (fs.existsSync(webhooksFile)) {
          originalWebhooks = fs.readFileSync(webhooksFile, "utf-8");
        }
      } catch {}
    });

    afterEach(() => {
      try {
        if (originalWebhooks !== null) {
          fs.writeFileSync(webhooksFile, originalWebhooks, "utf-8");
        } else if (fs.existsSync(webhooksFile)) {
          fs.unlinkSync(webhooksFile);
        }
      } catch {}
    });

    it("saves and isolates webhooks per user account", async () => {
      const { saveServerWebhooks, getServerWebhooks } = await import(
        "../src/lib/alerts/server-alerts-store"
      );

      const cfgA = {
        discordWebhookUrl: "https://discord.com/api/webhooks/111/aaa",
        discordEnabled: true,
        telegramBotToken: "111:token-a",
        telegramChatId: "99901",
        telegramEnabled: true,
      };

      const cfgB = {
        discordWebhookUrl: "https://discord.com/api/webhooks/222/bbb",
        discordEnabled: true,
        telegramBotToken: "222:token-b",
        telegramChatId: "99902",
        telegramEnabled: true,
      };

      await saveServerWebhooks(testUserA, cfgA);
      await saveServerWebhooks(testUserB, cfgB);

      const fetchedA = await getServerWebhooks(testUserA);
      const fetchedB = await getServerWebhooks(testUserB);

      expect(fetchedA?.discordWebhookUrl).toBe(cfgA.discordWebhookUrl);
      expect(fetchedA?.telegramBotToken).toBe(cfgA.telegramBotToken);

      expect(fetchedB?.discordWebhookUrl).toBe(cfgB.discordWebhookUrl);
      expect(fetchedB?.telegramBotToken).toBe(cfgB.telegramBotToken);
    });

    it("migrates default-trader webhooks to new authenticated user accounts", async () => {
      const { saveServerWebhooks, getServerWebhooks } = await import(
        "../src/lib/alerts/server-alerts-store"
      );

      const unauthenticatedCfg = {
        discordWebhookUrl: "https://discord.com/api/webhooks/default/xyz",
        discordEnabled: true,
        telegramBotToken: "333:token-default",
        telegramChatId: "99903",
        telegramEnabled: true,
      };

      await saveServerWebhooks("default-trader", unauthenticatedCfg);

      const freshUser = "newly-registered-user-999";
      const migrated = await getServerWebhooks(freshUser);

      expect(migrated).toBeDefined();
      expect(migrated?.discordWebhookUrl).toBe(unauthenticatedCfg.discordWebhookUrl);
      expect(migrated?.telegramBotToken).toBe(unauthenticatedCfg.telegramBotToken);
    });
  });

  describe("Separate Discord Channel Routing (Default / OB / EMA)", () => {
    const cfg: AlertWebhookConfig = {
      discordWebhookUrl: "https://discord.com/api/webhooks/100/default",
      discordEnabled: true,
      discordObWebhookUrl: "https://discord.com/api/webhooks/200/ob",
      discordObEnabled: true,
      discordEmaWebhookUrl: "https://discord.com/api/webhooks/300/ema",
      discordEmaEnabled: true,
    };

    it("routes EMA alerts, OB alerts, and Default alerts to their dedicated Discord webhooks", () => {
      const emaTarget = resolveDiscordWebhookTarget(cfg, {
        ...sampleAlert,
        id: "auto-ema-1",
        emaMetadata: { period: 200, timeframe: "4H", direction: "SUPPORT", autoArmed: true },
      });
      expect(emaTarget).toEqual({
        route: "ema",
        url: "https://discord.com/api/webhooks/300/ema",
        enabled: true,
        isDedicated: true,
      });

      const obTarget = resolveDiscordWebhookTarget(cfg, {
        ...sampleAlert,
        id: "auto-ob-1",
        poiMetadata: {
          poiId: "poi-1",
          category: "order_block",
          direction: "BULLISH",
          timeframe: "1H",
          zoneTop: 105,
          zoneBottom: 100,
        },
      });
      expect(obTarget).toEqual({
        route: "ob",
        url: "https://discord.com/api/webhooks/200/ob",
        enabled: true,
        isDedicated: true,
      });

      const defaultTarget = resolveDiscordWebhookTarget(cfg, sampleAlert);
      expect(defaultTarget).toEqual({
        route: "default",
        url: "https://discord.com/api/webhooks/100/default",
        enabled: true,
        isDedicated: false,
      });
    });

    it("falls back to Default channel when dedicated OB/EMA URLs are empty", () => {
      const fallbackCfg: AlertWebhookConfig = {
        discordWebhookUrl: "https://discord.com/api/webhooks/100/default",
        discordEnabled: true,
      };
      expect(
        resolveDiscordWebhookTarget(fallbackCfg, {
          ...sampleAlert,
          emaMetadata: { period: 50, timeframe: "1H" },
        }).url
      ).toBe("https://discord.com/api/webhooks/100/default");

      expect(getDiscordWebhookStatus({ discordEmaWebhookUrl: "https://discord.com/api/webhooks/300/ema", discordEmaEnabled: true })).toEqual({
        anyConfigured: true,
        anyEnabled: true,
      });
    });

    it("dispatches to the dedicated EMA Discord webhook URL via dispatchDirectWebhooks", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }));

      const emaAlert: PriceAlert = {
        ...sampleAlert,
        id: "auto-ema-sol",
        symbol: "SOLUSDT",
        emaMetadata: { period: 100, timeframe: "4H", direction: "SUPPORT", autoArmed: true },
      };

      const res = await dispatchDirectWebhooks(cfg, emaAlert, {
        ...sampleLog,
        alertId: emaAlert.id,
        symbol: "SOLUSDT",
      });

      expect(res.discord?.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://discord.com/api/webhooks/300/ema");
      fetchSpy.mockRestore();
    });
  });

  describe("Discord Max Leverage, Invalidation & Parameterized Chart URL", () => {
    it("normalizes /chart query parameters and builds full parameterized URLs", () => {
      expect(normalizeChartSymbolParam("sol/usdt")).toBe("SOLUSDT");
      expect(normalizeChartTimeframeParam("1H")).toBe("60");
      expect(normalizeChartTimeframeParam("4h")).toBe("240");
      expect(resolveChartIndicatorsParam("validated-ob-radar,ema")).toEqual([
        "Validated OB (Radar / Alarm)",
        "MTF EMA \u2014 20/50/100/200",
      ]);

      const url = buildMochexChartUrl({
        baseUrl: "https://charts.mochex.io",
        symbol: "SOL/USDT",
        timeframe: "1H",
        exchange: "bybit",
        indicator: "validated-ob-radar",
        targetPrice: 145.1234567,
      });
      expect(url).toBe(
        "https://charts.mochex.io/chart?symbol=SOLUSDT&tf=1H&exchange=bybit&indicator=validated-ob-radar&target=145.1234567"
      );
    });

    it("includes Max Leverage, Invalidation, clickable embed.url, and Mochex Chart link in Discord & Telegram payloads", () => {
      const obAlert: PriceAlert = {
        ...sampleAlert,
        id: "auto-ob-pepe-1",
        symbol: "PEPEUSDT",
        targetPrice: 0.000012345,
        invalidationPrice: 0.0000118,
        exchange: "bybit",
        maxLeverage: 50,
        maxLeverageSource: "bybit",
        poiMetadata: {
          poiId: "poi-pepe-1",
          category: "order_block",
          direction: "BULLISH",
          timeframe: "1H",
          zoneTop: 0.000012345,
          zoneBottom: 0.0000118,
          invalidationPrice: 0.0000118,
        },
      };
      const obLog: AlertLogEntry = {
        ...sampleLog,
        alertId: obAlert.id,
        symbol: "PEPEUSDT",
        triggerPrice: 0.00001234,
        targetPrice: 0.000012345,
        exchange: "bybit",
        maxLeverage: 50,
        maxLeverageSource: "bybit",
        poiMetadata: obAlert.poiMetadata,
      };

      const discord = formatDiscordPayload(obAlert, obLog, {
        baseUrl: "https://mochex.local:3018",
      });
      const embed = discord.embeds![0]!;
      expect(embed.url).toContain("https://mochex.local:3018/chart?symbol=PEPEUSDT");
      expect(embed.url).toContain("tf=1H");
      expect(embed.url).toContain("indicator=validated-ob-radar");

      const levField = embed.fields!.find((f) => f.name === "Max Leverage");
      expect(levField?.value).toBe("`50x (BYBIT)`");

      const invField = embed.fields!.find((f) => f.name === "Invalidation");
      expect(invField?.value).toBe("`$0.00001180`");

      const chartField = embed.fields!.find((f) => f.name === "Mochex Chart");
      expect(chartField?.value).toContain("https://mochex.local:3018/chart?symbol=PEPEUSDT");

      const tg = formatTelegramMessage(obAlert, obLog, {
        baseUrl: "https://mochex.local:3018",
      });
      expect(tg).toContain("<b>Max Leverage:</b> <code>50x (BYBIT)</code>");
      expect(tg).toContain("https://mochex.local:3018/chart?symbol=PEPEUSDT");
    });

    it("resolves & caches live max leverage from Bybit and MEXC public instrument APIs", async () => {
      clearMaxLeverageCache();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("bybit.com")) {
          return new Response(
            JSON.stringify({
              retCode: 0,
              result: {
                list: [{ symbol: "BTCUSDT", leverageFilter: { maxLeverage: "150.00" } }],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            data: [{ symbol: "WIF_USDT", maxLeverage: 100 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const bybitLev = await resolveMaxLeverageInfo("BTCUSDT", "bybit");
      expect(bybitLev).toEqual({ maxLeverage: 150, source: "bybit" });

      const fallbackLev = await resolveMaxLeverageInfo("WIFUSDT", "binance");
      expect(fallbackLev).toEqual({ maxLeverage: 100, source: "mexc" });

      fetchSpy.mockRestore();
      clearMaxLeverageCache();
    });
  });
});
