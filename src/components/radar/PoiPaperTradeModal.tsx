"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Zap,
  Check,
  Shield,
  Target,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Sliders,
  Sparkles,
  Star,
  Info,
} from "lucide-react";
import { RadarPoiItem } from "@/lib/indicators/radar-poi-engine";
import {
  createOrderInputFromPoi,
  executePoiPaperTrade,
  loadStoredPaperAccount,
  calculateAccountEquity,
} from "@/lib/trading/paper-trading-engine";
import { playRadarChime } from "@/lib/audio/sound-effects";

interface PoiPaperTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  poi: RadarPoiItem;
  currentPrice: number;
  onSuccess?: (message: string) => void;
}

export function PoiPaperTradeModal({
  isOpen,
  onClose,
  poi,
  currentPrice,
  onSuccess,
}: PoiPaperTradeModalProps) {
  const isLong = poi.type === "BULLISH";

  // Trade configuration state
  const [touchLevel, setTouchLevel] = useState<"entry" | "fifty_pct">("entry");
  const [riskReward, setRiskReward] = useState<number>(2.0); // 2R default
  const [marginUsdt, setMarginUsdt] = useState<number>(500);
  const [leverage, setLeverage] = useState<number>(5);
  const [orderTypeChoice, setOrderTypeChoice] = useState<"auto" | "limit" | "market">("auto");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load live account free margin
  const account = useMemo(() => loadStoredPaperAccount(), [isOpen]);
  const equitySummary = useMemo(() => {
    return calculateAccountEquity(account, { [poi.symbol]: currentPrice });
  }, [account, poi.symbol, currentPrice]);

  // Derive order input and projected PnLs
  const derivedOrder = useMemo(() => {
    return createOrderInputFromPoi(poi, currentPrice, {
      touchLevel,
      riskRewardRatio: riskReward,
      marginAmountUsdt: marginUsdt,
      leverage,
      orderType: orderTypeChoice === "auto" ? undefined : orderTypeChoice,
    });
  }, [poi, currentPrice, touchLevel, riskReward, marginUsdt, leverage, orderTypeChoice]);

  if (!isOpen) return null;

  const notional = derivedOrder.marginAmountUsdt * derivedOrder.leverage;
  const quantity = derivedOrder.price ? notional / derivedOrder.price : 0;
  const priceRisk = derivedOrder.stopLoss
    ? Math.abs((derivedOrder.price || currentPrice) - derivedOrder.stopLoss)
    : 0;
  const projectedLoss = quantity * priceRisk;
  const priceReward = derivedOrder.takeProfit
    ? Math.abs(derivedOrder.takeProfit - (derivedOrder.price || currentPrice))
    : 0;
  const projectedGain = quantity * priceReward;

  const hasEnoughMargin = derivedOrder.marginAmountUsdt <= equitySummary.freeMargin;

  const handleExecute = () => {
    if (!hasEnoughMargin) return;
    setIsSubmitting(true);

    try {
      const result = executePoiPaperTrade(poi, currentPrice, {
        touchLevel,
        riskRewardRatio: riskReward,
        marginAmountUsdt: marginUsdt,
        leverage,
        orderType: orderTypeChoice === "auto" ? undefined : orderTypeChoice,
      });

      if (result.status === "filled" || result.status === "placed") {
        playRadarChime({ soundType: "cyber_blip", volume: 0.8, enabled: true });
        if (onSuccess) {
          onSuccess(result.message);
        }
        onClose();
      }
    } catch (err: any) {
      console.warn("Paper trade execution error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fmt = (p: number) => (p >= 1 ? p.toFixed(2) : p.toFixed(4));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none">
      <div className="bg-[#121824] border border-[#233144] w-[500px] max-w-[95vw] rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs font-mono animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f293d] bg-[#0c1017]">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg border ${
                isLong
                  ? "bg-[#00c087]/15 text-[#00c087] border-[#00c087]/30"
                  : "bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/30"
              }`}
            >
              {isLong ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            </div>
            <div>
              <div className="font-bold text-white text-sm flex items-center gap-2">
                <span>Arm POI Trade: {poi.symbol.replace("USDT", "/USDT")}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                    isLong
                      ? "bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30"
                      : "bg-[#ff3b30]/15 text-[#ff3b30] border border-[#ff3b30]/30"
                  }`}
                >
                  {isLong ? "LONG (Demand)" : "SHORT (Supply)"}
                </span>
              </div>
              <div className="text-[10px] text-[#848e9c] flex items-center gap-1.5">
                <span>{poi.label}</span>
                {poi.isPlus && (
                  <span className="text-yellow-400 font-semibold flex items-center gap-0.5">
                    <Star size={9} className="fill-yellow-400" /> ++HTF Confluence
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#848e9c] hover:text-white p-1 rounded hover:bg-[#1a2332] cursor-pointer transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-3.5 max-h-[75vh] overflow-y-auto">
          {/* 1. Entry Level Choice */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-[#b6c4ff] font-semibold flex items-center justify-between">
              <span>Planned Entry Level</span>
              <span className="text-[10px] text-[#848e9c]">Mark: ${fmt(currentPrice)}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTouchLevel("entry")}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                  touchLevel === "entry"
                    ? "bg-[#2962ff]/20 text-white border-[#2962ff]"
                    : "bg-[#0e141f] text-[#848e9c] border-[#1f2c3f] hover:text-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">Zone Entry</span>
                  {touchLevel === "entry" && <Check size={12} className="text-[#2962ff]" />}
                </div>
                <div className="text-[11px] text-[#b6c4ff] font-bold mt-0.5">
                  ${fmt(poi.entryPrice)}
                </div>
                <div className="text-[9px] text-[#848e9c] mt-0.5">Outer zone boundary</div>
              </button>

              <button
                type="button"
                onClick={() => setTouchLevel("fifty_pct")}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                  touchLevel === "fifty_pct"
                    ? "bg-[#2962ff]/20 text-white border-[#2962ff]"
                    : "bg-[#0e141f] text-[#848e9c] border-[#1f2c3f] hover:text-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">
                    {poi.category === "fvg" ? "50% CE" : "50% Mean Threshold"}
                  </span>
                  {touchLevel === "fifty_pct" && <Check size={12} className="text-[#2962ff]" />}
                </div>
                <div className="text-[11px] text-[#b6c4ff] font-bold mt-0.5">
                  ${fmt(poi.meanThreshold)}
                </div>
                <div className="text-[9px] text-[#848e9c] mt-0.5">Institutional equilibrium</div>
              </button>
            </div>
          </div>

          {/* 2. Brackets: Stop Loss & Take Profit with R:R */}
          <div className="p-3 rounded-lg bg-[#0e141f] border border-[#1f2c3f] flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#b6c4ff]">
              <span className="flex items-center gap-1.5">
                <Target size={13} className="text-[#2962ff]" />
                <span>Risk : Reward Ratio</span>
              </span>
              <div className="flex items-center gap-1">
                {[1.5, 2.0, 3.0, 4.0].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRiskReward(r)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                      riskReward === r
                        ? "bg-[#2962ff] text-white"
                        : "bg-[#172233] text-[#848e9c] hover:text-white"
                    }`}
                  >
                    {r}R
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#172233]">
              <div className="p-2 rounded bg-[#121824] border border-[#ff3b30]/30">
                <div className="text-[9px] text-[#ff3b30] uppercase font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Shield size={10} /> Stop Loss (SL)
                  </span>
                  <span>-0.2% Inval</span>
                </div>
                <div className="text-sm font-bold text-white mt-1">
                  ${fmt(derivedOrder.stopLoss || 0)}
                </div>
                <div className="text-[9px] text-[#ff3b30]/80 mt-0.5">
                  Risk: -${projectedLoss.toFixed(2)}
                </div>
              </div>

              <div className="p-2 rounded bg-[#121824] border border-[#00c087]/30">
                <div className="text-[9px] text-[#00c087] uppercase font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Target size={10} /> Take Profit (TP)
                  </span>
                  <span>{riskReward}R Target</span>
                </div>
                <div className="text-sm font-bold text-white mt-1">
                  ${fmt(derivedOrder.takeProfit || 0)}
                </div>
                <div className="text-[9px] text-[#00c087]/80 mt-0.5">
                  Profit: +${projectedGain.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Margin & Leverage */}
          <div className="grid grid-cols-2 gap-3">
            {/* Margin Allocation */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-[#b6c4ff] font-semibold flex items-center justify-between">
                <span>Margin Allocation</span>
                <span className="text-[10px] text-[#848e9c]">${marginUsdt} USDT</span>
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[100, 250, 500, 1000].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarginUsdt(m)}
                    className={`py-1 rounded text-[10px] font-bold border cursor-pointer transition-colors ${
                      marginUsdt === m
                        ? "bg-[#2962ff]/20 text-[#2962ff] border-[#2962ff]"
                        : "bg-[#0e141f] text-[#848e9c] border-[#1f2c3f] hover:text-white"
                    }`}
                  >
                    ${m}
                  </button>
                ))}
              </div>
            </div>

            {/* Leverage Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#b6c4ff]">
                <span>Leverage</span>
                <span className="text-white font-bold">{leverage}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={leverage}
                onChange={(e) => setLeverage(parseInt(e.target.value, 10))}
                className="w-full accent-[#2962ff] bg-[#1a2332] rounded-lg h-2 cursor-pointer mt-1"
              />
              <div className="flex justify-between text-[9px] text-[#848e9c]">
                <span>1x (Spot)</span>
                <span>5x</span>
                <span>10x</span>
                <span>20x</span>
              </div>
            </div>
          </div>

          {/* 4. Execution Summary Card */}
          <div className="p-3 rounded-lg bg-[#0e141f] border border-[#1f2c3f] flex flex-col gap-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-[#848e9c]">Order Execution Type</span>
              <span className="font-bold text-white uppercase">
                {derivedOrder.orderType === "market"
                  ? "⚡ Immediate Market Order (In-Zone)"
                  : "⏳ Resting Limit Order (At POI)"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#848e9c]">Position Notional</span>
              <span className="font-bold text-white">
                ${notional.toFixed(2)} ({quantity.toFixed(4)} {poi.symbol.replace("USDT", "")})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#848e9c]">Free Margin Available</span>
              <span
                className={`font-bold ${
                  hasEnoughMargin ? "text-[#00c087]" : "text-[#ff3b30]"
                }`}
              >
                ${equitySummary.freeMargin.toFixed(2)} USDT
              </span>
            </div>
          </div>

          {!hasEnoughMargin && (
            <div className="p-2 rounded bg-[#ff3b30]/15 border border-[#ff3b30]/40 text-[#ff3b30] text-center font-bold text-[10px]">
              ⚠️ Insufficient free margin to allocate ${marginUsdt} USDT.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1f293d] bg-[#0c1017]">
          <div className="text-[10px] text-[#848e9c]">
            Balance: <strong className="text-white">${equitySummary.balance.toFixed(2)}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded border border-[#233144] text-[#848e9c] hover:text-white hover:bg-[#1a2332] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={!hasEnoughMargin || isSubmitting}
              className={`px-4 py-1.5 rounded font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                isLong
                  ? "bg-[#00c087] hover:bg-[#00a876] text-black shadow-[#00c087]/20"
                  : "bg-[#ff3b30] hover:bg-[#e03026] text-white shadow-[#ff3b30]/20"
              }`}
            >
              <Zap size={13} className="fill-current" />
              <span>
                {derivedOrder.orderType === "market"
                  ? `Execute Market ${isLong ? "Long" : "Short"}`
                  : `Arm Limit ${isLong ? "Long" : "Short"}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
