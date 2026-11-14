import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { serverAlertDaemon } from "@/lib/alerts/server-alert-daemon";
import {
  clearUserServerAlertLogs,
  getServerDiagnosticsSummary,
  getUserServerAlertLogs,
  upsertServerAlertLog,
} from "@/lib/alerts/server-alert-diagnostics";
import { getServerWebhooks } from "@/lib/alerts/server-alerts-store";
import { isValidDiscordWebhookUrl } from "@/lib/alerts/webhook-dispatcher";

export const dynamic = "force-dynamic";

/**
 * GET /api/alerts/logs
 * Returns alert trigger logs, Discord/Telegram delivery outcomes, server daemon
 * live diagnostics, and secret-masked webhook status for the active trader.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);

  try {
    serverAlertDaemon.startIfNotRunning();
    await serverAlertDaemon.refreshActiveAlerts().catch(() => {});

    const logs = getUserServerAlertLogs(user.userId);
    const daemonStatus = serverAlertDaemon.getDiagnostics();
    const diagnostics = getServerDiagnosticsSummary(user.userId);

    return NextResponse.json({
      logs,
      daemonStatus,
      diagnostics,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch alert logs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/alerts/logs
 * Supports actions from the Logs dashboard:
 * - "test_server_discord": sends a live test embed using the Discord webhook stored on server
 * - "refresh_daemon": forces the 24/7 daemon to reload .data/alerts.json & .data/webhooks.json
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string };

    if (body.action === "refresh_daemon") {
      serverAlertDaemon.startIfNotRunning();
      await serverAlertDaemon.refreshActiveAlerts();
      return NextResponse.json({
        success: true,
        daemonStatus: serverAlertDaemon.getDiagnostics(),
        diagnostics: getServerDiagnosticsSummary(user.userId),
      });
    }

    if (body.action === "test_server_discord") {
      const serverWebhooks = await getServerWebhooks(user.userId);
      const webhookUrl = serverWebhooks?.discordWebhookUrl?.trim() || "";

      if (!webhookUrl) {
        const reason = "No Discord Webhook URL is saved on the server for this account.";
        upsertServerAlertLog(user.userId, {
          id: `log-test-discord-${Date.now()}`,
          alertId: "test-server-discord",
          symbol: "DISCORD_PING",
          triggerPrice: 0,
          targetPrice: 0,
          condition: "crossing",
          label: "Server Discord Diagnostic Ping",
          message: reason,
          triggeredAt: Date.now(),
          logType: "test",
          deliveryResults: {
            discord: { ok: false, skipped: true, skippedReason: reason },
            attemptedAt: Date.now(),
          },
        });
        return NextResponse.json({ success: false, error: reason }, { status: 400 });
      }

      if (!isValidDiscordWebhookUrl(webhookUrl)) {
        const reason = "Saved server Discord Webhook URL has an invalid format.";
        upsertServerAlertLog(user.userId, {
          id: `log-test-discord-${Date.now()}`,
          alertId: "test-server-discord",
          symbol: "DISCORD_PING",
          triggerPrice: 0,
          targetPrice: 0,
          condition: "crossing",
          label: "Server Discord Diagnostic Ping",
          message: reason,
          triggeredAt: Date.now(),
          logType: "test",
          deliveryResults: {
            discord: { ok: false, error: reason },
            attemptedAt: Date.now(),
          },
        });
        return NextResponse.json({ success: false, error: reason }, { status: 400 });
      }

      const payload = {
        username: "Mochex Alerts",
        embeds: [
          {
            title: "Mochex Server Logs Diagnostic Ping",
            description:
              "Live test triggered from the Mochex Notification Logs console using your server-stored Discord webhook.",
            color: 49287,
            fields: [
              { name: "Daemon State", value: "`ONLINE`", inline: true },
              {
                name: "Discord Toggle",
                value: serverWebhooks?.discordEnabled ? "`ENABLED`" : "`DISABLED IN SETTINGS`",
                inline: true,
              },
              { name: "Sent At", value: new Date().toUTCString(), inline: false },
            ],
            footer: { text: "Mochex Institutional Radar • Server Logs" },
          },
        ],
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          const errMsg = `Discord HTTP ${res.status}${errText ? `: ${errText.slice(0, 180)}` : ""}`;
          upsertServerAlertLog(user.userId, {
            id: `log-test-discord-${Date.now()}`,
            alertId: "test-server-discord",
            symbol: "DISCORD_PING",
            triggerPrice: 0,
            targetPrice: 0,
            condition: "crossing",
            label: "Server Discord Diagnostic Ping",
            message: errMsg,
            triggeredAt: Date.now(),
            logType: "test",
            deliveryResults: {
              discord: { ok: false, status: res.status, error: errMsg },
              attemptedAt: Date.now(),
            },
          });
          return NextResponse.json({ success: false, error: errMsg }, { status: res.status });
        }

        upsertServerAlertLog(user.userId, {
          id: `log-test-discord-${Date.now()}`,
          alertId: "test-server-discord",
          symbol: "DISCORD_PING",
          triggerPrice: 0,
          targetPrice: 0,
          condition: "crossing",
          label: "Server Discord Diagnostic Ping",
          message: `Delivered via server webhook (HTTP ${res.status})`,
          triggeredAt: Date.now(),
          logType: "test",
          deliveryResults: {
            discord: { ok: true, status: res.status },
            attemptedAt: Date.now(),
          },
        });

        return NextResponse.json({
          success: true,
          message: `Test ping delivered to Discord (HTTP ${res.status}).`,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        const errMsg = err instanceof Error ? err.message : "Network error reaching Discord";
        upsertServerAlertLog(user.userId, {
          id: `log-test-discord-${Date.now()}`,
          alertId: "test-server-discord",
          symbol: "DISCORD_PING",
          triggerPrice: 0,
          targetPrice: 0,
          condition: "crossing",
          label: "Server Discord Diagnostic Ping",
          message: errMsg,
          triggeredAt: Date.now(),
          logType: "test",
          deliveryResults: {
            discord: { ok: false, error: errMsg },
            attemptedAt: Date.now(),
          },
        });
        return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
      }
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process log action" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/alerts/logs
 * Clears notification & delivery logs for the active user.
 */
export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);

  try {
    clearUserServerAlertLogs(user.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear alert logs" },
      { status: 500 }
    );
  }
}
