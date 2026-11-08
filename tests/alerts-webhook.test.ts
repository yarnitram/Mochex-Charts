import { describe, it, expect } from "vitest";
import {
  isValidDiscordWebhookUrl,
  isValidTelegramBotToken,
  isValidTelegramChatId,
  formatDiscordPayload,
  formatTelegramMessage,
  escapeHtml,
} from "../src/lib/alerts/webhook-dispatcher";
import { PriceAlert, AlertLogEntry } from "../src/lib/alerts/alerts-engine";

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
});
