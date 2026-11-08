"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Zap,
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Key,
  ExternalLink,
  DollarSign,
  Percent,
  Sliders,
} from "lucide-react";
import {
  RadarPoiItem,
  getRadarPoiAlarmTargetPrice,
} from "@/lib/indicators/radar-poi-engine";
import { OrderBlockTouchLevel } from "@/lib/indicators/validated-ob-engine";
import {
  SupportedBrokerExchange,
  MaskedBrokerCredentials,
  LiveOrderResult,
  ExchangeBalanceSummary,
} from "@/lib/trading/multi-broker-client";

interface PoiLiveTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  poi: RadarPoiItem;
  symbol: string;
  onOpenBrokerConfig?: () => void;
}

export function PoiLiveTradeModal({
  isOpen,
  onClose,
  poi,
  symbol,
  onOpenBrokerConfig,
}: PoiLiveTradeModalProps) {
  const isBullish = poi.type === "BULLISH";
  const defaultSide: "BUY" | "SELL" = isBullish ? "BUY" : "SELL";

  const defaultSl = poi.invalidationPrice || poi.fullRetestPrice;
  const defaultTp = isBullish
    ? poi.entryPrice + 2 * Math.abs(poi.entryPrice - defaultSl)
    : poi.entryPrice - 2 * Math.abs(poi.entryPrice - defaultSl);

  const [selectedExchange, setSelectedExchange] = useState<SupportedBrokerExchange>("mexc");
  const [credentials, setCredentials] = useState<
    Partial<Record<SupportedBrokerExchange, MaskedBrokerCredentials>>
  >({});
  const [balance, setBalance] = useState<ExchangeBalanceSummary | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Execution parameters
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [touchLevel, setTouchLevel] = useState<OrderBlockTouchLevel>("entry");
  const [customPrice, setCustomPrice] = useState<string>("");
  const [sizeMode, setSizeMode] = useState<"usdt" | "pct">("usdt");
  const [usdtSize, setUsdtSize] = useState<string>("100");
  const [pctSize, setPctSize] = useState<number>(5);

  // TP / SL
  const [enableSl, setEnableSl] = useState(true);
  const [stopLossPrice, setStopLossPrice] = useState<string>(
    defaultSl ? String(defaultSl.toFixed(defaultSl < 1 ? 6 : 2)) : ""
  );
  const [enableTp, setEnableTp] = useState(true);
  const [takeProfitPrice, setTakeProfitPrice] = useState<string>(
    defaultTp > 0 ? String(defaultTp.toFixed(defaultTp < 1 ? 6 : 2)) : ""
  );

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [executionResult, setExecutionResult] = useState<LiveOrderResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Load configured exchange credentials
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/broker/credentials")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.credentials) {
          setCredentials(data.credentials);
          // If current exchange is not configured, pick the first configured one if available
          const configured = Object.keys(data.credentials) as SupportedBrokerExchange[];
          if (configured.length > 0 && !data.credentials[selectedExchange]) {
            setSelectedExchange(configured[0]);
          }
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Load balance when selected exchange changes
  useEffect(() => {
    if (!isOpen || !credentials[selectedExchange]) {
      setBalance(null);
      return;
    }
    setBalanceLoading(true);
    fetch("/api/broker/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: selectedExchange }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && data.balance) {
          setBalance(data.balance);
        } else {
          setBalance(null);
        }
      })
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false));
  }, [isOpen, selectedExchange, credentials]);

  // Update prices when touch level or POI changes
  useEffect(() => {
    if (orderType === "LIMIT") {
      const calculatedEntry = getRadarPoiAlarmTargetPrice(poi, touchLevel);
      setCustomPrice(calculatedEntry > 0 ? calculatedEntry.toFixed(calculatedEntry < 1 ? 6 : 2) : "");
    } else {
      setCustomPrice(poi.currentPrice > 0 ? poi.currentPrice.toFixed(poi.currentPrice < 1 ? 6 : 2) : "");
    }
  }, [touchLevel, orderType, poi]);

  if (!isOpen) return null;

  const currentCreds = credentials[selectedExchange];
  const activeEntryPrice = parseFloat(customPrice) || poi.currentPrice || poi.entryPrice || 1;

  // Calculate order quantity
  let calculatedUsdt = parseFloat(usdtSize) || 100;
  if (sizeMode === "pct" && balance && balance.freeUsdt > 0) {
    calculatedUsdt = (balance.freeUsdt * pctSize) / 100;
  }
  const calculatedQty = activeEntryPrice > 0 ? calculatedUsdt / activeEntryPrice : 0;

  // Calculate Risk / Reward
  const slVal = parseFloat(stopLossPrice) || defaultSl;
  const tpVal = parseFloat(takeProfitPrice) || defaultTp;
  const riskPerUnit = slVal ? Math.abs(activeEntryPrice - slVal) : 0;
  const rewardPerUnit = tpVal ? Math.abs(tpVal - activeEntryPrice) : 0;
  const riskRewardRatio = riskPerUnit > 0 && rewardPerUnit > 0 ? (rewardPerUnit / riskPerUnit).toFixed(2) : null;
  const estimatedRiskUsdt = riskPerUnit > 0 ? (riskPerUnit * calculatedQty).toFixed(2) : null;
  const estimatedRewardUsdt = rewardPerUnit > 0 ? (rewardPerUnit * calculatedQty).toFixed(2) : null;

  const handleExecuteTrade = async () => {
    if (!currentCreds) {
      setExecutionError("Broker not connected. Please configure your API key.");
      return;
    }

    if (calculatedQty <= 0) {
      setExecutionError("Invalid order size.");
      return;
    }

    setIsSubmitting(true);
    setExecutionError(null);
    setExecutionResult(null);

    try {
      const payload = {
        exchange: selectedExchange,
        symbol: symbol.replace("/", ""),
        side: defaultSide,
        type: orderType,
        quantity: Number(calculatedQty.toFixed(6)),
        price: orderType === "LIMIT" ? activeEntryPrice : undefined,
        stopLoss: enableSl && slVal ? slVal : undefined,
        takeProfit: enableTp && tpVal ? tpVal : undefined,
      };

      const res = await fetch("/api/broker/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setExecutionError(data.error || "Order execution failed on exchange.");
      } else {
        setExecutionResult(data.order);
      }
    } catch (err: any) {
      setExecutionError(err?.message || "Network error while submitting trade.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isBullish
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
              }`}
            >
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">
                  Live Broker Order Execution
                </h2>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isBullish
                      ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/60"
                      : "bg-rose-950/80 text-rose-400 border-rose-800/60"
                  }`}
                >
                  {defaultSide} {symbol}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {poi.timeframe}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Direct execution via HMAC-SHA256 from POI setup
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Exchange Selection Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">
                Target Broker Exchange
              </label>
              {onOpenBrokerConfig && (
                <button
                  type="button"
                  onClick={onOpenBrokerConfig}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <Key className="w-3 h-3" />
                  <span>Configure API Keys</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["mexc", "binance", "bybit"] as SupportedBrokerExchange[]).map((ex) => {
                const isConfigured = Boolean(credentials[ex]?.apiKeyMasked);
                const isSelected = selectedExchange === ex;
                return (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setSelectedExchange(ex)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-slate-800/90 border-cyan-500/50 shadow-sm"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold text-slate-200 uppercase">
                        {ex}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isConfigured ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                        }`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {isConfigured ? credentials[ex]?.apiKeyMasked : "Not Configured"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Available Balance Banner */}
            <div className="mt-2.5 px-3 py-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {selectedExchange.toUpperCase()} Free Balance:
              </span>
              {balanceLoading ? (
                <div className="flex items-center gap-1 text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Checking...</span>
                </div>
              ) : balance ? (
                <span className="font-mono font-semibold text-emerald-400">
                  ${balance.freeUsdt.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  USDT
                </span>
              ) : currentCreds ? (
                <span className="text-amber-400 text-[11px]">Ready to trade</span>
              ) : (
                <span className="text-rose-400 text-[11px]">API Key Required</span>
              )}
            </div>
          </div>

          {/* POI Entry Level & Order Type */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                Order Type & Entry Setup
              </label>
              <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setOrderType("LIMIT")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    orderType === "LIMIT"
                      ? "bg-slate-800 text-cyan-400 font-semibold shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  LIMIT Order
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType("MARKET")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    orderType === "MARKET"
                      ? "bg-slate-800 text-cyan-400 font-semibold shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  MARKET Now
                </button>
              </div>
            </div>

            {orderType === "LIMIT" && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTouchLevel("entry")}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    touchLevel === "entry"
                      ? "bg-slate-800 border-cyan-500/50 text-cyan-300"
                      : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-medium">Zone Entry Touch</div>
                  <div className="text-xs font-mono font-bold text-slate-200">
                    ${poi.entryPrice.toFixed(poi.entryPrice < 1 ? 4 : 2)}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTouchLevel("fifty_pct")}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    touchLevel === "fifty_pct"
                      ? "bg-slate-800 border-cyan-500/50 text-cyan-300"
                      : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-medium">50% MT / Midline</div>
                  <div className="text-xs font-mono font-bold text-slate-200">
                    ${poi.meanThreshold.toFixed(poi.meanThreshold < 1 ? 4 : 2)}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTouchLevel("full")}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    touchLevel === "full"
                      ? "bg-slate-800 border-cyan-500/50 text-cyan-300"
                      : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-medium">Deep Retest</div>
                  <div className="text-xs font-mono font-bold text-slate-200">
                    ${poi.fullRetestPrice.toFixed(poi.fullRetestPrice < 1 ? 4 : 2)}
                  </div>
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Execution Price ($)
              </label>
              <input
                type="number"
                step="any"
                disabled={orderType === "MARKET"}
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Sizing Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Position Size</label>
              <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSizeMode("usdt")}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    sizeMode === "usdt"
                      ? "bg-slate-800 text-cyan-400 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  USDT Value
                </button>
                <button
                  type="button"
                  onClick={() => setSizeMode("pct")}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    sizeMode === "pct"
                      ? "bg-slate-800 text-cyan-400 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  % Equity
                </button>
              </div>
            </div>

            {sizeMode === "usdt" ? (
              <div className="space-y-2">
                <input
                  type="number"
                  value={usdtSize}
                  onChange={(e) => setUsdtSize(e.target.value)}
                  placeholder="Order size in USDT"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                />
                <div className="flex items-center gap-1.5">
                  {[50, 100, 250, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setUsdtSize(String(preset))}
                      className="px-2 py-0.5 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded transition-colors font-mono"
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span>Allocation: {pctSize}% of Free Balance</span>
                  <span className="text-cyan-400 font-bold">~${calculatedUsdt.toFixed(2)} USDT</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="25"
                  step="1"
                  value={pctSize}
                  onChange={(e) => setPctSize(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex items-center gap-1.5">
                  {[1, 2, 5, 10, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setPctSize(pct)}
                      className="px-2 py-0.5 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded transition-colors font-mono"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Calculated Quantity:</span>
              <span className="font-bold text-slate-100">
                {calculatedQty > 0 ? calculatedQty.toFixed(calculatedQty < 1 ? 4 : 2) : "0"}{" "}
                {symbol.split("/")[0]}
              </span>
            </div>
          </div>

          {/* Bracket SL / TP Section */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-medium text-rose-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Stop Loss</span>
                </label>
                <input
                  type="checkbox"
                  checked={enableSl}
                  onChange={(e) => setEnableSl(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0"
                />
              </div>
              <input
                type="number"
                step="any"
                disabled={!enableSl}
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(e.target.value)}
                placeholder="SL Price"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 disabled:opacity-40"
              />
              {estimatedRiskUsdt && (
                <div className="text-[10px] font-mono text-rose-400/90">
                  Risk: -${estimatedRiskUsdt} USDT
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <Target className="w-3.5 h-3.5" />
                  <span>Take Profit</span>
                </label>
                <input
                  type="checkbox"
                  checked={enableTp}
                  onChange={(e) => setEnableTp(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                />
              </div>
              <input
                type="number"
                step="any"
                disabled={!enableTp}
                value={takeProfitPrice}
                onChange={(e) => setTakeProfitPrice(e.target.value)}
                placeholder="TP Price"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 disabled:opacity-40"
              />
              {estimatedRewardUsdt && (
                <div className="text-[10px] font-mono text-emerald-400/90">
                  Reward: +${estimatedRewardUsdt} USDT {riskRewardRatio && `(${riskRewardRatio}R)`}
                </div>
              )}
            </div>
          </div>

          {/* Feedback & Result Message */}
          {executionResult && (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Order Submitted Successfully to {selectedExchange.toUpperCase()}!</span>
              </div>
              <div className="text-[11px] font-mono text-slate-300">
                Order ID: {executionResult.orderId} | Status: {executionResult.status} | Executed:{" "}
                {executionResult.executedQty || executionResult.quantity}
              </div>
            </div>
          )}

          {executionError && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{executionError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Account: <span className="text-slate-200 capitalize font-medium">{selectedExchange}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecuteTrade}
              disabled={isSubmitting || !currentCreds || calculatedQty <= 0}
              className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all shadow-lg ${
                isBullish
                  ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/50"
                  : "bg-rose-500 hover:bg-rose-400 text-slate-950 shadow-rose-950/50"
              } disabled:opacity-50`}
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>
                Execute {defaultSide} {orderType} (${calculatedUsdt.toFixed(0)})
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
