"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Loader2,
  Play,
  Radar,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  AutoObCategory,
  AutoObFvgSetup,
  AutoObTouchMode,
  buildAutoObFvgAlarm,
  getCatalogCategoryCount,
  ObSearchExchangePreference,
} from "@/lib/alerts/auto-ob-fvg-engine";
import { PriceAlert } from "@/lib/alerts/alerts-engine";
import {
  loadClientAlerts,
  mergeClientAndServerAlerts,
  saveClientAlerts,
  syncAlerts,
} from "@/lib/alerts/alerts-sync";
import { loadClientWebhooks, syncWebhooks } from "@/lib/alerts/webhooks-sync";
import { AlertWebhookConfig } from "@/lib/alerts/webhook-dispatcher";
import { AlertChannelsModal } from "@/components/terminal/AlertChannelsModal";
import { ObZoneMiniChart } from "@/components/radar/ObZoneMiniChart";
import { formatPoiPrice } from "@/lib/indicators/radar-poi-engine";
import { SUPPORTED_EXCHANGES } from "@/lib/screener/multi-exchange-client";

const TIMEFRAME_OPTIONS = ["15m", "30m", "1H", "2H", "4H", "1D", "1W"];

function formatCompactUsd(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return "—";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export default function AutoObFvgMonitorPage() {
  // 1. Scanner Config State
  const [category, setCategory] = useState<AutoObCategory>("majors");
  const [topLimit, setTopLimit] = useState<number>(25);
  const [exchangePreference, setExchangePreference] =
    useState<ObSearchExchangePreference>("auto");
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>([
    "15m",
    "1H",
    "4H",
  ]);
  const [touchMode, setTouchMode] = useState<AutoObTouchMode>("entry");
  const [obZoneType, setObZoneType] = useState<"full" | "body">("full");
  const [autoArm, setAutoArm] = useState<boolean>(true);
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState<number>(0);

  // 2. Results & Alerts State
  const [scanning, setScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [setups, setSetups] = useState<AutoObFvgSetup[]>([]);
  const [selectedSetup, setSelectedSetup] = useState<AutoObFvgSetup | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<{
    newlyArmedCount: number;
    skippedDuplicatesCount: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [webhookConfig, setWebhookConfig] = useState<AlertWebhookConfig>(
    loadClientWebhooks
  );
  const [isChannelsModalOpen, setIsChannelsModalOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  useEffect(() => {
    setAlerts(loadClientAlerts());
    syncAlerts(setAlerts).catch(() => {});
    syncWebhooks().then(setWebhookConfig).catch(() => {});

    const handleUpdated = () => {
      syncAlerts(setAlerts).catch(() => {});
    };
    window.addEventListener("mochex:alerts-updated", handleUpdated);
    return () => window.removeEventListener("mochex:alerts-updated", handleUpdated);
  }, []);

  const armedPoiIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of alerts) {
      if (a.active && a.poiMetadata?.poiId) {
        ids.add(a.poiMetadata.poiId);
      }
    }
    return ids;
  }, [alerts]);

  const obFvgAlertCount = useMemo(
    () =>
      alerts.filter(
        (a) =>
          a.active &&
          a.poiMetadata?.category === "order_block" &&
          (a.poiMetadata.autoArmed || a.poiMetadata.pattern)
      ).length,
    [alerts]
  );

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes((prev) =>
      prev.includes(tf)
        ? prev.length > 1
          ? prev.filter((t) => t !== tf)
          : prev
        : [...prev, tf]
    );
  };

  const runScan = useCallback(async () => {
    setScanning(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/radar/ob-fvg-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          topLimit,
          exchangePreference,
          timeframes: selectedTimeframes,
          autoArm,
          touchMode,
          obZoneType,
          notifyDiscord: webhookConfig.discordEnabled !== false,
          notifyTelegram: webhookConfig.telegramEnabled !== false,
          notifyTradingWebhook: Boolean(webhookConfig.tradingWebhook?.enabled),
          notifyOnInvalidation: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Scan failed");
      }

      const found: AutoObFvgSetup[] = Array.isArray(data.setups) ? data.setups : [];
      setSetups(found);
      setScannedCount(Number(data.scannedTokensCount) || 0);
      setLastScannedAt(data.scannedAt || Date.now());
      setLastRunSummary({
        newlyArmedCount: Number(data.newlyArmedCount) || 0,
        skippedDuplicatesCount: Number(data.skippedDuplicatesCount) || 0,
      });

      if (found.length > 0) {
        setSelectedSetup((prev) =>
          prev && found.some((s) => s.id === prev.id) ? prev : found[0]
        );
      } else {
        setSelectedSetup(null);
      }

      if (Array.isArray(data.newlyArmedAlerts) && data.newlyArmedAlerts.length > 0) {
        const merged = mergeClientAndServerAlerts(
          loadClientAlerts(),
          data.newlyArmedAlerts
        );
        saveClientAlerts(merged);
        setAlerts(merged);
        window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
        showToast(
          `Detected ${found.length} unmitigated OB+FVG setups • Auto-armed ${data.newlyArmedAlerts.length} alarm(s)!`
        );
      } else {
        showToast(
          `Scanned ${data.scannedTokensCount || 0} top MEXC tokens • Found ${found.length} unmitigated OB+FVG setup(s)`
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to scan tokens");
    } finally {
      setScanning(false);
    }
  }, [
    category,
    topLimit,
    exchangePreference,
    selectedTimeframes,
    autoArm,
    touchMode,
    obZoneType,
    webhookConfig,
  ]);

  // Initial scan on mount
  useEffect(() => {
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional periodic auto-scan loop
  useEffect(() => {
    if (!autoRefreshMinutes || autoRefreshMinutes <= 0) return;
    const ms = autoRefreshMinutes * 60_000;
    const tid = setInterval(() => {
      if (!scanning) {
        runScan();
      }
    }, ms);
    return () => clearInterval(tid);
  }, [autoRefreshMinutes, scanning, runScan]);

  const handleManualArmSingle = async (setup: AutoObFvgSetup) => {
    const newAlert = buildAutoObFvgAlarm(setup, {
      touchMode,
      notifyDiscord: webhookConfig.discordEnabled !== false,
      notifyTelegram: webhookConfig.telegramEnabled !== false,
      notifyTradingWebhook: Boolean(webhookConfig.tradingWebhook?.enabled),
      notifyOnInvalidation: true,
    });
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alerts: [newAlert] }),
    });
    if (res.ok) {
      const merged = mergeClientAndServerAlerts(loadClientAlerts(), [newAlert]);
      saveClientAlerts(merged);
      setAlerts(merged);
      window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
      showToast(
        `Armed ${setup.symbol} (${setup.timeframe} ${setup.exchange.toUpperCase()}) OB+FVG alarm`
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-[#d1d4dc] flex flex-col font-mono selection:bg-[#2962ff]/30">
      {/* HEADER */}
      <header className="h-14 border-b border-[#1b2535] bg-[#0c1017] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link
            href="/radar"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Radar</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#00c087]/15 border border-[#00c087]/40 flex items-center justify-center text-[#00c087]">
              <ShieldCheck size={17} />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>AUTO OB + FVG VALIDATOR</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
                  0% HIT ONLY
                </span>
              </div>
              <div className="text-[10px] text-[#848e9c]">
                Top MEXC Category Discovery • Bybit / Binance Detection &amp; Auto-Alarm
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsChannelsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs font-bold text-[#b6c4ff] cursor-pointer"
          >
            <Send size={13} className="text-[#5865F2]" />
            <span className="hidden sm:inline">Channels</span>
            <span className="text-[10px] text-[#848e9c]">
              {webhookConfig.discordEnabled ? "DC✓" : ""}{" "}
              {webhookConfig.telegramEnabled ? "TG✓" : ""}
            </span>
          </button>

          <Link
            href="/radar/ob-fvg-alerts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black font-bold text-xs transition-all"
          >
            <Bell size={13} className="fill-current" />
            <span>Alarm Set &amp; Logs</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">
              {obFvgAlertCount}
            </span>
          </Link>
        </div>
      </header>

      {/* TOAST */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-[#0e141f] border border-[#00c087]/50 text-[#00c087] text-xs shadow-2xl flex items-center gap-2">
          <Sparkles size={14} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* PIPELINE WORKFLOW & CONTROLS */}
      <section className="px-4 sm:px-6 pt-4 max-w-7xl mx-auto w-full flex flex-col gap-3">
        <div className="p-4 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col gap-4">
          {/* Workflow Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#1b2535]">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-bold">
                1. Top Tokens: MEXC Futures (3 Categories)
              </span>
              <span className="text-[#848e9c]">→</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300 font-bold">
                2. OB+FVG Search &amp; Checking:{" "}
                {exchangePreference === "auto"
                  ? "Bybit / Binance"
                  : exchangePreference === "bybit"
                  ? "Bybit Perps"
                  : "Binance Perps"}
              </span>
              <span className="text-[#848e9c]">→</span>
              <span className="px-2 py-0.5 rounded bg-[#2962ff]/15 border border-[#2962ff]/35 text-[#8eaaff] font-bold">
                3. Strict 0% Unmitigated Auto-Alarm
              </span>
            </div>

            {lastScannedAt && (
              <div className="text-[10px] text-[#848e9c] flex items-center gap-2">
                <Clock size={11} />
                <span>
                  Scanned {scannedCount} MEXC tokens at{" "}
                  {new Date(lastScannedAt).toLocaleTimeString()}
                </span>
                {lastRunSummary && (
                  <span className="text-amber-300 font-bold">
                    • Armed: +{lastRunSummary.newlyArmedCount} (Dup skipped:{" "}
                    {lastRunSummary.skippedDuplicatesCount})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. Category Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-[#848e9c]">
                MEXC Top Token Category
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: "majors", label: `Majors (${getCatalogCategoryCount("majors")})` },
                    { id: "memes", label: `Top Memes (${getCatalogCategoryCount("memes")})` },
                    { id: "ai", label: `Top AI (${getCatalogCategoryCount("ai")})` },
                    { id: "all", label: `All 3 Cat. (${getCatalogCategoryCount("all")}+)` },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                      category === c.id
                        ? "bg-[#2962ff]/20 border-[#2962ff] text-white"
                        : "bg-[#121824] border-[#233144] text-[#848e9c] hover:text-white"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Checking Exchange & Top Count */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-[#848e9c]">
                OB Detection &amp; Alarm Exchange
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: "auto", label: "Auto (Bybit/Bin)" },
                    { id: "bybit", label: "Bybit Only" },
                    { id: "binance", label: "Binance Only" },
                  ] as const
                ).map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setExchangePreference(ex.id)}
                    className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold cursor-pointer transition-colors ${
                      exchangePreference === ex.id
                        ? "bg-orange-500/20 border-orange-500 text-orange-300"
                        : "bg-[#121824] border-[#233144] text-[#848e9c] hover:text-white"
                    }`}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[10px] text-[#848e9c]">MEXC Top Volume:</span>
                <select
                  value={topLimit}
                  onChange={(e) => setTopLimit(Number(e.target.value))}
                  className="bg-[#121824] border border-[#233144] rounded px-2 py-1 text-[11px] text-white font-bold outline-none cursor-pointer"
                >
                  <option value={15}>Top 15 Tokens</option>
                  <option value={25}>Top 25 Tokens</option>
                  <option value={50}>Top 50 Tokens</option>
                  <option value={100}>Top 100 Tokens</option>
                  <option value={150}>Top 150 Tokens (Full Category)</option>
                  <option value={250}>Top 250 Tokens</option>
                  <option value={350}>Top 350 Tokens</option>
                  <option value={450}>Top 450 Tokens (All 3 Cat.)</option>
                  <option value={600}>Top 600 (+ Live MEXC Perps)</option>
                </select>
              </div>
              {category !== "all" && topLimit > getCatalogCategoryCount(category) && (
                <div className="text-[10px] text-amber-300/90 flex items-center justify-between gap-1">
                  <span>
                    This category has {getCatalogCategoryCount(category)} tokens.
                  </span>
                  <button
                    type="button"
                    onClick={() => setCategory("all")}
                    className="underline font-bold hover:text-white cursor-pointer shrink-0"
                  >
                    Use All 3 Cat.
                  </button>
                </div>
              )}
            </div>

            {/* 3. Timeframes & Zone Rules */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-[#848e9c]">
                Timeframes ({selectedTimeframes.length} selected)
              </label>
              <div className="flex flex-wrap gap-1">
                {TIMEFRAME_OPTIONS.map((tf) => {
                  const active = selectedTimeframes.includes(tf);
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => toggleTimeframe(tf)}
                      className={`px-2 py-1 rounded border text-[10px] font-bold cursor-pointer ${
                        active
                          ? "bg-[#00c087]/20 border-[#00c087] text-[#00c087]"
                          : "bg-[#121824] border-[#233144] text-[#848e9c] hover:text-white"
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <select
                  value={obZoneType}
                  onChange={(e) => setObZoneType(e.target.value as "full" | "body")}
                  className="bg-[#121824] border border-[#233144] rounded px-2 py-1 text-[10px] text-white outline-none cursor-pointer"
                >
                  <option value="full">OB: Full Candle</option>
                  <option value="body">OB: Body Only</option>
                </select>
                <select
                  value={touchMode}
                  onChange={(e) => setTouchMode(e.target.value as AutoObTouchMode)}
                  className="bg-[#121824] border border-[#233144] rounded px-2 py-1 text-[10px] text-white outline-none cursor-pointer"
                >
                  <option value="entry">Trigger: First Touch (OB Edge)</option>
                  <option value="fifty_pct">Trigger: 50% Mean Threshold</option>
                </select>
              </div>
            </div>

            {/* 4. Auto-Arm & Execute */}
            <div className="flex flex-col justify-between gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-white">
                  <input
                    type="checkbox"
                    checked={autoArm}
                    onChange={(e) => setAutoArm(e.target.checked)}
                    className="accent-[#00c087] rounded cursor-pointer"
                  />
                  <span>Auto-Set 24/7 Alarms on Unmitigated OBs</span>
                </label>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[#848e9c]">Auto-Scan Loop:</span>
                  <select
                    value={autoRefreshMinutes}
                    onChange={(e) => setAutoRefreshMinutes(Number(e.target.value))}
                    className="bg-[#121824] border border-[#233144] rounded px-2 py-1 text-[10px] text-white outline-none cursor-pointer"
                  >
                    <option value={0}>Manual Only</option>
                    <option value={1}>Every 1 min</option>
                    <option value={3}>Every 3 mins</option>
                    <option value={5}>Every 5 mins</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={runScan}
                disabled={scanning}
                className="w-full py-2 px-3 rounded-lg bg-[#00c087] hover:bg-[#00a875] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#00c087]/20 cursor-pointer disabled:opacity-60 transition-all"
              >
                {scanning ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Zap size={14} className="fill-current" />
                )}
                <span>
                  {scanning
                    ? "Scanning MEXC → Bybit/Binance..."
                    : autoArm
                    ? "Scan & Auto-Arm Unmitigated OBs"
                    : "Scan Unmitigated OBs"}
                </span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}
        </div>
      </section>

      {/* MAIN MASTER-DETAIL AREA */}
      <main className="px-4 sm:px-6 py-4 max-w-7xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Detected Unmitigated OB+FVG Setups Table */}
        <div className="lg:col-span-7 rounded-xl border border-[#1b2535] bg-[#0c1017] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#1b2535] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-[#00c087]" />
              <span className="text-xs font-bold text-white">
                Unmitigated Validated OB + FVG ({setups.length})
              </span>
            </div>
            <span className="text-[10px] text-[#848e9c]">
              0% hit strictly enforced • Click row to inspect chart
            </span>
          </div>

          {scanning && setups.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center gap-2 text-xs text-[#848e9c]">
              <Loader2 size={24} className="animate-spin text-[#00c087]" />
              <span>
                Ranking top MEXC tokens &amp; checking Bybit / Binance for unmitigated 3-candle RGG/GRR OBs...
              </span>
            </div>
          ) : setups.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#848e9c]">
              No strictly unmitigated (0% hit) RGG/GRR OB+FVG setups found for the selected filters. Try expanding Top Tokens or adding timeframes.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#101622] border-b border-[#1b2535] text-[10px] uppercase text-[#848e9c] font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Coin (MEXC Rank)</th>
                    <th className="py-2.5 px-3">OB Pattern &amp; Exchange</th>
                    <th className="py-2.5 px-3">OB Price Range</th>
                    <th className="py-2.5 px-3 text-right">Dist %</th>
                    <th className="py-2.5 px-3 text-right">Alarm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#162030]">
                  {setups.map((setup) => {
                    const isBull = setup.type === "BULLISH";
                    const isArmed = armedPoiIds.has(setup.id);
                    const isSelected = selectedSetup?.id === setup.id;
                    const exCfg = SUPPORTED_EXCHANGES[setup.exchange];

                    return (
                      <tr
                        key={setup.id}
                        onClick={() => setSelectedSetup(setup)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#2962ff]/15"
                            : "hover:bg-[#121824]/70"
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white">
                                {setup.symbol.replace("USDT", "/USDT")}
                              </span>
                              <span className="text-[9px] px-1 rounded bg-[#121824] border border-[#233144] text-[#848e9c]">
                                #{setup.mexcRank}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#848e9c]">
                              MEXC Vol: {formatCompactUsd(setup.mexcVolume24h)}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                                  isBull
                                    ? "bg-[#00c087]/15 text-[#00c087] border-[#00c087]/35"
                                    : "bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/35"
                                }`}
                              >
                                {setup.pattern} {setup.type}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#121824] border border-[#233144] text-white font-bold">
                                {setup.timeframe}
                              </span>
                            </div>
                            <span
                              className={`text-[9px] w-fit px-1.5 py-0.2 rounded border font-bold ${exCfg.badgeBg} ${exCfg.badgeText} ${exCfg.badgeBorder}`}
                            >
                              {exCfg.badgeLabel}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-white">
                              ${formatPoiPrice(setup.bottom)} - ${formatPoiPrice(setup.top)}
                            </span>
                            <span className="text-[10px] text-[#848e9c]">
                              Width {setup.spreadPct.toFixed(2)}% • FVG +{setup.fvgGapPct.toFixed(2)}%
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="font-bold text-white">
                            {setup.distanceToEntryPct.toFixed(2)}%
                          </div>
                          <div className="text-[10px] text-[#848e9c]">
                            @${formatPoiPrice(setup.currentPrice)}
                          </div>
                        </td>

                        <td
                          className="py-2.5 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isArmed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-bold">
                              <CheckCircle2 size={11} />
                              Armed
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleManualArmSingle(setup)}
                              className="px-2 py-1 rounded bg-[#2962ff]/20 hover:bg-[#2962ff] border border-[#2962ff]/40 text-[#8eaaff] hover:text-white text-[10px] font-bold cursor-pointer"
                            >
                              + Arm
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Selected Setup Chart + OB Details */}
        <div className="lg:col-span-5 flex flex-col gap-3 sticky top-18">
          {selectedSetup ? (
            <>
              <ObZoneMiniChart
                symbol={selectedSetup.symbol}
                timeframe={selectedSetup.timeframe}
                exchange={selectedSetup.exchange}
                zoneTop={selectedSetup.top}
                zoneBottom={selectedSetup.bottom}
                direction={selectedSetup.type}
                targetPrice={
                  touchMode === "fifty_pct"
                    ? selectedSetup.meanThreshold
                    : selectedSetup.entryPrice
                }
                invalidationPrice={selectedSetup.fullRetestPrice}
                fvgTop={selectedSetup.fvgTop}
                fvgBottom={selectedSetup.fvgBottom}
                pattern={selectedSetup.pattern}
                height={330}
              />

              <div className="p-4 rounded-xl border border-[#1b2535] bg-[#0c1017] flex flex-col gap-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    OB + FVG Zone Telemetry
                  </span>
                  <Link
                    href="/radar/ob-fvg-alerts"
                    className="text-[11px] text-amber-300 hover:underline flex items-center gap-1"
                  >
                    <span>Open Alarm Set &amp; Logs</span>
                    <ExternalLink size={11} />
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]">
                    <div className="text-[10px] text-[#848e9c]">Checking Exchange</div>
                    <div className="font-bold text-white mt-0.5">
                      {SUPPORTED_EXCHANGES[selectedSetup.exchange]?.name}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]">
                    <div className="text-[10px] text-[#848e9c]">MEXC Top Volume</div>
                    <div className="font-bold text-emerald-300 mt-0.5">
                      Rank #{selectedSetup.mexcRank} ({formatCompactUsd(selectedSetup.mexcVolume24h)})
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]">
                    <div className="text-[10px] text-[#848e9c]">OB Range (Bottom — Top)</div>
                    <div className="font-bold text-white mt-0.5">
                      ${formatPoiPrice(selectedSetup.bottom)} — ${formatPoiPrice(selectedSetup.top)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]">
                    <div className="text-[10px] text-[#848e9c]">FVG Gap Range</div>
                    <div className="font-bold text-sky-300 mt-0.5">
                      ${formatPoiPrice(selectedSetup.fvgBottom)} — ${formatPoiPrice(selectedSetup.fvgTop)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-10 rounded-xl border border-[#1b2535] bg-[#0c1017] text-center text-xs text-[#848e9c]">
              Select any detected unmitigated OB+FVG setup on the left to inspect its live Bybit/Binance chart and exact OB range.
            </div>
          )}
        </div>
      </main>

      <AlertChannelsModal
        isOpen={isChannelsModalOpen}
        onClose={() => setIsChannelsModalOpen(false)}
        config={webhookConfig}
        onSave={(cfg) => setWebhookConfig(cfg)}
      />
    </div>
  );
}
