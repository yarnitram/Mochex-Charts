import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import {
  maskApiKey,
  generateHmacSha256,
  validateBrokerCredentials,
  formatBrokerSymbol,
  isMockBrokerCredentials,
  fetchMexcBalance,
  placeMexcOrder,
  fetchBinanceBalance,
  placeBinanceOrder,
  fetchBybitBalance,
  placeBybitOrder,
  testBrokerConnection,
  executeBrokerOrder,
  BrokerCredentials,
} from "../src/lib/trading/multi-broker-client";
import {
  saveServerBrokerCredentials,
  getServerBrokerCredentials,
  getMaskedBrokerCredentials,
  deleteServerBrokerCredentials,
} from "../src/lib/trading/broker-auth-store";

describe("Multi-Broker Direct Execution Adapter (DEC-156)", () => {
  const TEST_USER = "test-user-dec156";

  const mockMexcCreds: BrokerCredentials = {
    exchange: "mexc",
    apiKey: "mock:mx0v9384918204812",
    apiSecret: "mock:sec9482018491024981",
    label: "MEXC Scalper",
  };

  const mockBinanceCreds: BrokerCredentials = {
    exchange: "binance",
    apiKey: "mock:binance-key-4928103",
    apiSecret: "mock:binance-sec-9482018",
    testnet: true,
  };

  const mockBybitCreds: BrokerCredentials = {
    exchange: "bybit",
    apiKey: "mock:bybit-key-10928340",
    apiSecret: "mock:bybit-sec-3819204",
  };

  afterEach(async () => {
    try {
      await deleteServerBrokerCredentials(TEST_USER, "mexc");
      await deleteServerBrokerCredentials(TEST_USER, "binance");
      await deleteServerBrokerCredentials(TEST_USER, "bybit");
    } catch {}
  });

  describe("Cryptographic Signing & Utilities", () => {
    it("should mask API keys securely", () => {
      expect(maskApiKey("")).toBe("");
      expect(maskApiKey("short")).toBe("******");
      expect(maskApiKey("mx0v9827461938492048af12")).toBe("mx0v...af12");
      expect(maskApiKey("  abcdefghijklmn  ")).toBe("abcd...klmn");
    });

    it("should generate exact HMAC-SHA256 signatures", () => {
      const payload = "symbol=BTCUSDT&timestamp=1700000000000";
      const secret = "test-secret-key-12345";
      const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

      const sig = generateHmacSha256(payload, secret);
      expect(sig).toBe(expected);
      expect(sig).toHaveLength(64);
    });

    it("should standardize broker symbols correctly", () => {
      expect(formatBrokerSymbol("mexc", "BTC/USDT")).toBe("BTCUSDT");
      expect(formatBrokerSymbol("binance", "eth-usdt")).toBe("ETHUSDT");
      expect(formatBrokerSymbol("bybit", "SOL_USDT")).toBe("SOLUSDT");
    });

    it("should identify mock/sandbox credentials", () => {
      expect(isMockBrokerCredentials(mockMexcCreds)).toBe(true);
      expect(
        isMockBrokerCredentials({
          exchange: "mexc",
          apiKey: "real-prod-api-key-92840",
          apiSecret: "real-prod-api-secret-10928",
        })
      ).toBe(false);
    });

    it("should validate broker credentials structure", () => {
      expect(validateBrokerCredentials(null as any).valid).toBe(false);
      expect(
        validateBrokerCredentials({
          exchange: "coinbase" as any,
          apiKey: "12345678",
          apiSecret: "12345678",
        }).valid
      ).toBe(false);
      expect(
        validateBrokerCredentials({
          exchange: "mexc",
          apiKey: "short",
          apiSecret: "12345678",
        }).valid
      ).toBe(false);
      expect(validateBrokerCredentials(mockMexcCreds).valid).toBe(true);
    });
  });

  describe("Exchange Balance Retrieval (Mock / Sandbox Mode)", () => {
    it("should fetch MEXC Spot balance", async () => {
      const balance = await fetchMexcBalance(mockMexcCreds);
      expect(balance.exchange).toBe("mexc");
      expect(balance.freeUsdt).toBeGreaterThan(0);
      expect(balance.totalEquityUsdt).toBeGreaterThanOrEqual(balance.freeUsdt);
      expect(balance.assets.length).toBeGreaterThan(0);
    });

    it("should fetch Binance Futures/Spot balance", async () => {
      const balance = await fetchBinanceBalance(mockBinanceCreds);
      expect(balance.exchange).toBe("binance");
      expect(balance.freeUsdt).toBeGreaterThan(0);
      expect(balance.assets.some((a) => a.asset === "USDT")).toBe(true);
    });

    it("should fetch Bybit V5 Unified balance", async () => {
      const balance = await fetchBybitBalance(mockBybitCreds);
      expect(balance.exchange).toBe("bybit");
      expect(balance.freeUsdt).toBeGreaterThan(0);
      expect(balance.assets.some((a) => a.asset === "USDT")).toBe(true);
    });
  });

  describe("Direct Order Placement (Mock / Sandbox Mode)", () => {
    it("should place MEXC Limit order", async () => {
      const res = await placeMexcOrder(mockMexcCreds, {
        exchange: "mexc",
        symbol: "BTC/USDT",
        side: "BUY",
        type: "LIMIT",
        price: 64500,
        quantity: 0.05,
      });

      expect(res.success).toBe(true);
      expect(res.exchange).toBe("mexc");
      expect(res.symbol).toBe("BTCUSDT");
      expect(res.status).toBe("NEW");
      expect(res.orderId).toContain("mexc-mock-");
    });

    it("should place MEXC Market order with FILLED status", async () => {
      const res = await placeMexcOrder(mockMexcCreds, {
        exchange: "mexc",
        symbol: "ETH/USDT",
        side: "SELL",
        type: "MARKET",
        quantity: 1.5,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("FILLED");
      expect(res.executedQty).toBe(1.5);
    });

    it("should place Binance Futures order", async () => {
      const res = await placeBinanceOrder(mockBinanceCreds, {
        exchange: "binance",
        symbol: "SOL/USDT",
        side: "BUY",
        type: "LIMIT",
        price: 155,
        quantity: 5,
      });

      expect(res.success).toBe(true);
      expect(res.exchange).toBe("binance");
      expect(res.symbol).toBe("SOLUSDT");
      expect(res.status).toBe("NEW");
    });

    it("should place Bybit V5 order with Stop Loss & Take Profit", async () => {
      const res = await placeBybitOrder(mockBybitCreds, {
        exchange: "bybit",
        symbol: "BTC/USDT",
        side: "BUY",
        type: "LIMIT",
        price: 65000,
        quantity: 0.1,
        stopLoss: 63500,
        takeProfit: 68000,
      });

      expect(res.success).toBe(true);
      expect(res.exchange).toBe("bybit");
      expect(res.orderId).toContain("bybit-mock-");
    });
  });

  describe("Unified Adapter Dispatcher", () => {
    it("should test connection and report latency and balance", async () => {
      const testMexc = await testBrokerConnection(mockMexcCreds);
      expect(testMexc.ok).toBe(true);
      expect(testMexc.latencyMs).toBeGreaterThanOrEqual(0);
      expect(testMexc.balance?.freeUsdt).toBeGreaterThan(0);

      const testBinance = await testBrokerConnection(mockBinanceCreds);
      expect(testBinance.ok).toBe(true);

      const testBybit = await testBrokerConnection(mockBybitCreds);
      expect(testBybit.ok).toBe(true);
    });

    it("should execute order via unified dispatcher", async () => {
      const res = await executeBrokerOrder(mockMexcCreds, {
        exchange: "mexc",
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 0.01,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("FILLED");
    });
  });

  describe("Server Broker Credentials Store", () => {
    it("should save and retrieve masked credentials safely", async () => {
      await saveServerBrokerCredentials(TEST_USER, mockMexcCreds);
      await saveServerBrokerCredentials(TEST_USER, mockBybitCreds);

      const stored = await getServerBrokerCredentials(TEST_USER);
      expect(stored.mexc?.apiKey).toBe(mockMexcCreds.apiKey);
      expect(stored.bybit?.apiKey).toBe(mockBybitCreds.apiKey);

      const masked = await getMaskedBrokerCredentials(TEST_USER);
      expect(masked.mexc?.apiKeyMasked).toBe(maskApiKey(mockMexcCreds.apiKey));
      expect(masked.mexc?.hasSecret).toBe(true);
      expect((masked.mexc as any).apiSecret).toBeUndefined(); // Raw secret NEVER exposed to client
      expect(masked.bybit?.apiKeyMasked).toBe(maskApiKey(mockBybitCreds.apiKey));

      await deleteServerBrokerCredentials(TEST_USER, "mexc");
      const afterDelete = await getServerBrokerCredentials(TEST_USER);
      expect(afterDelete.mexc).toBeUndefined();
      expect(afterDelete.bybit).toBeDefined();
    });
  });
});
