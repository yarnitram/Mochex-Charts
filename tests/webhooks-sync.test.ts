import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadClientWebhooks,
  saveClientWebhooks,
  mergeClientAndServerWebhooks,
  WEBHOOKS_STORAGE_KEY,
} from "../src/lib/alerts/webhooks-sync";
import { AlertWebhookConfig } from "../src/lib/alerts/webhook-dispatcher";

describe("Resilient Two-Way Webhook Synchronization (DEC-165)", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    });
    vi.stubGlobal("window", {
      localStorage: global.localStorage,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("loads clean default webhooks when storage is empty", () => {
    const loaded = loadClientWebhooks();
    expect(loaded.discordWebhookUrl).toBe("");
    expect(loaded.discordEnabled).toBe(false);
    expect(loaded.telegramBotToken).toBe("");
    expect(loaded.telegramChatId).toBe("");
    expect(loaded.telegramEnabled).toBe(false);
  });

  it("persists and loads valid client webhooks from localStorage", () => {
    const config: AlertWebhookConfig = {
      discordWebhookUrl: "https://discord.com/api/webhooks/123/xyz",
      discordEnabled: true,
      telegramBotToken: "123456:ABC-DEF",
      telegramChatId: "987654321",
      telegramEnabled: true,
    };

    saveClientWebhooks(config);
    const loaded = loadClientWebhooks();

    expect(loaded.discordWebhookUrl).toBe(config.discordWebhookUrl);
    expect(loaded.discordEnabled).toBe(true);
    expect(loaded.telegramBotToken).toBe(config.telegramBotToken);
    expect(loaded.telegramChatId).toBe(config.telegramChatId);
    expect(loaded.telegramEnabled).toBe(true);
  });

  it("non-destructively preserves client credentials when server returns empty config", () => {
    const localConfig: AlertWebhookConfig = {
      discordWebhookUrl: "https://discord.com/api/webhooks/999/real",
      discordEnabled: true,
      telegramBotToken: "999:token",
      telegramChatId: "12345",
      telegramEnabled: true,
    };

    // Server returns empty config (e.g. server restart or unauthenticated guest session)
    const serverEmpty: AlertWebhookConfig = {
      discordWebhookUrl: "",
      discordEnabled: false,
      telegramBotToken: "",
      telegramChatId: "",
      telegramEnabled: false,
    };

    const merged = mergeClientAndServerWebhooks(localConfig, serverEmpty);

    expect(merged.discordWebhookUrl).toBe(localConfig.discordWebhookUrl);
    expect(merged.discordEnabled).toBe(true);
    expect(merged.telegramBotToken).toBe(localConfig.telegramBotToken);
    expect(merged.telegramChatId).toBe(localConfig.telegramChatId);
    expect(merged.telegramEnabled).toBe(true);
  });

  it("incorporates server webhooks when client storage is empty", () => {
    const localEmpty: AlertWebhookConfig = {
      discordWebhookUrl: "",
      discordEnabled: false,
      telegramBotToken: "",
      telegramChatId: "",
      telegramEnabled: false,
    };

    const serverPopulated: AlertWebhookConfig = {
      discordWebhookUrl: "https://discord.com/api/webhooks/server/abc",
      discordEnabled: true,
      telegramBotToken: "777:server-token",
      telegramChatId: "55555",
      telegramEnabled: true,
    };

    const merged = mergeClientAndServerWebhooks(localEmpty, serverPopulated);

    expect(merged.discordWebhookUrl).toBe(serverPopulated.discordWebhookUrl);
    expect(merged.discordEnabled).toBe(true);
    expect(merged.telegramBotToken).toBe(serverPopulated.telegramBotToken);
    expect(merged.telegramChatId).toBe(serverPopulated.telegramChatId);
    expect(merged.telegramEnabled).toBe(true);
  });

  it("preserves trading webhook configuration across merges", () => {
    const localWithTrading: AlertWebhookConfig = {
      discordWebhookUrl: "https://discord.com/api/webhooks/1/a",
      discordEnabled: true,
      tradingWebhook: {
        enabled: true,
        platform: "3commas",
        webhookUrl: "https://app.3commas.io/trade_signal/v2",
        botId: "bot-123",
        secretToken: "secret-456",
        customTemplate: "{{action}} {{symbol}}",
      },
    };

    const merged = mergeClientAndServerWebhooks(localWithTrading, null);
    expect(merged.tradingWebhook).toBeDefined();
    expect(merged.tradingWebhook?.platform).toBe("3commas");
    expect(merged.tradingWebhook?.botId).toBe("bot-123");
  });
});
