import { PoiCategory, PoiDirection, RadarPoiItem } from "./radar-poi-engine";
import { AlertWebhookConfig } from "../alerts/webhook-dispatcher";

export type PoiBreakSeverity = "CLEAN_STOP" | "GAP_SLIPPAGE" | "FLASH_BREACH";
export type PoiBreakType = "WICK_PENETRATION" | "CANDLE_CLOSE_BREAK";

export interface PoiBreakTelemetry {
  poiId: string;
  symbol: string;
  timeframe: string;
  category: PoiCategory;
  direction: PoiDirection;
  zoneTop: number;
  zoneBottom: number;
  invalidationPrice: number;
  breachPrice: number;
  overshootPct: number;
  overshootUsd: number;
  breachType: PoiBreakType;
  severity: PoiBreakSeverity;
  timestamp: number;
  actionRecommendation: string;
  mitigationAdvice: string;
}

/**
 * Detects whether the current market price has breached a POI's invalidation boundary
 * and computes institutional stop-out telemetry.
 */
export function detectPoiInvalidationBreak(
  poi: RadarPoiItem,
  currentPrice: number,
  candleClose?: number,
  timestamp: number = Date.now()
): PoiBreakTelemetry | null {
  if (currentPrice <= 0) return null;

  const isBullish = poi.type === "BULLISH";
  const invalidationLevel =
    typeof poi.invalidationPrice === "number" && poi.invalidationPrice > 0
      ? poi.invalidationPrice
      : isBullish
      ? poi.bottom
      : poi.top;

  let isBreached = false;
  let overshootUsd = 0;

  if (isBullish) {
    if (currentPrice < invalidationLevel) {
      isBreached = true;
      overshootUsd = invalidationLevel - currentPrice;
    }
  } else {
    if (currentPrice > invalidationLevel) {
      isBreached = true;
      overshootUsd = currentPrice - invalidationLevel;
    }
  }

  if (!isBreached) return null;

  const overshootPct = (overshootUsd / invalidationLevel) * 100;

  // Determine breach type: whether candle close affirmed the break or an intrabar wick
  let breachType: PoiBreakType = "WICK_PENETRATION";
  if (typeof candleClose === "number" && candleClose > 0) {
    const closeBreached = isBullish
      ? candleClose < invalidationLevel
      : candleClose > invalidationLevel;
    if (closeBreached) {
      breachType = "CANDLE_CLOSE_BREAK";
    }
  }

  // Classify stop-out severity
  let severity: PoiBreakSeverity = "CLEAN_STOP";
  if (overshootPct > 1.5) {
    severity = "FLASH_BREACH";
  } else if (overshootPct > 0.5) {
    severity = "GAP_SLIPPAGE";
  }

  // Contextual institutional action recommendation
  const categoryLabel =
    poi.category === "sandwich_zone"
      ? "Sandwich Demand/Supply Zone"
      : poi.category === "fvg"
      ? "Fair Value Gap"
      : "Order Block";

  let actionRecommendation = "";
  let mitigationAdvice = "";

  if (isBullish) {
    actionRecommendation = `Cancel resting BUY limit orders. Institutional demand zone collapsed.`;
    mitigationAdvice =
      severity === "FLASH_BREACH"
        ? `Aggressive liquidation cascade detected. Stand aside until next macro HTF pool forms.`
        : `Watch for S2D flip retest resistance or demand consolidation at lower timeframe sweeps.`;
  } else {
    actionRecommendation = `Cancel resting SHORT limit orders. Institutional supply zone failed to cap price.`;
    mitigationAdvice =
      severity === "FLASH_BREACH"
        ? `Massive short squeeze impulse detected. Avoid early tops; wait for absorption wick.`
        : `Watch for D2S flip support retest or next major HTF liquidity pool.`;
  }

  return {
    poiId: poi.id,
    symbol: poi.symbol,
    timeframe: poi.timeframe,
    category: poi.category,
    direction: poi.type,
    zoneTop: poi.top,
    zoneBottom: poi.bottom,
    invalidationPrice: Number(invalidationLevel.toFixed(invalidationLevel >= 1 ? 4 : 8)),
    breachPrice: Number(currentPrice.toFixed(currentPrice >= 1 ? 4 : 8)),
    overshootPct: Number(overshootPct.toFixed(2)),
    overshootUsd: Number(overshootUsd.toFixed(invalidationLevel >= 1 ? 4 : 8)),
    breachType,
    severity,
    timestamp,
    actionRecommendation,
    mitigationAdvice,
  };
}

/**
 * Formats a clean institutional HTML message for Telegram alerting.
 */
export function formatPoiInvalidationTelegramMessage(telemetry: PoiBreakTelemetry): string {
  const dirEmoji = telemetry.direction === "BULLISH" ? "🟢" : "🔴";
  const catLabel =
    telemetry.category === "sandwich_zone"
      ? "SANDWICH ZONE"
      : telemetry.category === "fvg"
      ? "FAIR VALUE GAP (FVG)"
      : "ORDER BLOCK (OB)";

  const severityPill =
    telemetry.severity === "FLASH_BREACH"
      ? "🔥 FLASH BREACH (HIGH SLIPPAGE)"
      : telemetry.severity === "GAP_SLIPPAGE"
      ? "⚠️ GAP / SLIPPAGE RUN"
      : "🎯 CLEAN STOP-OUT";

  const timeStr = new Date(telemetry.timestamp).toISOString().replace("T", " ").slice(0, 19);

  return (
    `🚨 <b>MOCHEX POI INVALIDATION & STOP-OUT ALERT</b>\n` +
    `💥 <b>${telemetry.symbol} [${telemetry.timeframe}] — ${dirEmoji} ${telemetry.direction} ${catLabel} BROKEN</b>\n\n` +
    `• <b>Zone Boundaries:</b> <code>$${telemetry.zoneBottom} - $${telemetry.zoneTop}</code>\n` +
    `• <b>Invalidation Level:</b> <code>$${telemetry.invalidationPrice}</code>\n` +
    `• <b>Breach Price:</b> <code>$${telemetry.breachPrice}</code> (<b>-${telemetry.overshootPct}% overshoot</b>)\n` +
    `• <b>Penetration Type:</b> <code>${telemetry.breachType.replace(/_/g, " ")}</code>\n` +
    `• <b>Stop Severity:</b> <b>${severityPill}</b>\n\n` +
    `🛑 <b>Action:</b> ${telemetry.actionRecommendation}\n` +
    `💡 <b>Mitigation:</b> <i>${telemetry.mitigationAdvice}</i>\n\n` +
    `<i>Telemetric Invalidation Timestamp: ${timeStr} UTC</i>`
  );
}

/**
 * Formats a Discord webhook embed with institutional formatting.
 */
export function formatPoiInvalidationDiscordPayload(telemetry: PoiBreakTelemetry) {
  const catLabel =
    telemetry.category === "sandwich_zone"
      ? "Sandwich Zone"
      : telemetry.category === "fvg"
      ? "Fair Value Gap"
      : "Order Block";

  return {
    embeds: [
      {
        title: `🚨 POI INVALIDATED: ${telemetry.symbol} [${telemetry.timeframe}] ${telemetry.direction} ${catLabel}`,
        description: `Market price penetrated the institutional invalidation boundary.\n**Action:** ${telemetry.actionRecommendation}`,
        color: 0xef4444, // Red
        fields: [
          {
            name: "Zone Range",
            value: `$${telemetry.zoneBottom} - $${telemetry.zoneTop}`,
            inline: true,
          },
          {
            name: "Invalidation Stop",
            value: `$${telemetry.invalidationPrice}`,
            inline: true,
          },
          {
            name: "Breach Price",
            value: `$${telemetry.breachPrice} (-${telemetry.overshootPct}%)`,
            inline: true,
          },
          {
            name: "Penetration Type",
            value: telemetry.breachType.replace(/_/g, " "),
            inline: true,
          },
          {
            name: "Severity",
            value: telemetry.severity.replace(/_/g, " "),
            inline: true,
          },
          {
            name: "Tactical Advice",
            value: telemetry.mitigationAdvice,
            inline: false,
          },
        ],
        footer: {
          text: `Mochex POI Radar • Invalidation Telemetry`,
        },
        timestamp: new Date(telemetry.timestamp).toISOString(),
      },
    ],
  };
}

/**
 * Dispatches an automated Invalidation Stop-Out push alert to Telegram & Discord webhooks.
 */
export function dispatchPoiInvalidationWebhook(
  webhooks: AlertWebhookConfig,
  telemetry: PoiBreakTelemetry
): Promise<{
  telegram?: { ok: boolean; status?: number; error?: string };
  discord?: { ok: boolean; status?: number; error?: string };
}> {
  const promises: Promise<void>[] = [];
  const results: {
    telegram?: { ok: boolean; status?: number; error?: string };
    discord?: { ok: boolean; status?: number; error?: string };
  } = {};

  // 1. Dispatch Telegram
  if (webhooks.telegramBotToken && webhooks.telegramChatId) {
    const text = formatPoiInvalidationTelegramMessage(telemetry);
    const tgUrl = `https://api.telegram.org/bot${webhooks.telegramBotToken}/sendMessage`;
    const tgPromise = fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: webhooks.telegramChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    })
      .then(async (res) => {
        results.telegram = { ok: res.ok, status: res.status };
      })
      .catch((err) => {
        results.telegram = { ok: false, error: err?.message || String(err) };
      });

    promises.push(tgPromise);
  }

  // 2. Dispatch Discord
  if (webhooks.discordWebhookUrl) {
    const payload = formatPoiInvalidationDiscordPayload(telemetry);
    const dcPromise = fetch(webhooks.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
      .then(async (res) => {
        results.discord = { ok: res.ok, status: res.status };
      })
      .catch((err) => {
        results.discord = { ok: false, error: err?.message || String(err) };
      });

    promises.push(dcPromise);
  }

  return Promise.all(promises).then(() => results);
}
