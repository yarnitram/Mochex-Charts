import { NextRequest, NextResponse } from "next/server";
import {
  AlertWebhookConfig,
  dispatchDirectWebhooks,
  isValidDiscordWebhookUrl,
  isValidTelegramBotToken,
  isValidTelegramChatId,
  isValidTradingWebhookUrl,
  formatTradingWebhookPayload,
} from "@/lib/alerts/webhook-dispatcher";
import { PriceAlert, AlertLogEntry } from "@/lib/alerts/alerts-engine";

export const dynamic = "force-dynamic";

interface NotifyRequestBody {
  action?: "test" | "dispatch";
  channel?: "discord" | "telegram" | "trading_webhook";
  config?: AlertWebhookConfig;
  alert?: PriceAlert;
  log?: AlertLogEntry;
}

export async function POST(req: NextRequest) {
  try {
    const body: NotifyRequestBody = await req.json();
    const { action = "dispatch", channel, config, alert, log } = body;

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Missing webhook configuration" },
        { status: 400 }
      );
    }

    // 1. TEST ACTION
    if (action === "test") {
      if (channel === "discord") {
        if (!isValidDiscordWebhookUrl(config.discordWebhookUrl)) {
          return NextResponse.json(
            { success: false, error: "Invalid Discord Webhook URL. Format: https://discord.com/api/webhooks/..." },
            { status: 400 }
          );
        }

        const testPayload = {
          username: "Mochex Alerts",
          embeds: [
            {
              title: "✅ Discord Webhook Connected",
              description: "Your Mochex Discord alert integration is active and verified! Real-time market, drawing, and strategy alerts will now be posted to this channel.",
              color: 49287, // Institutional Green (#00c087)
              fields: [
                { name: "Terminal Status", value: "`ONLINE`", inline: true },
                { name: "Channel Verification", value: "`PASSED`", inline: true },
                { name: "Timestamp", value: new Date().toUTCString(), inline: false },
              ],
              footer: { text: "Mochex Institutional Charts • Alerts Engine" },
            },
          ],
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        try {
          const res = await fetch(config.discordWebhookUrl!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testPayload),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json(
              { success: false, error: `Discord responded with HTTP ${res.status}: ${errText}` },
              { status: res.status }
            );
          }

          return NextResponse.json({
            success: true,
            message: "Discord test notification sent successfully!",
          });
        } catch (fetchErr: unknown) {
          clearTimeout(timeoutId);
          const err = fetchErr as Error;
          return NextResponse.json(
            { success: false, error: `Failed to reach Discord: ${err.message}` },
            { status: 502 }
          );
        }
      }

      if (channel === "telegram") {
        if (!isValidTelegramBotToken(config.telegramBotToken)) {
          return NextResponse.json(
            { success: false, error: "Invalid Telegram Bot Token. Format: 123456789:ABC-DEF..." },
            { status: 400 }
          );
        }
        if (!isValidTelegramChatId(config.telegramChatId)) {
          return NextResponse.json(
            { success: false, error: "Invalid Telegram Chat ID. Numeric ID or @channel required." },
            { status: 400 }
          );
        }

        const telegramText =
          `✅ <b>Mochex Telegram Connected</b>\n\n` +
          `Your Telegram alert integration is active and verified! Real-time price crossings, drawings, and strategy alerts will be delivered here.\n\n` +
          `• <b>Status:</b> <code>ONLINE</code>\n` +
          `• <b>Time:</b> <i>${new Date().toUTCString()}</i>\n\n` +
          `<i>Mochex Institutional Charts</i>`;

        const tgUrl = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        try {
          const res = await fetch(tgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: config.telegramChatId,
              text: telegramText,
              parse_mode: "HTML",
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const data = await res.json();
          if (!res.ok || !data.ok) {
            return NextResponse.json(
              { success: false, error: `Telegram error: ${data.description || res.statusText}` },
              { status: res.status }
            );
          }

          return NextResponse.json({
            success: true,
            message: "Telegram test notification sent successfully!",
          });
        } catch (fetchErr: unknown) {
          clearTimeout(timeoutId);
          const err = fetchErr as Error;
          return NextResponse.json(
            { success: false, error: `Failed to reach Telegram: ${err.message}` },
            { status: 502 }
          );
        }
      }

      if (channel === "trading_webhook") {
        const tradingConfig = config.tradingWebhook;
        if (!tradingConfig || !isValidTradingWebhookUrl(tradingConfig.webhookUrl)) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid Automated Trading Webhook URL. Please provide a valid http:// or https:// URL.",
            },
            { status: 400 }
          );
        }

        const mockAlert: PriceAlert = {
          id: "alert-test-webhook",
          symbol: "BTCUSDT",
          targetPrice: 76500,
          condition: "crossing_down",
          frequency: "only_once",
          sourceType: "indicator_condition",
          label: "BTC 4H Bullish OB (Zone Entry)",
          active: true,
          triggeredCount: 1,
          createdAt: Date.now(),
          notifyTradingWebhook: true,
        };

        const mockLog: AlertLogEntry = {
          id: "log-test-webhook",
          alertId: "alert-test-webhook",
          symbol: "BTCUSDT",
          triggerPrice: 76480.25,
          targetPrice: 76500,
          condition: "crossing_down",
          sourceType: "indicator_condition",
          label: "BTC 4H Bullish OB (Zone Entry)",
          message: "Test automated trading webhook dispatch from Mochex POI Radar",
          triggeredAt: Date.now(),
        };

        const { payload, headers } = formatTradingWebhookPayload(tradingConfig, mockAlert, mockLog);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        try {
          const res = await fetch(tradingConfig.webhookUrl!, {
            method: "POST",
            headers,
            body: typeof payload === "string" ? payload : JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json(
              {
                success: false,
                error: `${tradingConfig.platform || "Webhook"} endpoint responded with HTTP ${res.status}: ${errText.slice(0, 200)}`,
              },
              { status: res.status }
            );
          }

          return NextResponse.json({
            success: true,
            message: `Test trade signal sent to ${tradingConfig.platform || "trading"} webhook!`,
            payload,
          });
        } catch (fetchErr: unknown) {
          clearTimeout(timeoutId);
          const err = fetchErr as Error;
          return NextResponse.json(
            { success: false, error: `Failed to reach webhook: ${err.message}` },
            { status: 502 }
          );
        }
      }

      return NextResponse.json(
        { success: false, error: "Invalid channel specified for test" },
        { status: 400 }
      );
    }

    // 2. DISPATCH ACTION
    if (!alert || !log) {
      return NextResponse.json(
        { success: false, error: "Missing alert or log entry payload" },
        { status: 400 }
      );
    }

    const results = await dispatchDirectWebhooks(config, alert, log);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
