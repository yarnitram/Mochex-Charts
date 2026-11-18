"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Bell, CheckCircle2, Clock, Layers, Loader2, Send, Zap } from "lucide-react";
import { AlertChannelsModal } from "@/components/terminal/AlertChannelsModal";
import { EmaLevelMiniChart } from "@/components/radar/EmaLevelMiniChart";
import { buildMochexChartUrl } from "@/lib/chart/chart-url";
import { AutoEmaSetup, buildAutoEmaAlarm } from "@/lib/alerts/auto-ema-engine";
import { AutoObCategory, getCatalogCategoryCount, ObSearchExchangePreference } from "@/lib/alerts/auto-ob-fvg-engine";
import { PriceAlert } from "@/lib/alerts/alerts-engine";
import { loadClientAlerts, mergeClientAndServerAlerts, saveClientAlerts, syncAlerts } from "@/lib/alerts/alerts-sync";
import { AlertWebhookConfig } from "@/lib/alerts/webhook-dispatcher";
import { loadClientWebhooks, syncWebhooks } from "@/lib/alerts/webhooks-sync";
import { formatEmaPrice, SELECTABLE_EMA_PERIODS } from "@/lib/alerts/ema-alerts";
import type { EmaPeriod } from "@/lib/indicators/mtf-ema/types";
import { SUPPORTED_EXCHANGES } from "@/lib/screener/multi-exchange-client";

const TIMEFRAME_OPTIONS = ["15m", "30m", "1H", "2H", "4H", "1D", "1W"];

function compactUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function setupKey(setup: Pick<AutoEmaSetup, "exchange" | "symbol" | "timeframe" | "period">) {
  return `${setup.exchange}|${setup.symbol}|${setup.timeframe}|${setup.period}`;
}

export default function EmaAlarmScannerPage() {
  const [category, setCategory] = useState<AutoObCategory>("majors");
  const [exchangePreference, setExchangePreference] = useState<ObSearchExchangePreference>("auto");
  const [topLimit, setTopLimit] = useState(25);
  const [timeframes, setTimeframes] = useState<string[]>(["1H"]);
  const [selectedPeriods, setSelectedPeriods] = useState<EmaPeriod[]>([20, 50, 100, 200]);
  const [maxDistancePct, setMaxDistancePct] = useState(5);
  const [autoArm, setAutoArm] = useState(true);
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(0);
  const [setups, setSetups] = useState<AutoEmaSetup[]>([]);
  const [selected, setSelected] = useState<AutoEmaSetup | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [runSummary, setRunSummary] = useState<{ armed: number; duplicates: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [webhookConfig, setWebhookConfig] = useState<AlertWebhookConfig>(loadClientWebhooks);
  const [channelsOpen, setChannelsOpen] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    setAlerts(loadClientAlerts());
    syncAlerts(setAlerts).catch(() => {});
    syncWebhooks().then(setWebhookConfig).catch(() => {});
    const update = () => syncAlerts(setAlerts).catch(() => {});
    window.addEventListener("mochex:alerts-updated", update);
    return () => window.removeEventListener("mochex:alerts-updated", update);
  }, []);

  const armedKeys = useMemo(() => new Set(alerts.filter((alert) => alert.active && alert.emaMetadata)
    .map((alert) => `${alert.exchange || "mexc"}|${alert.symbol}|${alert.emaMetadata?.timeframe}|${alert.emaMetadata?.period}`)), [alerts]);
  const autoAlertCount = useMemo(() => alerts.filter((alert) => alert.active && alert.emaMetadata?.autoArmed).length, [alerts]);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const response = await fetch("/api/radar/ema-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category, exchangePreference, topLimit, timeframes, periods: selectedPeriods, maxDistancePct, autoArm,
          notifyDiscord: webhookConfig.discordEmaWebhookUrl ? webhookConfig.discordEmaEnabled !== false : webhookConfig.discordEnabled !== false,
          notifyTelegram: webhookConfig.telegramEnabled !== false,
          notifyTradingWebhook: Boolean(webhookConfig.tradingWebhook?.enabled),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "EMA scan failed");
      const rows: AutoEmaSetup[] = Array.isArray(data.setups) ? data.setups : [];
      setSetups(rows);
      setSelected((previous) => previous && rows.some((row) => row.id === previous.id) ? previous : rows[0] || null);
      setScannedCount(Number(data.scannedTokensCount) || 0);
      setScannedAt(Number(data.scannedAt) || Date.now());
      setRunSummary({ armed: Number(data.newlyArmedCount) || 0, duplicates: Number(data.skippedDuplicatesCount) || 0 });
      if (Array.isArray(data.newlyArmedAlerts) && data.newlyArmedAlerts.length) {
        const merged = mergeClientAndServerAlerts(loadClientAlerts(), data.newlyArmedAlerts);
        saveClientAlerts(merged);
        setAlerts(merged);
        window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
      } else {
        syncAlerts(setAlerts).catch(() => {});
      }
      showToast(`Scanned ${data.scannedTokensCount || 0} tokens · ${rows.length} EMA levels · ${data.newlyArmedCount || 0} new alarms`);
    } catch (scanError: any) {
      setError(scanError?.message || "Failed to scan EMA levels");
    } finally {
      setScanning(false);
    }
  }, [category, exchangePreference, topLimit, timeframes, selectedPeriods, maxDistancePct, autoArm, webhookConfig]);

  useEffect(() => {
    runScan();
    // Run once on mount, matching the OB+FVG scanner behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefreshMinutes) return;
    const timer = window.setInterval(() => { if (!scanning) runScan(); }, autoRefreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefreshMinutes, scanning, runScan]);

  const toggleTimeframe = (timeframe: string) => setTimeframes((current) => current.includes(timeframe)
    ? current.length > 1 ? current.filter((value) => value !== timeframe) : current
    : [...current, timeframe]);

  const togglePeriod = (period: EmaPeriod) => setSelectedPeriods((current) => current.includes(period)
    ? current.length > 1 ? current.filter((value) => value !== period) : current
    : SELECTABLE_EMA_PERIODS.filter((p) => p === period || current.includes(p)));

  const armOne = async (setup: AutoEmaSetup) => {
    const alert = buildAutoEmaAlarm(setup, {
      notifyDiscord: webhookConfig.discordEmaWebhookUrl ? webhookConfig.discordEmaEnabled !== false : webhookConfig.discordEnabled !== false,
      notifyTelegram: webhookConfig.telegramEnabled !== false,
      notifyTradingWebhook: Boolean(webhookConfig.tradingWebhook?.enabled),
    });
    const response = await fetch("/api/alerts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alerts: [alert] }),
    });
    if (!response.ok) return;
    const merged = mergeClientAndServerAlerts(loadClientAlerts(), [alert]);
    saveClientAlerts(merged);
    setAlerts(merged);
    window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
    showToast(`Armed ${setup.symbol} ${setup.timeframe} EMA ${setup.period} (${setup.exchange.toUpperCase()})`);
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-[#d1d4dc] flex flex-col font-mono selection:bg-[#2962ff]/30">
      <header className="h-14 border-b border-[#1b2535] bg-[#0c1017] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link href="/radar" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#233144] bg-[#121824] text-xs text-[#848e9c] hover:text-white"><ArrowLeft size={13} /> Radar</Link>
          <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/40 flex items-center justify-center text-violet-300"><Activity size={16} /></div>
          <div><div className="text-xs font-bold text-white">AUTO EMA 20 / 50 / 100 / 200 SCANNER</div><div className="text-[10px] text-[#848e9c]">MEXC top volume ranking · Bybit / Binance perpetual monitoring</div></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setChannelsOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] text-xs font-bold text-[#b6c4ff]"><Send size={13} className="text-[#5865F2]" /> Channels</button>
          <Link href="/radar/ema-alarms/logs" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 text-amber-300 font-bold text-xs"><Bell size={13} /> Alarm Set &amp; Logs <span className="px-1.5 rounded-full bg-amber-400 text-slate-950 text-[10px]">{autoAlertCount}</span></Link>
        </div>
      </header>

      {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-[#0e141f] border border-violet-500/50 text-violet-300 text-xs shadow-2xl">{toast}</div>}

      <section className="px-4 sm:px-6 pt-4 max-w-7xl mx-auto w-full">
        <div className="p-4 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#1b2535]">
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-bold">1. Rank by MEXC Futures volume</span><span className="text-[#848e9c]">→</span>
              <span className="px-2 py-1 rounded bg-orange-500/15 border border-orange-500/35 text-orange-300 font-bold">2. Calculate {selectedPeriods.map((p) => `EMA ${p}`).join(" / ")} on Bybit / Binance</span><span className="text-[#848e9c]">→</span>
              <span className="px-2 py-1 rounded bg-violet-500/15 border border-violet-500/35 text-violet-300 font-bold">3. Arm dynamic 24/7 touch alarms</span>
            </div>
            {scannedAt && <div className="text-[10px] text-[#848e9c] flex items-center gap-2"><Clock size={11} /> Scanned {scannedCount} tokens at {new Date(scannedAt).toLocaleTimeString()} {runSummary && <span className="text-amber-300">· New +{runSummary.armed} · Duplicates {runSummary.duplicates}</span>}</div>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="flex flex-col gap-1.5"><label className="text-[10px] uppercase font-bold text-[#848e9c]">MEXC Top Token Category</label><div className="grid grid-cols-2 gap-1.5">{([{ id: "majors", label: `Majors (${getCatalogCategoryCount("majors")})` }, { id: "memes", label: `Top Memes (${getCatalogCategoryCount("memes")})` }, { id: "ai", label: `Top AI (${getCatalogCategoryCount("ai")})` }, { id: "all", label: `All (${getCatalogCategoryCount("all")}+)` }] as const).map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold ${category === item.id ? "bg-[#2962ff]/20 border-[#2962ff] text-white" : "bg-[#121824] border-[#233144] text-[#848e9c]"}`}>{item.label}</button>)}</div></div>

            <div className="flex flex-col gap-1.5"><label className="text-[10px] uppercase font-bold text-[#848e9c]">EMA Source Exchange</label><div className="grid grid-cols-3 gap-1">{([{ id: "auto", label: "Auto" }, { id: "bybit", label: "Bybit" }, { id: "binance", label: "Binance" }] as const).map((item) => <button key={item.id} type="button" onClick={() => setExchangePreference(item.id)} className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold ${exchangePreference === item.id ? "bg-orange-500/20 border-orange-500 text-orange-300" : "bg-[#121824] border-[#233144] text-[#848e9c]"}`}>{item.label}</button>)}</div><div className="flex items-center justify-between text-[10px] text-[#848e9c]">Top volume<select value={topLimit} onChange={(event) => setTopLimit(Number(event.target.value))} className="bg-[#121824] border border-[#233144] rounded px-2 py-1 text-white"><option value={15}>15 tokens</option><option value={25}>25 tokens</option><option value={50}>50 tokens</option><option value={100}>100 tokens</option><option value={150}>150 tokens</option><option value={250}>250 tokens</option><option value={450}>450 tokens</option><option value={600}>600 tokens</option></select></div></div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-[#848e9c]">Timeframes ({timeframes.length})</label>
              <div className="flex flex-wrap gap-1">{TIMEFRAME_OPTIONS.map((timeframe) => <button key={timeframe} type="button" onClick={() => toggleTimeframe(timeframe)} className={`px-2 py-1 rounded border text-[10px] font-bold cursor-pointer ${timeframes.includes(timeframe) ? "bg-violet-500/20 border-violet-400 text-violet-200" : "bg-[#121824] border-[#233144] text-[#848e9c]"}`}>{timeframe}</button>)}</div>
              <div className="flex items-center justify-between text-[10px] text-[#848e9c] pt-0.5">
                <span className="uppercase font-bold">EMAs to Hit ({selectedPeriods.length})</span>
                <span className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setSelectedPeriods([20, 50, 100, 200])} className="hover:text-white underline cursor-pointer">All</button>
                  <button type="button" onClick={() => setSelectedPeriods([20, 50])} className="hover:text-white underline cursor-pointer">20·50</button>
                  <button type="button" onClick={() => setSelectedPeriods([100, 200])} className="hover:text-white underline cursor-pointer">100·200</button>
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {SELECTABLE_EMA_PERIODS.map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => togglePeriod(period)}
                    className={`px-1.5 py-1 rounded border text-[10px] font-bold cursor-pointer ${selectedPeriods.includes(period) ? "bg-amber-500/20 border-amber-400 text-amber-300" : "bg-[#121824] border-[#233144] text-[#848e9c] hover:text-white"}`}
                  >
                    EMA {period}
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-2 text-[10px] text-[#848e9c]">Max price distance<select value={maxDistancePct} onChange={(event) => setMaxDistancePct(Number(event.target.value))} className="bg-[#121824] border border-[#233144] rounded px-2 py-1 text-white"><option value={0.5}>0.5%</option><option value={1}>1%</option><option value={2}>2%</option><option value={5}>5%</option><option value={10}>10%</option><option value={25}>25%</option></select></label>
            </div>

            <div className="flex flex-col justify-between gap-2"><div className="flex flex-col gap-2"><label className="flex items-center gap-2 text-[11px] font-bold text-white"><input type="checkbox" checked={autoArm} onChange={(event) => setAutoArm(event.target.checked)} className="accent-violet-400" /> Auto-set 24/7 EMA touch alarms</label><div className="flex items-center justify-between text-[10px] text-[#848e9c]">Auto-scan loop<select value={autoRefreshMinutes} onChange={(event) => setAutoRefreshMinutes(Number(event.target.value))} className="bg-[#121824] border border-[#233144] rounded px-2 py-1 text-white"><option value={0}>Manual only</option><option value={1}>Every 1 min</option><option value={3}>Every 3 min</option><option value={5}>Every 5 min</option></select></div></div><button type="button" onClick={runScan} disabled={scanning} className="w-full py-2 rounded-lg bg-violet-400 hover:bg-violet-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 disabled:opacity-60">{scanning ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} {scanning ? "Scanning EMA levels…" : autoArm ? "Scan & Auto-Arm EMA Alarms" : "Scan EMA Levels"}</button></div>
          </div>
          {error && <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">{error}</div>}
        </div>
      </section>

      <main className="px-4 sm:px-6 py-4 max-w-7xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <section className="lg:col-span-7 rounded-xl border border-[#1b2535] bg-[#0c1017] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1b2535] flex items-center justify-between"><div className="flex items-center gap-2"><Layers size={14} className="text-violet-300" /><span className="text-xs font-bold text-white">EMA levels near market ({setups.length})</span></div><span className="text-[10px] text-[#848e9c]">Within {maxDistancePct}% · closest levels first</span></div>
          {scanning && !setups.length ? <div className="p-12 flex items-center justify-center gap-2 text-xs text-[#848e9c]"><Loader2 size={20} className="animate-spin text-violet-300" /> Ranking MEXC tokens and calculating EMA levels…</div> : setups.length === 0 ? <div className="p-12 text-center text-xs text-[#848e9c]">No EMA levels found inside the selected distance. Increase the distance or scan more tokens/timeframes.</div> : <div className="max-h-[640px] overflow-auto"><table className="w-full text-left border-collapse text-xs"><thead className="sticky top-0 bg-[#101622] border-b border-[#1b2535] text-[10px] uppercase text-[#848e9c]"><tr><th className="py-2.5 px-3">Coin / Rank</th><th className="py-2.5 px-3">EMA / Exchange</th><th className="py-2.5 px-3">EMA Level</th><th className="py-2.5 px-3 text-right">Distance</th><th className="py-2.5 px-3 text-right">Alarm</th></tr></thead><tbody className="divide-y divide-[#162030]">{setups.map((setup) => { const key = setupKey(setup); const armed = armedKeys.has(key); const isSelected = setup.id === selected?.id; const exchange = SUPPORTED_EXCHANGES[setup.exchange]; return <tr key={setup.id} onClick={() => setSelected(setup)} className={`cursor-pointer ${isSelected ? "bg-violet-500/10" : "hover:bg-[#121824]/70"}`}><td className="py-2.5 px-3"><div className="font-bold text-white">{setup.symbol.replace("USDT", "/USDT")} <span className="text-[9px] text-[#848e9c]">#{setup.mexcRank}</span></div><div className="text-[10px] text-[#848e9c]">MEXC Vol: {compactUsd(setup.mexcVolume24h)}</div></td><td className="py-2.5 px-3"><div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/35 text-violet-200 font-bold">EMA {setup.period}</span><span className="text-white">{setup.timeframe}</span></div><div className={`mt-1 text-[9px] w-fit px-1.5 py-0.5 rounded border ${exchange.badgeBg} ${exchange.badgeText} ${exchange.badgeBorder}`}>{exchange.badgeLabel} · {setup.direction}</div></td><td className="py-2.5 px-3"><div className="font-bold text-amber-300">${formatEmaPrice(setup.emaPrice)}</div><div className="text-[10px] text-[#848e9c]">Price ${formatEmaPrice(setup.currentPrice)}</div></td><td className="py-2.5 px-3 text-right"><div className="font-bold text-white">{setup.distancePct.toFixed(2)}%</div><div className="text-[10px] text-[#848e9c]">{compactUsd(setup.mexcVolume24h)}</div></td><td className="py-2.5 px-3 text-right" onClick={(event) => event.stopPropagation()}>{armed ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-bold"><CheckCircle2 size={11} /> Armed</span> : <button type="button" onClick={() => armOne(setup)} className="px-2 py-1 rounded bg-[#2962ff]/20 border border-[#2962ff]/40 text-[#8eaaff] text-[10px] font-bold">+ Arm</button>}</td></tr>; })}</tbody></table></div>}
        </section>

        <aside className="lg:col-span-5 flex flex-col gap-3 sticky top-18">{selected ? <><EmaLevelMiniChart symbol={selected.symbol} timeframe={selected.timeframe} exchange={selected.exchange} period={selected.period} emaPrice={selected.emaPrice} height={340} /><div className="p-4 rounded-xl border border-[#1b2535] bg-[#0c1017] flex flex-col gap-2"><div className="flex items-center justify-between"><div className="text-xs font-bold text-white">EMA Level Telemetry</div><div className="flex items-center gap-3"><Link href={buildMochexChartUrl({ symbol: selected.symbol, timeframe: selected.timeframe, exchange: selected.exchange, indicator: "ema", targetPrice: selected.emaPrice })} className="text-[10px] text-[#8eaaff] hover:underline">Open Full Chart ↗</Link><Link href="/radar/ema-alarms/logs" className="text-[10px] text-amber-300">Alarm Set &amp; Logs</Link></div></div><div className="grid grid-cols-2 gap-2 text-[11px]"><div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]"><div className="text-[10px] text-[#848e9c]">Monitoring Exchange</div><div className="font-bold text-white mt-0.5">{SUPPORTED_EXCHANGES[selected.exchange]?.name}</div></div><div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]"><div className="text-[10px] text-[#848e9c]">MEXC Volume Rank</div><div className="font-bold text-emerald-300 mt-0.5">#{selected.mexcRank} · {compactUsd(selected.mexcVolume24h)}</div></div><div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]"><div className="text-[10px] text-[#848e9c]">Selected EMA</div><div className="font-bold text-violet-200 mt-0.5">EMA {selected.period} · {selected.timeframe}</div></div><div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]"><div className="text-[10px] text-[#848e9c]">Touch Target</div><div className="font-bold text-amber-300 mt-0.5">${formatEmaPrice(selected.emaPrice)} · {selected.direction}</div></div></div></div></> : <div className="p-10 rounded-xl border border-[#1b2535] bg-[#0c1017] text-center text-xs text-[#848e9c]">Select an EMA level to inspect its live exchange chart.</div>}</aside>
      </main>

      <AlertChannelsModal isOpen={channelsOpen} onClose={() => setChannelsOpen(false)} config={webhookConfig} onSave={setWebhookConfig} />
    </div>
  );
}
