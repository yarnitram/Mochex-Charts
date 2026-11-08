/**
 * 24/7 Server-Side Offline Cloud Alert Daemon (DEC-135)
 *
 * Runs persistently in the Node.js Next.js server lifecycle.
 * Connects directly to MEXC WebSocket (wss://wbs.mexc.co/ws) and maintains
 * a REST polling fallback. Evaluates active alerts 24/7 even when users
 * are completely offline, and dispatches webhooks to Discord & Telegram.
 */

import {
  evaluateAlertCrossing,
  PriceAlert,
  AlertLogEntry,
  ALERT_COOLDOWN_MS,
} from "./alerts-engine";
import {
  dispatchDirectWebhooks,
  AlertWebhookConfig,
} from "./webhook-dispatcher";
import {
  getAllActiveServerAlerts,
  updateServerAlert,
  appendServerAlertLog,
  ActiveAlertContext,
} from "./server-alerts-store";
import { detectPoiInvalidationBreak } from "../indicators/poi-invalidation-engine";

export class ServerAlertDaemon {
  private isRunning = false;
  private ws: any = null;
  private wsConnected = false;
  private trackedSymbols: Set<string> = new Set();
  private lastPrices: Map<string, number> = new Map();
  private activeAlertsWithContext: ActiveAlertContext[] = [];

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private restFallbackTimer: NodeJS.Timeout | null = null;

  private lastWsMessageTime = 0;
  private reconnectDelay = 2000;
  private wsUrl: string;

  constructor(wsUrl = process.env.MEXC_WS_URL || "wss://wbs.mexc.co/ws") {
    this.wsUrl = wsUrl;
  }

  /**
   * Starts the 24/7 background worker
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[ServerAlertDaemon] Initializing 24/7 Offline Cloud Alert Daemon...");

    // 1. Load active alerts from server storage
    await this.refreshActiveAlerts();

    // 2. Connect WebSocket feed
    this.connectWs();

    // 3. Start fallback REST polling loop (every 5 seconds)
    this.startRestFallback();
  }

  /**
   * Stops the background worker
   */
  public stop(): void {
    this.isRunning = false;
    this.wsConnected = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.restFallbackTimer) {
      clearInterval(this.restFallbackTimer);
      this.restFallbackTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    console.log("[ServerAlertDaemon] Stopped.");
  }

  /**
   * Notifies daemon that alerts or webhooks have changed in the store
   */
  public async notifyAlertsChanged(): Promise<void> {
    await this.refreshActiveAlerts();
  }

  /**
   * Reloads all active alerts from store and adjusts symbol subscriptions
   */
  public async refreshActiveAlerts(): Promise<void> {
    try {
      const active = await getAllActiveServerAlerts();
      this.activeAlertsWithContext = active;

      const nextSymbols = new Set<string>();
      active.forEach((item) => {
        if (item.alert && item.alert.symbol) {
          nextSymbols.add(item.alert.symbol.toUpperCase());
        }
      });

      // Find newly added symbols to subscribe to
      if (this.wsConnected && this.ws) {
        for (const sym of nextSymbols) {
          if (!this.trackedSymbols.has(sym)) {
            this.sendWsSubscription(`spot@public.deals.v3.api@${sym}`);
          }
        }
      }

      this.trackedSymbols = nextSymbols;
      console.log(
        `[ServerAlertDaemon] Active alerts: ${this.activeAlertsWithContext.length}, Tracked symbols: ${Array.from(this.trackedSymbols).join(", ") || "none"}`
      );
    } catch (err) {
      console.warn("[ServerAlertDaemon] Failed to refresh active alerts:", err);
    }
  }

  /**
   * Returns current daemon status for telemetry and monitoring
   */
  public getStatus() {
    return {
      isRunning: this.isRunning,
      wsConnected: this.wsConnected,
      trackedSymbols: Array.from(this.trackedSymbols),
      activeAlertsCount: this.activeAlertsWithContext.length,
      lastWsMessageTime: this.lastWsMessageTime,
    };
  }

  /**
   * Processes a market price update for a given symbol
   */
  public async processPriceUpdate(symbol: string, currentPrice: number): Promise<void> {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

    const upperSymbol = symbol.toUpperCase();
    const prevPrice = this.lastPrices.get(upperSymbol);
    this.lastPrices.set(upperSymbol, currentPrice);

    // Initial price recording: need at least 2 distinct price points to detect transition
    if (prevPrice === undefined || prevPrice === currentPrice) {
      return;
    }

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    // Filter alerts for this symbol
    for (let i = 0; i < this.activeAlertsWithContext.length; i++) {
      const item = this.activeAlertsWithContext[i];
      if (!item.alert.active || item.alert.symbol.toUpperCase() !== upperSymbol) {
        continue;
      }

      const { triggered, effectiveTarget } = evaluateAlertCrossing(
        item.alert,
        prevPrice,
        currentPrice,
        nowSec,
        nowMs
      );

      if (triggered) {
        await this.triggerAlert(item, currentPrice, effectiveTarget, nowMs);
      } else if (
        item.alert.notifyOnInvalidation &&
        typeof item.alert.invalidationPrice === "number" &&
        item.alert.invalidationPrice > 0 &&
        item.alert.poiMetadata
      ) {
        // DEC-150: Real-time POI Break & Invalidation check
        const isBullish = item.alert.poiMetadata.direction === "BULLISH";
        const wasBreached = isBullish
          ? prevPrice < item.alert.invalidationPrice
          : prevPrice > item.alert.invalidationPrice;
        const isNowBreached = isBullish
          ? currentPrice <= item.alert.invalidationPrice
          : currentPrice >= item.alert.invalidationPrice;

        if (!wasBreached && isNowBreached) {
          const telemetry = detectPoiInvalidationBreak(
            {
              id: item.alert.poiMetadata.poiId,
              symbol: item.alert.symbol,
              timeframe: item.alert.poiMetadata.timeframe,
              category: item.alert.poiMetadata.category,
              type: item.alert.poiMetadata.direction,
              label: item.alert.label,
              top: item.alert.poiMetadata.zoneTop,
              bottom: item.alert.poiMetadata.zoneBottom,
              meanThreshold: (item.alert.poiMetadata.zoneTop + item.alert.poiMetadata.zoneBottom) / 2,
              entryPrice: isBullish ? item.alert.poiMetadata.zoneTop : item.alert.poiMetadata.zoneBottom,
              fullRetestPrice: isBullish ? item.alert.poiMetadata.zoneBottom : item.alert.poiMetadata.zoneTop,
              invalidationPrice: item.alert.invalidationPrice,
              status: "broken",
              isInsideZone: false,
              distanceToEntryPct: 0,
              distanceToMtPct: 0,
              currentPrice,
              time: nowMs,
            },
            currentPrice,
            currentPrice,
            nowMs
          );

          if (telemetry) {
            item.alert.breakTelemetry = telemetry;
            await this.triggerAlert(item, currentPrice, item.alert.invalidationPrice, nowMs);
          }
        }
      }
    }
  }

  /**
   * Handles alert execution: updates store, logs event, and dispatches webhooks
   */
  private async triggerAlert(
    item: ActiveAlertContext,
    currentPrice: number,
    targetPrice: number,
    nowMs: number
  ): Promise<void> {
    const { alert, userId, webhooks } = item;

    // Enforce cooldown for safety
    if (
      alert.frequency === "every_time" &&
      typeof alert.lastTriggeredAt === "number" &&
      nowMs - alert.lastTriggeredAt < ALERT_COOLDOWN_MS
    ) {
      return;
    }

    alert.triggeredCount = (alert.triggeredCount || 0) + 1;
    alert.lastTriggeredAt = nowMs;
    if (alert.frequency === "only_once") {
      alert.active = false;
    }

    const log: AlertLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      alertId: alert.id,
      symbol: alert.symbol,
      triggerPrice: currentPrice,
      targetPrice,
      condition: alert.condition,
      sourceType: alert.sourceType,
      label: alert.label || `${alert.symbol} Price Alert`,
      message: alert.conditionMessage || `Market price crossed target $${targetPrice}`,
      triggeredAt: nowMs,
    };

    console.log(
      `[ServerAlertDaemon] 🚨 ALERT TRIGGERED: ${alert.symbol} ${alert.condition} @ $${currentPrice} (Target: $${targetPrice}) for user ${userId}`
    );

    // 1. Update alert in server store
    try {
      await updateServerAlert(
        alert.id,
        {
          active: alert.active,
          triggeredCount: alert.triggeredCount,
          lastTriggeredAt: alert.lastTriggeredAt,
        },
        userId
      );
      await appendServerAlertLog(userId, log);
    } catch (storeErr) {
      console.warn("[ServerAlertDaemon] Error updating alert in store:", storeErr);
    }

    // 2. Dispatch notifications to Discord/Telegram
    if (webhooks) {
      try {
        const dispatchResult = await dispatchDirectWebhooks(webhooks, alert, log);
        console.log("[ServerAlertDaemon] Webhook dispatch results:", dispatchResult);
      } catch (dispatchErr) {
        console.warn("[ServerAlertDaemon] Webhook dispatch error:", dispatchErr);
      }
    }

    // If one-time alert, remove from active in-memory list
    if (alert.frequency === "only_once") {
      this.activeAlertsWithContext = this.activeAlertsWithContext.filter(
        (ctx) => ctx.alert.id !== alert.id
      );
    }
  }

  /**
   * Establishes MEXC WebSocket connection
   */
  private connectWs(): void {
    if (!this.isRunning) return;

    const WsConstructor = typeof globalThis.WebSocket !== "undefined" ? globalThis.WebSocket : null;
    if (!WsConstructor) {
      console.warn("[ServerAlertDaemon] Native WebSocket not available in environment. Relying on REST polling.");
      return;
    }

    try {
      this.ws = new WsConstructor(this.wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this.reconnectDelay = 2000;
        this.lastWsMessageTime = Date.now();
        console.log("[ServerAlertDaemon] WebSocket connected to MEXC.");

        // Subscribe to public miniTickers for all symbols
        this.sendWsSubscription("spot@public.miniTickers.v3.api@UTC+8");

        // Subscribe to deals for tracked symbols
        for (const sym of this.trackedSymbols) {
          this.sendWsSubscription(`spot@public.deals.v3.api@${sym}`);
        }

        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.lastWsMessageTime = Date.now();
        this.handleWsMessage(event.data);
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = (_err: unknown) => {
        this.wsConnected = false;
        try {
          this.ws?.close();
        } catch {}
      };
    } catch (err) {
      console.warn("[ServerAlertDaemon] Failed to instantiate WebSocket:", err);
      this.scheduleReconnect();
    }
  }

  private handleWsMessage(raw: any): void {
    if (raw === "pong" || raw === "PONG") return;

    try {
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;

      // 1. Handle Deals / Trade stream
      if (data?.c && data.c.includes("public.deals.v3.api") && data?.d?.deals) {
        const channel: string = data.c;
        const symbol = channel.split("@")[2] || "";
        const deals = data.d.deals;
        if (Array.isArray(deals) && deals.length > 0) {
          const lastDeal = deals[deals.length - 1];
          const price = parseFloat(lastDeal.p);
          if (Number.isFinite(price) && symbol) {
            this.processPriceUpdate(symbol, price);
          }
        }
      }

      // 2. Handle MiniTickers stream
      if (data?.c && data.c.includes("public.miniTickers.v3.api") && Array.isArray(data?.d)) {
        for (const ticker of data.d) {
          const symbol: string = ticker.s;
          if (symbol && this.trackedSymbols.has(symbol.toUpperCase())) {
            const price = parseFloat(ticker.p);
            if (Number.isFinite(price)) {
              this.processPriceUpdate(symbol, price);
            }
          }
        }
      }
    } catch {}
  }

  private sendWsSubscription(param: string): void {
    if (this.ws && this.wsConnected && this.ws.readyState === 1) {
      try {
        this.ws.send(
          JSON.stringify({
            method: "SUBSCRIPTION",
            params: [param],
          })
        );
      } catch {}
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.wsConnected && this.ws.readyState === 1) {
        try {
          this.ws.send(JSON.stringify({ method: "PING" }));
        } catch {}
      }
    }, 20000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.isRunning) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
      this.connectWs();
    }, this.reconnectDelay);
  }

  /**
   * Fallback REST Poller: Polls MEXC /api/v3/ticker/price every 5 seconds
   * Activates when WebSocket has had no messages for >10s or when WebSocket is disconnected
   */
  private startRestFallback(): void {
    if (this.restFallbackTimer) return;

    this.restFallbackTimer = setInterval(async () => {
      if (!this.isRunning) return;
      if (this.trackedSymbols.size === 0) return;

      const wsSilent = Date.now() - this.lastWsMessageTime > 10000;
      if (!this.wsConnected || wsSilent) {
        await this.pollRestPrices();
      }
    }, 5000);
  }

  private async pollRestPrices(): Promise<void> {
    const symbols = Array.from(this.trackedSymbols);
    if (symbols.length === 0) return;

    for (const sym of symbols) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://api.mexc.com/api/v3/ticker/price?symbol=${sym}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const price = parseFloat(data.price);
          if (Number.isFinite(price)) {
            this.processPriceUpdate(sym, price);
          }
        }
      } catch {}
    }
  }
}

// Global server daemon singleton instance
export const serverAlertDaemon = new ServerAlertDaemon();
