import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidTradingWebhookUrl,
  getDefaultTradingWebhookTemplate,
  formatTradingWebhookPayload,
  dispatchDirectWebhooks,
  TradingWebhookConfig,
  AlertWebhookConfig,
} from "../src/lib/alerts/webhook-dispatcher";
import { PriceAlert, AlertLogEntry } from "../src/lib/alerts/alerts-engine";

describe("Automated Trading Webhook Dispatcher Engine (DEC-148)", () => {
  const sampleBullishAlert: PriceAlert = {
    id: "alert-btc-4h-demand",
    symbol: "BTCUSDT",
    targetPrice: 76500,
    condition: "crossing_down",
    frequency: "only_once",
    sourceType: "indicator_condition",
    label: "BTC 4H Bullish OB (Zone Entry)",
    active: true,
    triggeredCount: 1,
    createdAt: 1731000000000,
    notifyTradingWebhook: true,
  };

  const sampleBullishLog: AlertLogEntry = {
    id: "log-btc-4h-demand",
    alertId: "alert-btc-4h-demand",
    symbol: "BTCUSDT",
    triggerPrice: 76480.5,
    targetPrice: 76500,
    condition: "crossing_down",
    sourceType: "indicator_condition",
    label: "BTC 4H Bullish OB (Zone Entry)",
    message: "Price entered 4H institutional demand block",
    triggeredAt: 1731000060000,
  };

  const sampleBearishAlert: PriceAlert = {
    id: "alert-eth-1h-supply",
    symbol: "ETHUSDT",
    targetPrice: 3200,
    condition: "crossing_up",
    frequency: "only_once",
    sourceType: "indicator_condition",
    label: "ETH 1H Bearish Supply (Zone Entry)",
    active: true,
    triggeredCount: 1,
    createdAt: 1731000000000,
    notifyTradingWebhook: true,
  };

  const sampleBearishLog: AlertLogEntry = {
    id: "log-eth-1h-supply",
    alertId: "alert-eth-1h-supply",
    symbol: "ETHUSDT",
    triggerPrice: 3205.2,
    targetPrice: 3200,
    condition: "crossing_up",
    sourceType: "indicator_condition",
    label: "ETH 1H Bearish Supply (Zone Entry)",
    message: "Price tapped 1H institutional supply zone",
    triggeredAt: 1731000060000,
  };

  describe("URL Validation (isValidTradingWebhookUrl)", () => {
    it("validates standard HTTPS webhook endpoints", () => {
      expect(isValidTradingWebhookUrl("https://app.3commas.io/trade_signal/v2")).toBe(true);
      expect(isValidTradingWebhookUrl("https://trading.cornix.io/api/v1/tradingview-webhook")).toBe(true);
      expect(isValidTradingWebhookUrl("https://my-trading-bot.domain.com/signals")).toBe(true);
    });

    it("accepts localhost for development testing", () => {
      expect(isValidTradingWebhookUrl("http://localhost:3000/api/mock-webhook")).toBe(true);
    });

    it("rejects non-HTTP protocols, empty strings, and malformed URLs", () => {
      expect(isValidTradingWebhookUrl("ftp://trading.com/feed")).toBe(false);
      expect(isValidTradingWebhookUrl("ws://localhost:8080")).toBe(false);
      expect(isValidTradingWebhookUrl("")).toBe(false);
      expect(isValidTradingWebhookUrl(undefined)).toBe(false);
    });
  });

  describe("Template Retrieval (getDefaultTradingWebhookTemplate)", () => {
    it("returns platform-specific default templates with required tokens", () => {
      const threeCommas = getDefaultTradingWebhookTemplate("3commas");
      expect(threeCommas).toContain('"message_type": "bot"');
      expect(threeCommas).toContain("{{bot_id}}");
      expect(threeCommas).toContain("{{pair_underscore}}");
      expect(threeCommas).toContain("{{action_lower}}");

      const cornix = getDefaultTradingWebhookTemplate("cornix");
      expect(cornix).toContain('"secret": "{{secret_token}}"');
      expect(cornix).toContain("{{pair_slash}}");
      expect(cornix).toContain("{{stop_loss}}");
      expect(cornix).toContain("{{take_profit_2r}}");

      const custom = getDefaultTradingWebhookTemplate("custom");
      expect(custom).toContain("{{symbol}}");
      expect(custom).toContain("{{action_upper}}");
      expect(custom).toContain("{{sentiment}}");
    });
  });

  describe("3Commas Payload Interpolation", () => {
    it("formats 3Commas bot payload with USDT_BTC pair convention and buy action", () => {
      const config: TradingWebhookConfig = {
        enabled: true,
        platform: "3commas",
        webhookUrl: "https://app.3commas.io/trade_signal/v2",
        botId: "9876543",
        secretToken: "secret-token-3commas-123",
      };

      const result = formatTradingWebhookPayload(config, sampleBullishAlert, sampleBullishLog);
      expect(result.payload).toEqual({
        message_type: "bot",
        bot_id: "9876543",
        email_token: "secret-token-3commas-123",
        delay_seconds: 0,
        pair: "USDT_BTC",
        action: "buy",
      });
      expect(result.headers["Content-Type"]).toBe("application/json");
    });

    it("formats 3Commas bot payload with sell action for bearish supply breaches", () => {
      const config: TradingWebhookConfig = {
        enabled: true,
        platform: "3commas",
        botId: "1234567",
        secretToken: "token-bearish-999",
      };

      const result = formatTradingWebhookPayload(config, sampleBearishAlert, sampleBearishLog);
      expect(result.payload.action).toBe("sell");
      expect(result.payload.pair).toBe("USDT_ETH");
    });
  });

  describe("Cornix Payload Interpolation", () => {
    it("formats Cornix payload with slashed symbol, numeric prices, SL, and TP targets", () => {
      const config: TradingWebhookConfig = {
        enabled: true,
        platform: "cornix",
        webhookUrl: "https://trading.cornix.io/api/v1/tradingview-webhook",
        secretToken: "cornix-passphrase-alpha",
      };

      const result = formatTradingWebhookPayload(config, sampleBullishAlert, sampleBullishLog);
      expect(result.payload.secret).toBe("cornix-passphrase-alpha");
      expect(result.payload.symbol).toBe("BTC/USDT");
      expect(result.payload.action).toBe("buy");
      expect(result.payload.type).toBe("limit");
      expect(typeof result.payload.price).toBe("number");
      expect(typeof result.payload.stopLoss).toBe("number");
      expect(Array.isArray(result.payload.takeProfits)).toBe(true);
      expect(result.payload.takeProfits.length).toBe(2);

      // Bullish: Stop Loss is below price, TP is above price
      expect(result.payload.stopLoss).toBeLessThan(result.payload.price);
      expect(result.payload.takeProfits[0]).toBeGreaterThan(result.payload.price);
    });
  });

  describe("Custom / TradingView Payload & Per-Alert Override", () => {
    it("replaces custom template tokens with precision values", () => {
      const config: TradingWebhookConfig = {
        enabled: true,
        platform: "custom",
        customTemplate: JSON.stringify({
          coin: "{{symbol}}",
          side: "{{action_upper}}",
          entryPrice: "{{price}}",
          tf: "{{timeframe}}",
          setup: "{{poi_label}}",
        }),
      };

      const result = formatTradingWebhookPayload(config, sampleBullishAlert, sampleBullishLog);
      expect(result.payload.coin).toBe("BTCUSDT");
      expect(result.payload.side).toBe("BUY");
      expect(result.payload.tf).toBe("4H");
      expect(result.payload.setup).toBe("BTC 4H Bullish OB (Zone Entry)");
    });

    it("respects per-alert tradingWebhookOverride template", () => {
      const config: TradingWebhookConfig = {
        enabled: true,
        platform: "3commas",
      };

      const alertWithOverride: PriceAlert = {
        ...sampleBullishAlert,
        tradingWebhookOverride: {
          platform: "custom",
          customTemplate: JSON.stringify({
            signal: "SPECIAL_ORDER",
            asset: "{{symbol}}",
            direction: "{{action_upper}}",
          }),
        },
      };

      const result = formatTradingWebhookPayload(config, alertWithOverride, sampleBullishLog);
      expect(result.payload.signal).toBe("SPECIAL_ORDER");
      expect(result.payload.asset).toBe("BTCUSDT");
      expect(result.payload.direction).toBe("BUY");
    });
  });

  describe("Automated Webhook Dispatch (dispatchDirectWebhooks)", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("dispatches HTTP POST request with formatted JSON payload to trading webhook", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
        json: () => Promise.resolve({ success: true }),
      });
      globalThis.fetch = mockFetch;

      const webhookConfig: AlertWebhookConfig = {
        tradingWebhook: {
          enabled: true,
          platform: "cornix",
          webhookUrl: "https://trading.cornix.io/api/v1/tradingview-webhook",
          secretToken: "test-secret-123",
        },
      };

      const results = await dispatchDirectWebhooks(
        webhookConfig,
        sampleBullishAlert,
        sampleBullishLog
      );

      expect(results.tradingWebhook).toBeDefined();
      expect(results.tradingWebhook?.ok).toBe(true);
      expect(results.tradingWebhook?.status).toBe(200);
      expect(results.tradingWebhook?.platform).toBe("cornix");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("https://trading.cornix.io/api/v1/tradingview-webhook");
      expect(calledOptions.method).toBe("POST");
      expect(calledOptions.headers["Content-Type"]).toBe("application/json");

      const parsedSentBody = JSON.parse(calledOptions.body);
      expect(parsedSentBody.secret).toBe("test-secret-123");
      expect(parsedSentBody.symbol).toBe("BTC/USDT");
      expect(parsedSentBody.action).toBe("buy");
    });

    it("does not dispatch trading webhook if notifyTradingWebhook is false", async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const webhookConfig: AlertWebhookConfig = {
        tradingWebhook: {
          enabled: true,
          webhookUrl: "https://trading.cornix.io/api/v1/tradingview-webhook",
        },
      };

      const alertDisabledTrading: PriceAlert = {
        ...sampleBullishAlert,
        notifyTradingWebhook: false,
      };

      const results = await dispatchDirectWebhooks(
        webhookConfig,
        alertDisabledTrading,
        sampleBullishLog
      );

      expect(results.tradingWebhook).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
