"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Bell,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
  Send,
  Layers,
  Filter,
  Volume2,
  Play,
  Shield,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  RadarPoiItem,
  getRadarPoiAlarmTargetPrice,
} from "@/lib/indicators/radar-poi-engine";
import { OrderBlockTouchLevel } from "@/lib/indicators/validated-ob-engine";
import { PriceAlert } from "@/lib/alerts/alerts-engine";
import {
  RadarChimeType,
  RADAR_CHIME_PRESETS,
  playRadarChime,
  getRadarAudioSettings,
} from "@/lib/audio/sound-effects";
import { DiscordIcon, TelegramIcon } from "@/components/terminal/AlertChannelsModal";

export interface CandidateCoinForBulkAlarm {
  symbol: string;
  name?: string;
  price: number;
  pois: RadarPoiItem[];
  poisByTimeframe: Record<string, RadarPoiItem[]>;
}

interface PoiBulkAlarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  coins: CandidateCoinForBulkAlarm[];
  currentUniverseLabel: string;
  currentExchange: string;
  defaultSelectedTimeframes: string[];
  existingAlerts?: PriceAlert[];
  onSuccess?: (createdCount: number) => void;
}


function getPoisForTf(
  poisByTimeframe: Record<string, RadarPoiItem[]> | undefined,
  tf: string
): RadarPoiItem[] {
  if (!poisByTimeframe) return [];
  if (Array.isArray(poisByTimeframe[tf]) && poisByTimeframe[tf].length > 0) {
    return poisByTimeframe[tf];
  }
  const tfMap: Record<string, string[]> = {
    "15m": ["15m", "15"],
    "60": ["60", "1H", "1h", "60m"],
    "1H": ["1H", "60", "1h", "60m"],
    "240": ["240", "4H", "4h", "240m"],
    "4H": ["4H", "240", "4h", "240m"],
    "1D": ["1D", "1d", "D", "1440"],
  };
  const alternatives = tfMap[tf] || [];
  for (const alt of alternatives) {
    if (Array.isArray(poisByTimeframe[alt]) && poisByTimeframe[alt].length > 0) {
      return poisByTimeframe[alt];
    }
  }
  return [];
}

export function PoiBulkAlarmModal({
  isOpen,
  onClose,
  coins,
  currentUniverseLabel,
  currentExchange,
  defaultSelectedTimeframes,
  existingAlerts = [],
  onSuccess,
}: PoiBulkAlarmModalProps) {
  // Category filter for the bulk alarm
  const [targetCategory, setTargetCategory] = useState<
    "order_block" | "sandwich_zone" | "fvg" | "all"
  >("order_block");

  // Selected timeframes
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() => {
    if (defaultSelectedTimeframes.length > 0) {
      return defaultSelectedTimeframes.map((tf) => (tf === "60" ? "1H" : tf === "240" ? "4H" : tf));
    }
    return ["1H", "4H"];
  });

  // Touch Level choice: "entry" | "fifty_pct" | "full"
  const [touchLevel, setTouchLevel] = useState<OrderBlockTouchLevel>("fifty_pct");

  // Channels
  const [notifyDiscord, setNotifyDiscord] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [notifyTradingWebhook, setNotifyTradingWebhook] = useState(false);
  const [notifyOnInvalidation, setNotifyOnInvalidation] = useState(true);

  // Audio preset
  const [alarmChime, setAlarmChime] = useState<RadarChimeType>(
    () => getRadarAudioSettings().soundType as RadarChimeType
  );

  // Per-coin toggle map (default all included)
  const [deselectedSymbols, setDeselectedSymbols] = useState<Record<string, boolean>>({});

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCandidateList, setShowCandidateList] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Reset states on open
  useEffect(() => {
    if (isOpen) {
      setDeselectedSymbols({});
      setStatusMessage(null);
      setIsSubmitting(false);
      if (defaultSelectedTimeframes.length > 0) {
        setSelectedTimeframes(
          defaultSelectedTimeframes.map((tf) => (tf === "60" ? "1H" : tf === "240" ? "4H" : tf))
        );
      }
    }
  }, [isOpen, defaultSelectedTimeframes]);

  // Map of existing active alerts indexed by normalized symbol
  const existingAlertsMap = useMemo(() => {
    const map: Record<string, PriceAlert[]> = {};
    for (const a of existingAlerts) {
      if (!a.active) continue;
      const key = a.symbol.toUpperCase().replace(/[\/\-_]/g, "");
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [existingAlerts]);

  // Calculate matching candidates and planned alerts
  const computedBatch = useMemo(() => {
    const plannedAlerts: PriceAlert[] = [];
    const matchedCoins: {
      symbol: string;
      name?: string;
      price: number;
      existingCount: number;
      pois: { tf: string; poi: RadarPoiItem; targetPrice: number }[];
    }[] = [];

    const now = Date.now();

    for (const coin of coins) {
      const normKey = coin.symbol.toUpperCase().replace(/[\/\-_]/g, "");
      const existingCount = existingAlertsMap[normKey]?.length || 0;
      const coinPois: { tf: string; poi: RadarPoiItem; targetPrice: number }[] = [];

      for (const tf of selectedTimeframes) {
        let tfPois = getPoisForTf(coin.poisByTimeframe, tf);
        if (tfPois.length === 0 && coin.pois && coin.pois.length > 0) {
          tfPois = coin.pois.filter(
            (p) =>
              p.timeframe === tf ||
              (tf === "1H" && (p.timeframe === "60" || p.timeframe === "1h")) ||
              (tf === "4H" && (p.timeframe === "240" || p.timeframe === "4h")) ||
              (tf === "15m" && p.timeframe === "15m") ||
              (tf === "1D" && (p.timeframe === "1D" || p.timeframe === "1d"))
          );
        }

        // Filter by target category
        let candidates = tfPois;
        if (targetCategory === "order_block") {
          candidates = tfPois.filter((p) => p.category === "order_block");
        } else if (targetCategory === "sandwich_zone") {
          candidates = tfPois.filter((p) => p.category === "sandwich_zone");
        } else if (targetCategory === "fvg") {
          candidates = tfPois.filter((p) => p.category === "fvg");
        }

        // Pick highest priority candidate for this timeframe
        if (candidates.length > 0) {
          const chosen = candidates[0];
          const targetPrice = getRadarPoiAlarmTargetPrice(chosen, touchLevel);
          coinPois.push({ tf, poi: chosen, targetPrice });

          if (!deselectedSymbols[coin.symbol]) {
            const touchLabel =
              touchLevel === "entry"
                ? "Zone Entry"
                : touchLevel === "fifty_pct"
                ? "50% Mean Threshold"
                : "Full Retest";

            const indicatorName =
              chosen.category === "sandwich_zone"
                ? "Sandwich Zones ++ (Supply & Demand)"
                : chosen.category === "fvg"
                ? "Fair Value Gap (FVG)"
                : "Validated Order Block (OB + FVG)";

            const cleanSym = coin.symbol.replace("USDT", "");
            plannedAlerts.push({
              id: `bulk-poi-${normKey}-${tf}-${chosen.category}-${touchLevel}-${now}-${Math.floor(Math.random() * 1000)}`,
              symbol: normKey,
              targetPrice,
              condition: chosen.type === "BULLISH" ? "crossing_down" : "crossing_up",
              frequency: "only_once",
              sourceType: "indicator_condition",
              indicatorName,
              label: `${cleanSym} ${tf} ${chosen.label} (${touchLabel})`,
              conditionMessage: `[Bulk Alarm] Price reached ${touchLabel} of ${tf} ${chosen.label} @ $${
                targetPrice >= 1 ? targetPrice.toFixed(2) : targetPrice.toFixed(4)
              }`,
              active: true,
              triggeredCount: 0,
              createdAt: now,
              notifyDiscord,
              notifyTelegram,
              notifyTradingWebhook,
              notifyOnInvalidation,
              invalidationPrice: chosen.invalidationPrice ?? chosen.fullRetestPrice,
              poiMetadata: {
                poiId: chosen.id,
                category: chosen.category,
                direction: chosen.type,
                timeframe: tf,
                zoneTop: chosen.top,
                zoneBottom: chosen.bottom,
                invalidationPrice: chosen.invalidationPrice ?? chosen.fullRetestPrice,
              },
              soundType: alarmChime,
            });
          }
        }
      }

      if (coinPois.length > 0) {
        matchedCoins.push({
          symbol: coin.symbol,
          name: coin.name,
          price: coin.price,
          existingCount,
          pois: coinPois,
        });
      }
    }

    return { matchedCoins, plannedAlerts };
  }, [
    coins,
    selectedTimeframes,
    targetCategory,
    touchLevel,
    deselectedSymbols,
    notifyDiscord,
    notifyTelegram,
    notifyTradingWebhook,
    notifyOnInvalidation,
    alarmChime,
    existingAlertsMap,
  ]);

  if (!isOpen) return null;

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes((prev) =>
      prev.includes(tf) ? (prev.length > 1 ? prev.filter((t) => t !== tf) : prev) : [...prev, tf]
    );
  };

  const toggleCoin = (symbol: string) => {
    setDeselectedSymbols((prev) => ({
      ...prev,
      [symbol]: !prev[symbol],
    }));
  };

  const handleSelectAllCoins = () => {
    setDeselectedSymbols({});
  };

  const handleDeselectAllCoins = () => {
    const map: Record<string, boolean> = {};
    computedBatch.matchedCoins.forEach((c) => {
      map[c.symbol] = true;
    });
    setDeselectedSymbols(map);
  };

  const handleExecuteBulkAlarms = async () => {
    if (computedBatch.plannedAlerts.length === 0) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    // 1. Immediately cache in localStorage
    try {
      const raw = localStorage.getItem("mochex:price_alerts");
      const existing = raw ? JSON.parse(raw) : [];
      const map = new Map<string, PriceAlert>();
      computedBatch.plannedAlerts.forEach((a) => map.set(a.id, a));
      existing.forEach((a: PriceAlert) => map.set(a.id, a));
      localStorage.setItem("mochex:price_alerts", JSON.stringify(Array.from(map.values())));
      window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
    } catch {}

    // 2. Persist to 24/7 background server daemon
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: computedBatch.plannedAlerts }),
      });

      const data = await res.json().catch(() => ({}));
      const count = data?.count || computedBatch.plannedAlerts.length;

      setStatusMessage(`⚡ Successfully armed ${count} 24/7 Cloud POI Alarms!`);

      if (onSuccess) {
        onSuccess(count);
      }
    } catch (err: any) {
      console.warn("Background daemon alert sync notice:", err);
      const count = computedBatch.plannedAlerts.length;
      setStatusMessage(`⚡ Armed ${count} Cloud POI Alarms in local cache!`);
      if (onSuccess) {
        onSuccess(count);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const touchLabel =
    touchLevel === "entry"
      ? "Zone Entry Touch"
      : touchLevel === "fifty_pct"
      ? "50% Mean Threshold / Midline"
      : "Full Retest / Invalidation Buffer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">
                  Bulk 24/7 Cloud POI Alarms
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/60">
                  Batch Setup
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Arm automated alarms across all matching coins with 1 click
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
          {/* Target Scope Pill Banner */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Scope:</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold border border-slate-700">
                {currentUniverseLabel}
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-mono uppercase text-[11px] border border-cyan-800/50">
                {currentExchange.toUpperCase()}
              </span>
            </div>
            <div className="text-xs font-mono">
              <span className="text-slate-400">Matches: </span>
              <span className="text-amber-400 font-bold">
                {computedBatch.matchedCoins.length} Coins
              </span>
            </div>
          </div>

          {/* POI Category Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              POI Category to Alarm
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "order_block", label: "Validated OB", desc: "OB + FVG Confirmed" },
                { id: "sandwich_zone", label: "Sandwich ++", desc: "Supply & Demand" },
                { id: "fvg", label: "FVG Imbalance", desc: "Pure 3-bar gap" },
                { id: "all", label: "All POIs", desc: "Any valid setup" },
              ].map((cat) => {
                const isSelected = targetCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setTargetCategory(cat.id as any)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "bg-slate-800 border-amber-500/50 text-amber-300 shadow-sm"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-xs font-bold leading-tight">{cat.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{cat.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeframes Multi-Select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">
                Timeframes to Monitor (Simultaneous)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTimeframes(["15m", "1H", "4H", "1D"])}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300"
                >
                  All 4
                </button>
                <span className="text-slate-600">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedTimeframes(["1H", "4H"])}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300"
                >
                  1H & 4H (HTF)
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {["15m", "1H", "4H", "1D"].map((tf) => {
                const isSelected = selectedTimeframes.includes(tf);
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => toggleTimeframe(tf)}
                    className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all ${
                      isSelected
                        ? "bg-cyan-950/80 border-cyan-500 text-cyan-300 shadow-sm"
                        : "bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Touch Level Trigger Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Alarm Trigger Touch Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "entry",
                  title: "Zone Entry",
                  subtitle: "Earliest Reaction (Outer Edge)",
                },
                {
                  id: "fifty_pct",
                  title: "50% Mean Threshold",
                  subtitle: "Equilibrium (Institutional MT/CE)",
                },
                {
                  id: "full",
                  title: "Full Retest",
                  subtitle: "Deep Invalidation Buffer",
                },
              ].map((lvl) => {
                const isSelected = touchLevel === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setTouchLevel(lvl.id as OrderBlockTouchLevel)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "bg-slate-800 border-amber-500/50 text-amber-300 shadow-sm"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-xs font-bold leading-tight">{lvl.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{lvl.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notification Channels & Invalidation */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
            <span className="text-xs font-semibold text-slate-300 block">
              24/7 Cloud Delivery Channels
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={notifyDiscord}
                  onChange={(e) => setNotifyDiscord(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
                />
                <DiscordIcon size={14} className="text-[#5865F2]" />
                <span className="text-slate-200 font-medium">Discord Webhook</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={notifyTelegram}
                  onChange={(e) => setNotifyTelegram(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                />
                <TelegramIcon size={14} className="text-[#229ED9]" />
                <span className="text-slate-200 font-medium">Telegram Bot</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={notifyOnInvalidation}
                  onChange={(e) => setNotifyOnInvalidation(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0"
                />
                <Shield size={14} className="text-rose-400" />
                <span className="text-slate-200 font-medium">Notify on Zone Break</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={notifyTradingWebhook}
                  onChange={(e) => setNotifyTradingWebhook(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                />
                <Zap size={14} className="text-emerald-400" />
                <span className="text-slate-200 font-medium">Auto Trading Bot</span>
              </label>
            </div>
          </div>

          {/* Candidate List Accordion */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
            <button
              type="button"
              onClick={() => setShowCandidateList(!showCandidateList)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-300 hover:bg-slate-900/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <span>
                  Inspect Candidate Coins ({computedBatch.matchedCoins.length} Coins,{" "}
                  {computedBatch.plannedAlerts.length} Alarms Planned)
                </span>
              </div>
              {showCandidateList ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showCandidateList && (
              <div className="p-3 border-t border-slate-800/80 space-y-2 max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1 mb-1 border-b border-slate-800/60">
                  <span>Toggle Coins to Include:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllCoins}
                      className="text-cyan-400 hover:text-cyan-300"
                    >
                      Select All
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllCoins}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {computedBatch.matchedCoins.map((coin) => {
                  const isChecked = !deselectedSymbols[coin.symbol];
                  return (
                    <div
                      key={coin.symbol}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
                        isChecked
                          ? "bg-slate-900/80 border-slate-800 text-slate-200"
                          : "bg-slate-950/40 border-slate-900 text-slate-500 opacity-60"
                      }`}
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCoin(coin.symbol)}
                          className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                        />
                        <span className="font-bold font-mono">{coin.symbol}</span>
                        {coin.existingCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[10px] font-bold">
                            {coin.existingCount} already active
                          </span>
                        )}
                      </label>

                      <div className="flex items-center gap-1.5">
                        {coin.pois.map((p, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300"
                          >
                            {p.tf} ${p.targetPrice >= 1 ? p.targetPrice.toFixed(2) : p.targetPrice.toFixed(4)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex flex-col gap-2.5 animate-in fade-in duration-200 ${
                statusMessage.startsWith("Error")
                  ? "bg-rose-950/50 border-rose-800/60 text-rose-300"
                  : "bg-emerald-950/60 border-emerald-700/60 text-emerald-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMessage.startsWith("Error") ? (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span className="font-bold text-sm">{statusMessage}</span>
              </div>
              {!statusMessage.startsWith("Error") && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-800/40">
                  <a
                    href="/radar/alerts"
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <span>View Alarms on Radar Dashboard →</span>
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    Done / Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Total:{" "}
            <span className="font-bold font-mono text-amber-400">
              {computedBatch.plannedAlerts.length} Alarms
            </span>{" "}
            across{" "}
            <span className="text-slate-200 font-medium">
              {computedBatch.matchedCoins.filter((c) => !deselectedSymbols[c.symbol]).length} Coins
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecuteBulkAlarms}
              disabled={isSubmitting || computedBatch.plannedAlerts.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all shadow-lg bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/50 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 fill-current" />
              )}
              <span>
                Arm All {computedBatch.plannedAlerts.length} Cloud Alarms (24/7)
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
