/**
 * Multi-Broker Direct Execution Adapter Engine (DEC-156)
 * Native HMAC-SHA256 cryptographic request signing and execution client
 * for MEXC Spot V3, Binance Futures/Spot, and Bybit V5 Unified APIs.
 */

import crypto from "node:crypto";

export type SupportedBrokerExchange = "mexc" | "binance" | "bybit";

export interface BrokerCredentials {
  exchange: SupportedBrokerExchange;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet?: boolean;
  label?: string;
  updatedAt?: number;
}

export interface MaskedBrokerCredentials {
  exchange: SupportedBrokerExchange;
  apiKeyMasked: string;
  hasSecret: boolean;
  testnet?: boolean;
  label?: string;
  updatedAt?: number;
}

export interface ExchangeBalanceAsset {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface ExchangeBalanceSummary {
  exchange: SupportedBrokerExchange;
  totalEquityUsdt: number;
  freeUsdt: number;
  assets: ExchangeBalanceAsset[];
  updatedAt: number;
}

export interface LiveOrderInput {
  exchange: SupportedBrokerExchange;
  symbol: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  reduceOnly?: boolean;
  clientOrderId?: string;
}

export interface LiveOrderResult {
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  exchange: SupportedBrokerExchange;
  symbol: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  price: number;
  quantity: number;
  status: "FILLED" | "NEW" | "PARTIALLY_FILLED" | "CANCELED" | "REJECTED";
  executedQty?: number;
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  error?: string;
  timestamp: number;
}

export interface LivePosition {
  symbol: string;
  exchange: SupportedBrokerExchange;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  size: number;
  marginUsed: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  leverage: number;
  liquidationPrice?: number;
}

/**
 * Masks an API key for safe client display (e.g. "mx0v...93af").
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "******";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/**
 * Creates an HMAC-SHA256 signature string.
 */
export function generateHmacSha256(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Formats exchange symbol standardizing to exchange conventions.
 * e.g. "BTC/USDT" -> "BTCUSDT"
 */
export function formatBrokerSymbol(exchange: SupportedBrokerExchange, rawSymbol: string): string {
  const norm = rawSymbol.toUpperCase().replace(/[\/\-_]/g, "");
  return norm;
}

/**
 * Checks if credentials represent a mock or sandbox test mode.
 */
export function isMockBrokerCredentials(creds: BrokerCredentials): boolean {
  if (!creds || !creds.apiKey || !creds.apiSecret) return false;
  return (
    creds.apiKey.startsWith("mock:") ||
    creds.apiKey.startsWith("test:") ||
    creds.apiSecret.startsWith("mock:") ||
    creds.apiSecret.startsWith("test:")
  );
}

/**
 * Validates broker credentials format.
 */
export function validateBrokerCredentials(creds: BrokerCredentials): { valid: boolean; error?: string } {
  if (!creds) return { valid: false, error: "No credentials provided" };
  if (!["mexc", "binance", "bybit"].includes(creds.exchange)) {
    return { valid: false, error: "Unsupported exchange. Must be mexc, binance, or bybit." };
  }
  if (!creds.apiKey || creds.apiKey.trim().length < 8) {
    return { valid: false, error: "API Key must be at least 8 characters long." };
  }
  if (!creds.apiSecret || creds.apiSecret.trim().length < 8) {
    return { valid: false, error: "API Secret must be at least 8 characters long." };
  }
  return { valid: true };
}

// --------------------------------------------------------------------------
// 1. MEXC Spot V3 REST API Client
// --------------------------------------------------------------------------

export async function fetchMexcBalance(creds: BrokerCredentials): Promise<ExchangeBalanceSummary> {
  if (isMockBrokerCredentials(creds)) {
    return {
      exchange: "mexc",
      totalEquityUsdt: 5420.5,
      freeUsdt: 4210.0,
      assets: [
        { asset: "USDT", free: 4210.0, locked: 210.5, total: 4420.5 },
        { asset: "BTC", free: 0.0125, locked: 0, total: 0.0125 },
        { asset: "SOL", free: 2.5, locked: 0, total: 2.5 },
      ],
      updatedAt: Date.now(),
    };
  }

  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=5000`;
  const signature = generateHmacSha256(queryString, creds.apiSecret.trim());
  const url = `https://api.mexc.co/api/v3/account?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-MEXC-APIKEY": creds.apiKey.trim(),
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok || data.code) {
    throw new Error(data.msg || `MEXC API error (code: ${data.code || res.status})`);
  }

  const balances = Array.isArray(data.balances) ? data.balances : [];
  const assets: ExchangeBalanceAsset[] = [];
  let freeUsdt = 0;
  let totalUsdt = 0;

  for (const b of balances) {
    const free = parseFloat(b.free || "0");
    const locked = parseFloat(b.locked || "0");
    const total = free + locked;
    if (total > 0) {
      assets.push({ asset: b.asset, free, locked, total });
      if (b.asset === "USDT") {
        freeUsdt = free;
        totalUsdt = total;
      }
    }
  }

  return {
    exchange: "mexc",
    totalEquityUsdt: totalUsdt,
    freeUsdt,
    assets,
    updatedAt: Date.now(),
  };
}

export async function placeMexcOrder(
  creds: BrokerCredentials,
  order: LiveOrderInput
): Promise<LiveOrderResult> {
  const timestamp = Date.now();
  const symbol = formatBrokerSymbol("mexc", order.symbol);

  if (isMockBrokerCredentials(creds)) {
    return {
      success: true,
      orderId: `mexc-mock-${timestamp}-${Math.floor(Math.random() * 1000)}`,
      clientOrderId: order.clientOrderId || `client-${timestamp}`,
      exchange: "mexc",
      symbol,
      side: order.side,
      type: order.type,
      price: order.price || 0,
      quantity: order.quantity,
      status: order.type === "MARKET" ? "FILLED" : "NEW",
      executedQty: order.type === "MARKET" ? order.quantity : 0,
      timestamp,
    };
  }

  const params: Record<string, string | number> = {
    symbol,
    side: order.side,
    type: order.type,
    quantity: order.quantity,
    timestamp,
    recvWindow: 5000,
  };

  if (order.type === "LIMIT") {
    if (!order.price || order.price <= 0) {
      throw new Error("Limit orders require a valid execution price.");
    }
    params.price = order.price;
    params.timeInForce = "GTC";
  }

  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

  const signature = generateHmacSha256(queryString, creds.apiSecret.trim());
  const url = `https://api.mexc.co/api/v3/order?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-MEXC-APIKEY": creds.apiKey.trim(),
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok || data.code) {
    throw new Error(data.msg || `MEXC order failed (${data.code || res.status})`);
  }

  return {
    success: true,
    orderId: String(data.orderId || ""),
    clientOrderId: data.clientOrderId || order.clientOrderId,
    exchange: "mexc",
    symbol,
    side: order.side,
    type: order.type,
    price: parseFloat(data.price || String(order.price || 0)),
    quantity: parseFloat(data.origQty || String(order.quantity)),
    status: data.status === "FILLED" ? "FILLED" : "NEW",
    executedQty: parseFloat(data.executedQty || "0"),
    timestamp,
  };
}

// --------------------------------------------------------------------------
// 2. Binance Futures / Spot REST API Client
// --------------------------------------------------------------------------

export async function fetchBinanceBalance(creds: BrokerCredentials): Promise<ExchangeBalanceSummary> {
  if (isMockBrokerCredentials(creds)) {
    return {
      exchange: "binance",
      totalEquityUsdt: 8940.1,
      freeUsdt: 6850.25,
      assets: [
        { asset: "USDT", free: 6850.25, locked: 1200.0, total: 8050.25 },
        { asset: "BNB", free: 1.4, locked: 0, total: 1.4 },
      ],
      updatedAt: Date.now(),
    };
  }

  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=5000`;
  const signature = generateHmacSha256(queryString, creds.apiSecret.trim());

  // Check USDT-M Futures account first
  const futuresUrl = `https://fapi.binance.com/fapi/v2/balance?${queryString}&signature=${signature}`;
  try {
    const res = await fetch(futuresUrl, {
      method: "GET",
      headers: {
        "X-MBX-APIKEY": creds.apiKey.trim(),
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        let freeUsdt = 0;
        let totalUsdt = 0;
        const assets: ExchangeBalanceAsset[] = [];

        for (const b of data) {
          const total = parseFloat(b.balance || "0");
          const free = parseFloat(b.availableBalance || b.crossWalletBalance || "0");
          const locked = total - free;
          if (total > 0) {
            assets.push({ asset: b.asset, free, locked, total });
            if (b.asset === "USDT") {
              freeUsdt = free;
              totalUsdt = total;
            }
          }
        }

        return {
          exchange: "binance",
          totalEquityUsdt: totalUsdt,
          freeUsdt,
          assets,
          updatedAt: Date.now(),
        };
      }
    }
  } catch {}

  // Fallback to Spot account balance
  const spotUrl = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`;
  const resSpot = await fetch(spotUrl, {
    method: "GET",
    headers: {
      "X-MBX-APIKEY": creds.apiKey.trim(),
      "Content-Type": "application/json",
    },
  });

  const dataSpot = await resSpot.json();
  if (!resSpot.ok || dataSpot.code) {
    throw new Error(dataSpot.msg || `Binance API error (code: ${dataSpot.code || resSpot.status})`);
  }

  const balances = Array.isArray(dataSpot.balances) ? dataSpot.balances : [];
  const assets: ExchangeBalanceAsset[] = [];
  let freeUsdt = 0;
  let totalUsdt = 0;

  for (const b of balances) {
    const free = parseFloat(b.free || "0");
    const locked = parseFloat(b.locked || "0");
    const total = free + locked;
    if (total > 0) {
      assets.push({ asset: b.asset, free, locked, total });
      if (b.asset === "USDT") {
        freeUsdt = free;
        totalUsdt = total;
      }
    }
  }

  return {
    exchange: "binance",
    totalEquityUsdt: totalUsdt,
    freeUsdt,
    assets,
    updatedAt: Date.now(),
  };
}

export async function placeBinanceOrder(
  creds: BrokerCredentials,
  order: LiveOrderInput
): Promise<LiveOrderResult> {
  const timestamp = Date.now();
  const symbol = formatBrokerSymbol("binance", order.symbol);

  if (isMockBrokerCredentials(creds)) {
    return {
      success: true,
      orderId: `binance-mock-${timestamp}-${Math.floor(Math.random() * 1000)}`,
      clientOrderId: order.clientOrderId || `client-${timestamp}`,
      exchange: "binance",
      symbol,
      side: order.side,
      type: order.type,
      price: order.price || 0,
      quantity: order.quantity,
      status: order.type === "MARKET" ? "FILLED" : "NEW",
      executedQty: order.type === "MARKET" ? order.quantity : 0,
      timestamp,
    };
  }

  const params: Record<string, string | number> = {
    symbol,
    side: order.side,
    type: order.type,
    quantity: order.quantity,
    timestamp,
    recvWindow: 5000,
  };

  if (order.type === "LIMIT") {
    if (!order.price || order.price <= 0) {
      throw new Error("Limit orders require a valid execution price.");
    }
    params.price = order.price;
    params.timeInForce = "GTC";
  }

  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

  const signature = generateHmacSha256(queryString, creds.apiSecret.trim());
  const url = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-MBX-APIKEY": creds.apiKey.trim(),
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok || data.code) {
    throw new Error(data.msg || `Binance Futures order failed (${data.code || res.status})`);
  }

  return {
    success: true,
    orderId: String(data.orderId || ""),
    clientOrderId: data.clientOrderId || order.clientOrderId,
    exchange: "binance",
    symbol,
    side: order.side,
    type: order.type,
    price: parseFloat(data.price || String(order.price || 0)),
    quantity: parseFloat(data.origQty || String(order.quantity)),
    status: data.status === "FILLED" ? "FILLED" : "NEW",
    executedQty: parseFloat(data.executedQty || "0"),
    timestamp,
  };
}

// --------------------------------------------------------------------------
// 3. Bybit V5 Unified Trading REST API Client
// --------------------------------------------------------------------------

export async function fetchBybitBalance(creds: BrokerCredentials): Promise<ExchangeBalanceSummary> {
  if (isMockBrokerCredentials(creds)) {
    return {
      exchange: "bybit",
      totalEquityUsdt: 6720.8,
      freeUsdt: 5100.4,
      assets: [
        { asset: "USDT", free: 5100.4, locked: 1000.0, total: 6100.4 },
        { asset: "MNT", free: 500, locked: 0, total: 500 },
      ],
      updatedAt: Date.now(),
    };
  }

  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const queryString = "accountType=UNIFIED";
  const signPayload = `${timestamp}${creds.apiKey.trim()}${recvWindow}${queryString}`;
  const signature = generateHmacSha256(signPayload, creds.apiSecret.trim());

  const url = `https://api.bybit.com/v5/account/wallet-balance?${queryString}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": creds.apiKey.trim(),
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": signature,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok || data.retCode !== 0) {
    throw new Error(data.retMsg || `Bybit API error (code: ${data.retCode || res.status})`);
  }

  const accountList = data.result?.list || [];
  const coins = accountList[0]?.coin || [];
  const assets: ExchangeBalanceAsset[] = [];
  let freeUsdt = 0;
  let totalUsdt = 0;

  for (const c of coins) {
    const total = parseFloat(c.walletBalance || "0");
    const free = parseFloat(c.availableToWithdraw || c.walletBalance || "0");
    const locked = total - free;
    if (total > 0) {
      assets.push({ asset: c.coin, free, locked, total });
      if (c.coin === "USDT") {
        freeUsdt = free;
        totalUsdt = total;
      }
    }
  }

  return {
    exchange: "bybit",
    totalEquityUsdt: totalUsdt,
    freeUsdt,
    assets,
    updatedAt: Date.now(),
  };
}

export async function placeBybitOrder(
  creds: BrokerCredentials,
  order: LiveOrderInput
): Promise<LiveOrderResult> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const symbol = formatBrokerSymbol("bybit", order.symbol);

  if (isMockBrokerCredentials(creds)) {
    return {
      success: true,
      orderId: `bybit-mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      clientOrderId: order.clientOrderId || `client-${Date.now()}`,
      exchange: "bybit",
      symbol,
      side: order.side,
      type: order.type,
      price: order.price || 0,
      quantity: order.quantity,
      status: order.type === "MARKET" ? "FILLED" : "NEW",
      executedQty: order.type === "MARKET" ? order.quantity : 0,
      timestamp: Date.now(),
    };
  }

  const bybitSide = order.side === "BUY" ? "Buy" : "Sell";
  const bybitType = order.type === "LIMIT" ? "Limit" : "Market";

  const bodyObj: Record<string, any> = {
    category: "linear",
    symbol,
    side: bybitSide,
    orderType: bybitType,
    qty: String(order.quantity),
    timeInForce: "GTC",
  };

  if (order.type === "LIMIT") {
    if (!order.price || order.price <= 0) {
      throw new Error("Limit orders require a valid execution price.");
    }
    bodyObj.price = String(order.price);
  }

  if (order.stopLoss && order.stopLoss > 0) {
    bodyObj.stopLoss = String(order.stopLoss);
  }
  if (order.takeProfit && order.takeProfit > 0) {
    bodyObj.takeProfit = String(order.takeProfit);
  }

  const jsonBody = JSON.stringify(bodyObj);
  const signPayload = `${timestamp}${creds.apiKey.trim()}${recvWindow}${jsonBody}`;
  const signature = generateHmacSha256(signPayload, creds.apiSecret.trim());

  const url = `https://api.bybit.com/v5/order/create`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-BAPI-API-KEY": creds.apiKey.trim(),
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": signature,
      "Content-Type": "application/json",
    },
    body: jsonBody,
  });

  const data = await res.json();
  if (!res.ok || data.retCode !== 0) {
    throw new Error(data.retMsg || `Bybit order creation failed (${data.retCode || res.status})`);
  }

  const orderId = data.result?.orderId || "";
  const orderLinkId = data.result?.orderLinkId || order.clientOrderId;

  return {
    success: true,
    orderId,
    clientOrderId: orderLinkId,
    exchange: "bybit",
    symbol,
    side: order.side,
    type: order.type,
    price: order.price || 0,
    quantity: order.quantity,
    status: "NEW",
    timestamp: Date.now(),
  };
}

// --------------------------------------------------------------------------
// Unified Broker Adapter Dispatcher
// --------------------------------------------------------------------------

/**
 * Tests exchange API connectivity and permissions.
 */
export async function testBrokerConnection(
  creds: BrokerCredentials
): Promise<{ ok: boolean; latencyMs: number; balance?: ExchangeBalanceSummary; error?: string }> {
  const start = Date.now();
  const validation = validateBrokerCredentials(creds);
  if (!validation.valid) {
    return { ok: false, latencyMs: 0, error: validation.error };
  }

  try {
    let balance: ExchangeBalanceSummary;
    switch (creds.exchange) {
      case "mexc":
        balance = await fetchMexcBalance(creds);
        break;
      case "binance":
        balance = await fetchBinanceBalance(creds);
        break;
      case "bybit":
        balance = await fetchBybitBalance(creds);
        break;
      default:
        throw new Error(`Unsupported exchange: ${creds.exchange}`);
    }

    const latencyMs = Date.now() - start;
    return { ok: true, latencyMs, balance };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err?.message || "Failed to reach exchange server",
    };
  }
}

/**
 * Fetches balances across the specified exchange.
 */
export async function fetchBrokerBalance(
  creds: BrokerCredentials
): Promise<ExchangeBalanceSummary> {
  switch (creds.exchange) {
    case "mexc":
      return fetchMexcBalance(creds);
    case "binance":
      return fetchBinanceBalance(creds);
    case "bybit":
      return fetchBybitBalance(creds);
    default:
      throw new Error(`Unsupported exchange: ${creds.exchange}`);
  }
}

/**
 * Executes a live order on the specified exchange.
 */
export async function executeBrokerOrder(
  creds: BrokerCredentials,
  order: LiveOrderInput
): Promise<LiveOrderResult> {
  const validation = validateBrokerCredentials(creds);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  switch (creds.exchange) {
    case "mexc":
      return placeMexcOrder(creds, order);
    case "binance":
      return placeBinanceOrder(creds, order);
    case "bybit":
      return placeBybitOrder(creds, order);
    default:
      throw new Error(`Unsupported exchange: ${creds.exchange}`);
  }
}
