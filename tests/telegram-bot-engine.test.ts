import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseTelegramCommand,
  formatTelegramHelpMessage,
  formatTelegramRadarReport,
  formatTelegramAlertsReport,
  processTelegramUpdate,
  TelegramUpdate,
} from "../src/lib/telegram/telegram-bot-engine";
import { RadarPoiItem } from "../src/lib/indicators/radar-poi-engine";
import { PriceAlert } from "../src/lib/alerts/alerts-engine";

class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

describe("Institutional Telegram Bot Engine (DEC-141)", () => {
  const samplePois: RadarPoiItem[] = [
    {
      id: "poi-btc-4h-ob",
      symbol: "BTCUSDT",
      timeframe: "4H",
      category: "order_block",
      type: "BULLISH",
      label: "4H Bullish OB",
      isPlus: true,
      entryPrice: 76500,
      meanThreshold: 76200,
      fullRetestPrice: 75900,
      top: 76500,
      bottom: 75900,
      status: "testing",
      isInsideZone: true,
      distanceToEntryPct: 0.0,
      distanceToMtPct: 0.4,
      currentPrice: 76400,
      time: 1730000000,
    },
    {
      id: "poi-sol-1h-sandwich",
      symbol: "SOLUSDT",
      timeframe: "1H",
      category: "sandwich_zone",
      type: "BEARISH",
      label: "1H Bearish Sandwich",
      isPlus: false,
      entryPrice: 202.5,
      meanThreshold: 204.0,
      fullRetestPrice: 205.5,
      top: 205.5,
      bottom: 202.5,
      status: "fresh",
      isInsideZone: false,
      distanceToEntryPct: 0.85,
      distanceToMtPct: 1.5,
      currentPrice: 200.8,
      time: 1730000000,
    },
    {
      id: "poi-eth-15m-fvg",
      symbol: "ETHUSDT",
      timeframe: "15m",
      category: "fvg",
      type: "BULLISH",
      label: "15m Bullish FVG",
      isPlus: false,
      entryPrice: 2950,
      meanThreshold: 2935,
      fullRetestPrice: 2920,
      top: 2950,
      bottom: 2920,
      status: "mitigated",
      isInsideZone: false,
      distanceToEntryPct: 2.1,
      distanceToMtPct: 2.5,
      currentPrice: 3012,
      time: 1730000000,
    },
  ];

  beforeEach(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = new MockLocalStorage();
    vi.restoreAllMocks();
  });

  describe("parseTelegramCommand", () => {
    it("parses slash commands without arguments", () => {
      const res = parseTelegramCommand("/radar");
      expect(res.command).toBe("radar");
      expect(res.args).toEqual([]);
    });

    it("parses slash commands with arguments", () => {
      const res = parseTelegramCommand("/radar btc usdt");
      expect(res.command).toBe("radar");
      expect(res.args).toEqual(["btc", "usdt"]);
    });

    it("strips bot mentions like /alerts@mochex_bot", () => {
      const res = parseTelegramCommand("/alerts@mochex_bot");
      expect(res.command).toBe("alerts");
      expect(res.args).toEqual([]);
    });

    it("normalizes command case to lowercase", () => {
      const res = parseTelegramCommand("/WATCHLIST");
      expect(res.command).toBe("watchlist");
    });

    it("returns empty string for non-slash messages", () => {
      expect(parseTelegramCommand("hello world").command).toBe("");
      expect(parseTelegramCommand("").command).toBe("");
      expect(parseTelegramCommand(undefined).command).toBe("");
    });
  });

  describe("formatTelegramHelpMessage", () => {
    it("includes chat ID and interactive keyboard buttons", () => {
      const help = formatTelegramHelpMessage("123456789");
      expect(help.text).toContain("<code>123456789</code>");
      expect(help.text).toContain("/radar");
      expect(help.text).toContain("/alerts");

      expect(help.replyMarkup.inline_keyboard.length).toBeGreaterThanOrEqual(2);
      const flatButtons = help.replyMarkup.inline_keyboard.flat();
      expect(flatButtons.some((b) => b.text.includes("Radar"))).toBe(true);
      expect(flatButtons.some((b) => b.text.includes("Alerts"))).toBe(true);
    });
  });

  describe("formatTelegramRadarReport", () => {
    it("formats all active POIs with institutional formatting and badges", () => {
      const report = formatTelegramRadarReport(samplePois, "all");
      expect(report.text).toContain("📡 <b>MOCHEX INSTITUTIONAL POI RADAR</b>");
      expect(report.text).toContain("BTCUSDT");
      expect(report.text).toContain("SOLUSDT");
      expect(report.text).toContain("🚨 <b>IN-ZONE</b>");
      expect(report.text).toContain("⭐++");
    });

    it("filters to in-zone setups only when requested", () => {
      const report = formatTelegramRadarReport(samplePois, "inzone");
      expect(report.text).toContain("🚨 <b>Active In-Zone Breaches</b>");
      expect(report.text).toContain("BTCUSDT");
      expect(report.text).not.toContain("SOLUSDT"); // SOL is not in zone
    });

    it("filters to sandwich zones only when requested", () => {
      const report = formatTelegramRadarReport(samplePois, "sandwich");
      expect(report.text).toContain("🥪 <b>Sandwich Zones ++");
      expect(report.text).toContain("SOLUSDT");
      expect(report.text).not.toContain("BTCUSDT"); // BTC is OB
    });

    it("filters to FVGs only when requested", () => {
      const report = formatTelegramRadarReport(samplePois, "fvg");
      expect(report.text).toContain("⚡ <b>Fair Value Gaps (FVG)</b>");
      expect(report.text).toContain("ETHUSDT");
    });

    it("provides interactive inline keyboard for 1-tap filtering", () => {
      const report = formatTelegramRadarReport(samplePois);
      const buttons = report.replyMarkup.inline_keyboard.flat();
      expect(buttons.some((b) => b.callback_data === "cmd:radar:inzone")).toBe(true);
      expect(buttons.some((b) => b.callback_data === "cmd:radar:sandwich")).toBe(true);
      expect(buttons.some((b) => b.callback_data === "cmd:radar:fvg")).toBe(true);
    });
  });

  describe("formatTelegramAlertsReport", () => {
    it("informs unlinked users with their chat ID and connection steps", () => {
      const report = formatTelegramAlertsReport([], false, "987654321");
      expect(report.text).toContain("⚠️ <b>Account Not Linked</b>");
      expect(report.text).toContain("<code>987654321</code>");
      expect(report.text).toContain("Notification Channels");
    });

    it("lists active cloud alerts for linked users", () => {
      const mockAlerts: PriceAlert[] = [
        {
          id: "alert-1",
          symbol: "BTCUSDT",
          targetPrice: 76000,
          condition: "crossing_down",
          frequency: "only_once",
          sourceType: "indicator_condition",
          label: "BTC 4H OB Entry",
          active: true,
          triggeredCount: 0,
          createdAt: Date.now(),
        },
      ];

      const report = formatTelegramAlertsReport(mockAlerts, true, "12345");
      expect(report.text).toContain("🔔 <b>YOUR 24/7 CLOUD ALERTS</b>");
      expect(report.text).toContain("BTCUSDT");
      expect(report.text).toContain("$76000.00");
      expect(report.text).toContain("Active: <b>1</b>");
    });
  });

  describe("processTelegramUpdate", () => {
    it("handles /help command and dispatches message", async () => {
      // Mock fetch
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 101 } }),
      } as any);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 10,
          chat: { id: 777888, type: "private" },
          date: 1730000000,
          text: "/help",
        },
      };

      const res = await processTelegramUpdate(update, {
        defaultBotToken: "123456:ABC-DEF-MOCK-TOKEN",
      });

      expect(res.handled).toBe(true);
      expect(res.command).toBe("help");
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("handles /ping command and returns server active status", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 102 } }),
      } as any);

      const update: TelegramUpdate = {
        update_id: 2,
        message: {
          message_id: 11,
          chat: { id: 777888, type: "private" },
          date: 1730000000,
          text: "/ping",
        },
      };

      const res = await processTelegramUpdate(update, {
        defaultBotToken: "123456:ABC-DEF-MOCK-TOKEN",
      });

      expect(res.handled).toBe(true);
      expect(res.command).toBe("ping");
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("handles /radar command with POIs", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 103 } }),
      } as any);

      const update: TelegramUpdate = {
        update_id: 3,
        message: {
          message_id: 12,
          chat: { id: 777888, type: "private" },
          date: 1730000000,
          text: "/radar",
        },
      };

      const res = await processTelegramUpdate(update, {
        defaultBotToken: "123456:ABC-DEF-MOCK-TOKEN",
        samplePois,
      });

      expect(res.handled).toBe(true);
      expect(res.command).toBe("radar");
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("handles inline keyboard callback queries and acknowledges query", async () => {
      // 1st fetch: answerCallbackQuery
      // 2nd fetch: sendMessage
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 104 } }),
        } as any);

      const update: TelegramUpdate = {
        update_id: 4,
        callback_query: {
          id: "cb_query_999",
          from: { id: 777888, first_name: "Ymatt" },
          message: {
            message_id: 15,
            chat: { id: 777888, type: "private" },
            date: 1730000000,
          },
          data: "cmd:radar:inzone",
        },
      };

      const res = await processTelegramUpdate(update, {
        defaultBotToken: "123456:ABC-DEF-MOCK-TOKEN",
        samplePois,
      });

      expect(res.handled).toBe(true);
      expect(res.command).toBe("callback:cmd:radar:inzone");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
