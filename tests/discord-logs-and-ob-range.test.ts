import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPoiPrice, getPoiZoneRange } from "@/lib/indicators/radar-poi-engine";
import {
  formatDiscordPayload,
  formatTelegramMessage,
} from "@/lib/alerts/webhook-dispatcher";
import { AlertLogEntry, PriceAlert } from "@/lib/alerts/alerts-engine";
import {
  buildAlertDeliveryResults,
  clearUserServerAlertLogs,
  getServerDiagnosticsSummary,
  getUserServerAlertLogs,
  maskDiscordWebhookUrl,
  upsertServerAlertLog,
} from "@/lib/alerts/server-alert-diagnostics";
import { saveServerAlert, saveServerWebhooks } from "@/lib/alerts/server-alerts-store";
import { serverAlertDaemon } from "@/lib/alerts/server-alert-daemon";

const DATA_DIR = path.join(process.cwd(), ".data");
const PROTECTED_FILES = ["alerts.json", "webhooks.json", "alert-logs.json"];

let snapshots: Record<string, string | null> = {};

beforeEach(() => {
  snapshots = {};
  for (const name of PROTECTED_FILES) {
    const filePath = path.join(DATA_DIR, name);
    snapshots[name] = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
  }
});

afterEach(() => {
  serverAlertDaemon.stop();
  vi.restoreAllMocks();
  for (const name of PROTECTED_FILES) {
    const filePath = path.join(DATA_DIR, name);
    const prev = snapshots[name];
    if (prev === null) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(filePath, prev, "utf-8");
    }
  }
});

describe("Validated OB Price Range & Formatting (DEC-166)", () => {
  it("formats majors, midcaps, and sub-cent meme coins without zero truncation", () => {
    expect(formatPoiPrice(68420.5)).toBe("68,420.50");
    expect(formatPoiPrice(12.345)).toBe("12.35");
    expect(formatPoiPrice(0.45678)).toBe("0.4568");
    expect(formatPoiPrice(0.004567)).toBe("0.004567");
    expect(formatPoiPrice(0.00001234)).toBe("0.00001234");
  });

  it("computes bottom-to-top OB range text and spread percentage accurately", () => {
    const range = getPoiZoneRange({ bottom: 60000, top: 61500 });
    expect(range.rangeText).toBe("$60,000.00 - $61,500.00");
    expect(range.spreadPct).toBeCloseTo(2.5, 4);

    const microRange = getPoiZoneRange({ bottom: 0.000012, top: 0.0000132 });
    expect(microRange.rangeText).toBe("$0.00001200 - $0.00001320");
    expect(microRange.spreadPct).toBeCloseTo(10.0, 4);
  });

  it("includes Validated OB price range in Discord embed and Telegram message", () => {
    const alert: PriceAlert = {
      id: "alert-ob-1",
      symbol: "PEPEUSDT",
      targetPrice: 0.0000132,
      condition: "crossing_down",
      frequency: "only_once",
      sourceType: "indicator_condition",
      label: "PEPE 4H Bullish Validated OB",
      active: true,
      triggeredCount: 0,
      createdAt: Date.now(),
      poiMetadata: {
        poiId: "poi-1",
        category: "order_block",
        direction: "BULLISH",
        timeframe: "4H",
        zoneTop: 0.0000132,
        zoneBottom: 0.000012,
        invalidationPrice: 0.000012,
      },
    };

    const log: AlertLogEntry = {
      id: "log-ob-1",
      alertId: "alert-ob-1",
      symbol: "PEPEUSDT",
      triggerPrice: 0.00001315,
      targetPrice: 0.0000132,
      condition: "crossing_down",
      sourceType: "indicator_condition",
      label: alert.label,
      triggeredAt: Date.now(),
    };

    const discordPayload = formatDiscordPayload(alert, log);
    const rangeField = discordPayload.embeds?.[0]?.fields?.find((f) =>
      f.name.includes("Validated OB Range (4H)")
    );
    expect(rangeField).toBeDefined();
    expect(rangeField?.value).toContain("$0.00001200");
    expect(rangeField?.value).toContain("$0.00001320");
    expect(rangeField?.value).toContain("10.00% width");

    const telegramHtml = formatTelegramMessage(alert, log);
    expect(telegramHtml).toContain("Validated OB Range (4H)");
    expect(telegramHtml).toContain("$0.00001200 - $0.00001320");
  });
});

describe("Discord Delivery Logs & Server Daemon Diagnostics (DEC-166)", () => {
  it("masks Discord webhook secret tokens in diagnostics output", () => {
    const masked = maskDiscordWebhookUrl(
      "https://discord.com/api/webhooks/1234567890/secretTokenABC9876"
    );
    expect(masked).toBe("https://discord.com/api/webhooks/1234567890/...9876");
    expect(masked).not.toContain("secretTokenABC");
  });

  it("records explicit skipped reasons and delivery failures via buildAlertDeliveryResults", () => {
    const disabledRes = buildAlertDeliveryResults(
      {
        discordWebhookUrl: "https://discord.com/api/webhooks/123/abc",
        discordEnabled: false,
      },
      { notifyDiscord: true, notifyTelegram: true }
    );
    expect(disabledRes.discord?.skipped).toBe(true);
    expect(disabledRes.discord?.skippedReason).toContain("disabled");

    const errorRes = buildAlertDeliveryResults(
      {
        discordWebhookUrl: "https://discord.com/api/webhooks/123/abc",
        discordEnabled: true,
      },
      { notifyDiscord: true, notifyTelegram: false },
      { discord: { ok: false, error: "Discord webhook HTTP 404: Unknown Webhook" } }
    );
    expect(errorRes.discord?.ok).toBe(false);
    expect(errorRes.discord?.error).toContain("404");
  });

  it("upserts, summarizes, and clears alert logs cleanly per user", () => {
    const uid = "test-user-logs-dec166";
    clearUserServerAlertLogs(uid);

    const entry: AlertLogEntry = {
      id: "log-1",
      alertId: "alert-1",
      symbol: "BTCUSDT",
      triggerPrice: 64980,
      targetPrice: 65000,
      condition: "crossing_down",
      label: "BTC 4H OB Entry",
      triggeredAt: Date.now(),
      logType: "trigger",
      deliveryResults: {
        discord: { ok: true, status: 204 },
      },
    };

    upsertServerAlertLog(uid, entry);
    upsertServerAlertLog(uid, {
      ...entry,
      deliveryResults: { discord: { ok: false, status: 429, error: "Rate limited" } },
    });

    const stored = getUserServerAlertLogs(uid);
    expect(stored).toHaveLength(1);
    expect(stored[0].deliveryResults?.discord?.error).toBe("Rate limited");

    const summary = getServerDiagnosticsSummary(uid);
    expect(summary.logsCount).toBe(1);
    expect(summary.discordFailureCount).toBe(1);

    clearUserServerAlertLogs(uid);
    expect(getUserServerAlertLogs(uid)).toHaveLength(0);
  });

  it("shares globalThis daemon singleton and logs Discord delivery outcome on REST batch trigger", async () => {
    const uid = "test-user-daemon-dec166";
    saveServerWebhooks(uid, {
      discordWebhookUrl: "https://discord.com/api/webhooks/111111/fakeToken1234",
      discordEnabled: true,
      telegramEnabled: false,
    });
    await saveServerAlert(
      {
        id: "alert-daemon-1",
        symbol: "BTCUSDT",
        targetPrice: 65000,
        condition: "crossing_down",
        frequency: "only_once",
        sourceType: "indicator_condition",
        label: "BTC 4H Bullish OB",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        notifyDiscord: true,
      },
      uid
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v3/ticker/price")) {
        return new Response(JSON.stringify([{ symbol: "BTCUSDT", price: "64900" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("discord.com/api/webhooks")) {
        return new Response(null, { status: 204 });
      }
      return new Response("Not Found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await serverAlertDaemon.refreshActiveAlerts();

    // Seed an initial above-target price so crossing_down triggers on the batch REST poll
    (serverAlertDaemon as unknown as { processPriceUpdate: (s: string, p: number) => void }).processPriceUpdate(
      "BTCUSDT",
      65500
    );

    await (serverAlertDaemon as unknown as { pollRestPrices: () => Promise<void> }).pollRestPrices();

    // Wait a tick for async triggerAlert + Discord dispatch to complete
    await new Promise((r) => setTimeout(r, 80));

    const logs = getUserServerAlertLogs(uid);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].symbol).toBe("BTCUSDT");
    expect(logs[0].deliveryResults?.discord?.ok).toBe(true);

    const g = globalThis as unknown as { __mochexServerAlertDaemon?: unknown };
    expect(g.__mochexServerAlertDaemon).toBe(serverAlertDaemon);
  });
});
