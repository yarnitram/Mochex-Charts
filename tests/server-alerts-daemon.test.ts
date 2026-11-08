import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  getServerAlerts,
  saveServerAlert,
  updateServerAlert,
  deleteServerAlert,
  saveServerWebhooks,
  getServerWebhooks,
  appendServerAlertLog,
  getServerAlertLogs,
  getAllActiveServerAlerts,
} from "../src/lib/alerts/server-alerts-store";
import { ServerAlertDaemon } from "../src/lib/alerts/server-alert-daemon";
import { PriceAlert, AlertLogEntry } from "../src/lib/alerts/alerts-engine";
import * as webhookDispatcher from "../src/lib/alerts/webhook-dispatcher";

describe("24/7 Server-Side Offline Cloud Alert Engine (DEC-135)", () => {
  const testUserId = "test-user-offline-123";
  const dataDir = path.join(process.cwd(), ".data");
  const alertsFile = path.join(dataDir, "alerts.json");
  const webhooksFile = path.join(dataDir, "webhooks.json");
  const logsFile = path.join(dataDir, "alert-logs.json");

  let originalAlerts: string | null = null;
  let originalWebhooks: string | null = null;
  let originalLogs: string | null = null;

  beforeEach(() => {
    // Backup any existing .data files
    try {
      if (fs.existsSync(alertsFile)) originalAlerts = fs.readFileSync(alertsFile, "utf-8");
      if (fs.existsSync(webhooksFile)) originalWebhooks = fs.readFileSync(webhooksFile, "utf-8");
      if (fs.existsSync(logsFile)) originalLogs = fs.readFileSync(logsFile, "utf-8");
    } catch {}
  });

  afterEach(() => {
    // Restore backed up files
    try {
      if (originalAlerts !== null) fs.writeFileSync(alertsFile, originalAlerts, "utf-8");
      else if (fs.existsSync(alertsFile)) fs.unlinkSync(alertsFile);

      if (originalWebhooks !== null) fs.writeFileSync(webhooksFile, originalWebhooks, "utf-8");
      else if (fs.existsSync(webhooksFile)) fs.unlinkSync(webhooksFile);

      if (originalLogs !== null) fs.writeFileSync(logsFile, originalLogs, "utf-8");
      else if (fs.existsSync(logsFile)) fs.unlinkSync(logsFile);
    } catch {}
    vi.restoreAllMocks();
  });

  describe("Server Alerts & Webhooks Store", () => {
    it("saves, retrieves, updates, and deletes price alerts for a user", async () => {
      const alert: PriceAlert = {
        id: "alert-btc-breakout",
        symbol: "BTCUSDT",
        targetPrice: 70000,
        condition: "crossing_up",
        frequency: "only_once",
        sourceType: "price",
        label: "BTC 70k Cloud Breakout",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
      };

      // 1. Save alert
      await saveServerAlert(alert, testUserId);
      const userAlerts = await getServerAlerts(testUserId);
      expect(userAlerts).toHaveLength(1);
      expect(userAlerts[0].id).toBe("alert-btc-breakout");
      expect(userAlerts[0].targetPrice).toBe(70000);

      // 2. Update alert
      const updated = await updateServerAlert(
        "alert-btc-breakout",
        { active: false, triggeredCount: 1 },
        testUserId
      );
      expect(updated).not.toBeNull();
      expect(updated?.active).toBe(false);
      expect(updated?.triggeredCount).toBe(1);

      // Verify persistence
      const afterUpdate = await getServerAlerts(testUserId);
      expect(afterUpdate[0].active).toBe(false);

      // 3. Delete alert
      const deleted = await deleteServerAlert("alert-btc-breakout", testUserId);
      expect(deleted).toBe(true);
      const afterDelete = await getServerAlerts(testUserId);
      expect(afterDelete).toHaveLength(0);
    });

    it("saves and retrieves user webhook configurations", async () => {
      const config = {
        discordWebhookUrl: "https://discord.com/api/webhooks/123/abc",
        discordEnabled: true,
        telegramBotToken: "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_1234",
        telegramChatId: "-1001234567890",
        telegramEnabled: true,
      };

      await saveServerWebhooks(testUserId, config);
      const loaded = await getServerWebhooks(testUserId);

      expect(loaded).not.toBeNull();
      expect(loaded?.discordWebhookUrl).toBe(config.discordWebhookUrl);
      expect(loaded?.discordEnabled).toBe(true);
      expect(loaded?.telegramChatId).toBe("-1001234567890");
    });

    it("appends and caps alert history logs", async () => {
      const logEntry: AlertLogEntry = {
        id: "log-1",
        alertId: "alert-btc-breakout",
        symbol: "BTCUSDT",
        triggerPrice: 70050,
        targetPrice: 70000,
        condition: "crossing_up",
        label: "BTC 70k Cloud Breakout",
        triggeredAt: Date.now(),
      };

      await appendServerAlertLog(testUserId, logEntry);
      const logs = await getServerAlertLogs(testUserId);

      expect(logs).toHaveLength(1);
      expect(logs[0].triggerPrice).toBe(70050);
      expect(logs[0].alertId).toBe("alert-btc-breakout");
    });

    it("retrieves all active alerts across all users with matching webhooks", async () => {
      const alert1: PriceAlert = {
        id: "alert-1",
        symbol: "BTCUSDT",
        targetPrice: 69000,
        condition: "crossing_up",
        frequency: "only_once",
        sourceType: "price",
        label: "BTC Breakout",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
      };
      const alert2: PriceAlert = {
        id: "alert-2",
        symbol: "ETHUSDT",
        targetPrice: 2800,
        condition: "crossing_down",
        frequency: "every_time",
        sourceType: "price",
        label: "ETH Breakdown",
        active: false, // Paused
        triggeredCount: 2,
        createdAt: Date.now(),
      };

      await saveServerAlert(alert1, testUserId);
      await saveServerAlert(alert2, testUserId);
      await saveServerWebhooks(testUserId, {
        discordWebhookUrl: "https://discord.com/api/webhooks/test",
        discordEnabled: true,
      });

      const activeList = await getAllActiveServerAlerts();
      const userActive = activeList.filter((a) => a.userId === testUserId);

      expect(userActive).toHaveLength(1);
      expect(userActive[0].alert.id).toBe("alert-1");
      expect(userActive[0].webhooks?.discordEnabled).toBe(true);
    });
  });

  describe("ServerAlertDaemon 24/7 Engine", () => {
    it("tracks symbols, detects crossing transitions, and executes alert dispatch", async () => {
      const dispatchSpy = vi
        .spyOn(webhookDispatcher, "dispatchDirectWebhooks")
        .mockResolvedValue({ discord: { ok: true, status: 200 } });

      const alert: PriceAlert = {
        id: "daemon-alert-sol",
        symbol: "SOLUSDT",
        targetPrice: 150,
        condition: "crossing_up",
        frequency: "only_once",
        sourceType: "price",
        label: "SOL 150 Target",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
        notifyDiscord: true,
      };

      await saveServerAlert(alert, testUserId);
      await saveServerWebhooks(testUserId, {
        discordWebhookUrl: "https://discord.com/api/webhooks/mock",
        discordEnabled: true,
      });

      const daemon = new ServerAlertDaemon("wss://mock.ws");
      await daemon.refreshActiveAlerts();

      const status = daemon.getStatus();
      expect(status.trackedSymbols).toContain("SOLUSDT");
      expect(status.activeAlertsCount).toBe(1);

      // Price update 1: Initial baseline (148.0)
      await daemon.processPriceUpdate("SOLUSDT", 148.0);
      expect(dispatchSpy).not.toHaveBeenCalled();

      // Price update 2: Price stays below target (149.5) -> No trigger
      await daemon.processPriceUpdate("SOLUSDT", 149.5);
      expect(dispatchSpy).not.toHaveBeenCalled();

      // Price update 3: Crosses up through 150 (149.5 -> 151.2) -> TRIGGER!
      await daemon.processPriceUpdate("SOLUSDT", 151.2);

      // Verification: Webhook dispatched directly
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const callArgs = dispatchSpy.mock.calls[0];
      expect(callArgs[1].id).toBe("daemon-alert-sol");
      expect(callArgs[2].triggerPrice).toBe(151.2);
      expect(callArgs[2].targetPrice).toBe(150);

      // Verification: One-time alert is now deactivated
      const postAlerts = await getServerAlerts(testUserId);
      expect(postAlerts[0].active).toBe(false);
      expect(postAlerts[0].triggeredCount).toBe(1);

      // Verification: Alert log was recorded on server
      const logs = await getServerAlertLogs(testUserId);
      expect(logs).toHaveLength(1);
      expect(logs[0].alertId).toBe("daemon-alert-sol");

      daemon.stop();
    });

    it("respects cooldown on 'every_time' alerts to prevent webhook flooding", async () => {
      const dispatchSpy = vi
        .spyOn(webhookDispatcher, "dispatchDirectWebhooks")
        .mockResolvedValue({ discord: { ok: true } });

      const alert: PriceAlert = {
        id: "daemon-alert-eth",
        symbol: "ETHUSDT",
        targetPrice: 2500,
        condition: "crossing_down",
        frequency: "every_time",
        sourceType: "price",
        label: "ETH 2500 Support Crossing",
        active: true,
        triggeredCount: 0,
        createdAt: Date.now(),
      };

      await saveServerAlert(alert, testUserId);
      await saveServerWebhooks(testUserId, {
        discordWebhookUrl: "https://discord.com/api/webhooks/mock",
        discordEnabled: true,
      });
      const daemon = new ServerAlertDaemon("wss://mock.ws");
      await daemon.refreshActiveAlerts();

      // Baseline: 2510
      await daemon.processPriceUpdate("ETHUSDT", 2510);

      // Cross 1: 2510 -> 2490 -> TRIGGER!
      await daemon.processPriceUpdate("ETHUSDT", 2490);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);

      // Rapid oscillate back up and down within 5 seconds (< 60s cooldown)
      await daemon.processPriceUpdate("ETHUSDT", 2510);
      await daemon.processPriceUpdate("ETHUSDT", 2490);

      // Should still be 1 call because cooldown is active
      expect(dispatchSpy).toHaveBeenCalledTimes(1);

      daemon.stop();
    });
  });
});
