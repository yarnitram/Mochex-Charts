"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, CheckCircle2, Clock, Pause, Play, RefreshCw, ScrollText, Search, Send, Trash2, XCircle } from "lucide-react";
import { AlertChannelsModal } from "@/components/terminal/AlertChannelsModal";
import { EmaLevelMiniChart } from "@/components/radar/EmaLevelMiniChart";
import { AlertLogEntry, ChannelDeliveryResult, PriceAlert } from "@/lib/alerts/alerts-engine";
import { loadClientAlerts, recordDeletedAlertIds, saveClientAlerts, syncAlerts } from "@/lib/alerts/alerts-sync";
import { AlertWebhookConfig } from "@/lib/alerts/webhook-dispatcher";
import { loadClientWebhooks, syncWebhooks } from "@/lib/alerts/webhooks-sync";
import { formatEmaPrice } from "@/lib/alerts/ema-alerts";
import { SupportedExchange, SUPPORTED_EXCHANGES } from "@/lib/screener/multi-exchange-client";

type EmaItem = PriceAlert | AlertLogEntry;
type Tab = "alarms" | "logs";

function DeliveryPill({ name, result }: { name: string; result?: ChannelDeliveryResult }) {
  if (!result) return <span className="px-1.5 py-0.5 rounded bg-[#121824] border border-[#233144] text-[9px] text-[#848e9c]">{name}: N/A</span>;
  if (result.ok) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-[9px] text-emerald-300"><CheckCircle2 size={9} />{name}: Sent</span>;
  if (result.skipped) return <span title={result.skippedReason} className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-[9px] text-amber-300">{name}: Skipped</span>;
  return <span title={result.error} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-[9px] text-rose-300"><XCircle size={9} />{name}: Failed</span>;
}

function isAutoEma(item: { emaMetadata?: PriceAlert["emaMetadata"] }): boolean {
  return Boolean(item.emaMetadata?.autoArmed && [20, 50, 100, 200].includes(item.emaMetadata.period || 0));
}

export default function EmaAlarmSetLogsPage() {
  const [tab, setTab] = useState<Tab>("alarms");
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [logs, setLogs] = useState<AlertLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [exchangeFilter, setExchangeFilter] = useState<"ALL" | SupportedExchange>("ALL");
  const [periodFilter, setPeriodFilter] = useState<"ALL" | "20" | "50" | "100" | "200">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [webhookConfig, setWebhookConfig] = useState<AlertWebhookConfig>(loadClientWebhooks);
  const [channelsOpen, setChannelsOpen] = useState(false);

  const fetchAll = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      await syncAlerts(setAlerts);
      const response = await fetch("/api/alerts/logs?limit=250", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.logs)) setLogs(data.logs);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    setAlerts(loadClientAlerts());
    fetchAll();
    syncWebhooks().then(setWebhookConfig).catch(() => {});
    const refresh = () => fetchAll(true);
    window.addEventListener("mochex:alerts-updated", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => fetchAll(true), 15_000);
    return () => {
      window.removeEventListener("mochex:alerts-updated", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [fetchAll]);

  const scopedAlerts = useMemo(() => alerts.filter(isAutoEma).filter((item) => {
    if (exchangeFilter !== "ALL" && (item.exchange || "mexc") !== exchangeFilter) return false;
    if (periodFilter !== "ALL" && String(item.emaMetadata?.period || "") !== periodFilter) return false;
    const q = query.trim().toLowerCase();
    return !q || item.symbol.toLowerCase().includes(q) || item.label.toLowerCase().includes(q);
  }), [alerts, exchangeFilter, periodFilter, query]);
  const scopedLogs = useMemo(() => logs.filter(isAutoEma).filter((item) => {
    if (exchangeFilter !== "ALL" && (item.exchange || "mexc") !== exchangeFilter) return false;
    if (periodFilter !== "ALL" && String(item.emaMetadata?.period || "") !== periodFilter) return false;
    const q = query.trim().toLowerCase();
    return !q || item.symbol.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || (item.message || "").toLowerCase().includes(q);
  }), [logs, exchangeFilter, periodFilter, query]);
  const selected: EmaItem | undefined = tab === "alarms"
    ? scopedAlerts.find((item) => item.id === selectedId) || scopedAlerts[0]
    : scopedLogs.find((item) => item.id === selectedId) || scopedLogs[0];

  const toggleActive = async (alert: PriceAlert) => {
    const active = !alert.active;
    const updated = alerts.map((item) => item.id === alert.id ? { ...item, active } : item);
    setAlerts(updated);
    saveClientAlerts(updated);
    await fetch("/api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [alert.id], updates: { active } }) }).catch(() => {});
  };

  const deleteAlert = async (alert: PriceAlert) => {
    recordDeletedAlertIds([alert.id]);
    const remaining = alerts.filter((item) => item.id !== alert.id);
    setAlerts(remaining);
    saveClientAlerts(remaining);
    await fetch("/api/alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [alert.id] }) }).catch(() => {});
    window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
  };

  const clearLogs = async () => {
    if (!window.confirm("Clear all server trigger and delivery logs?")) return;
    const response = await fetch("/api/alerts/logs", { method: "DELETE" });
    if (response.ok) setLogs([]);
  };

  const exchange = (selected?.exchange || "mexc") as SupportedExchange;
  const period = selected?.emaMetadata?.period as 20 | 50 | 100 | 200 | undefined;

  return (
    <div className="min-h-screen bg-[#080b11] text-[#d1d4dc] flex flex-col font-mono selection:bg-[#2962ff]/30">
      <header className="h-14 border-b border-[#1b2535] bg-[#0c1017] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link href="/radar/ema-alarms" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#233144] bg-[#121824] text-xs text-[#848e9c] hover:text-white"><ArrowLeft size={13} /> EMA Scanner</Link>
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400"><Bell size={16} /></div>
          <div><div className="text-xs font-bold text-white">EMA ALARM SET &amp; DELIVERY LOGS</div><div className="text-[10px] text-[#848e9c]">24/7 EMA touch alarms · live chart inspection · Discord / Telegram delivery status</div></div>
        </div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => setChannelsOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] text-xs font-bold text-[#b6c4ff]"><Send size={13} className="text-[#5865F2]" /> Channels</button><Link href="/radar/ema-alarms" className="px-3 py-1.5 rounded-lg border border-violet-500/40 bg-violet-500/15 text-violet-200 text-xs font-bold">Auto Scanner</Link><button type="button" onClick={() => fetchAll(true)} className="p-2 rounded-lg border border-[#233144] bg-[#121824] text-[#848e9c]"><RefreshCw size={13} className={refreshing ? "animate-spin text-violet-300" : ""} /></button></div>
      </header>

      <section className="px-4 sm:px-6 pt-4 max-w-7xl mx-auto w-full flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0c1017] border border-[#1b2535]"><button type="button" onClick={() => { setTab("alarms"); setSelectedId(null); }} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 ${tab === "alarms" ? "bg-amber-400 text-slate-950" : "text-[#848e9c]"}`}><Bell size={13} /> Alarm Set ({scopedAlerts.length})</button><button type="button" onClick={() => { setTab("logs"); setSelectedId(null); }} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 ${tab === "logs" ? "bg-[#2962ff] text-white" : "text-[#848e9c]"}`}><ScrollText size={13} /> Trigger &amp; Delivery Logs ({scopedLogs.length})</button></div>
        <div className="flex flex-wrap items-center gap-2"><div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#848e9c]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbol…" className="bg-[#0c1017] border border-[#233144] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white" /></div><select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as typeof periodFilter)} className="bg-[#0c1017] border border-[#233144] rounded-lg px-2.5 py-1.5 text-xs text-white"><option value="ALL">All EMAs</option><option value="20">EMA 20</option><option value="50">EMA 50</option><option value="100">EMA 100</option><option value="200">EMA 200</option></select><select value={exchangeFilter} onChange={(event) => setExchangeFilter(event.target.value as typeof exchangeFilter)} className="bg-[#0c1017] border border-[#233144] rounded-lg px-2.5 py-1.5 text-xs text-white"><option value="ALL">All exchanges</option><option value="bybit">Bybit Perps</option><option value="binance">Binance Perps</option><option value="mexc">MEXC Perps</option></select>{tab === "logs" && logs.length > 0 && <button type="button" onClick={clearLogs} className="px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs font-bold">Clear Logs</button>}</div>
      </section>

      <main className="px-4 sm:px-6 py-4 max-w-7xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <section className="lg:col-span-7 rounded-xl border border-[#1b2535] bg-[#0c1017] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1b2535] flex justify-between items-center"><span className="text-xs font-bold text-white">{tab === "alarms" ? "Auto EMA alarms" : "EMA trigger & delivery history"}</span><span className="text-[10px] text-[#848e9c]">EMA 20 · 50 · 100 · 200</span></div>
          {loading ? <div className="p-12 text-center text-xs text-[#848e9c]">Loading alarm records…</div> : tab === "alarms" && scopedAlerts.length === 0 ? <div className="p-12 text-center text-xs text-[#848e9c]">No auto EMA alarms. Run the scanner and enable auto-arming to create alarms.</div> : tab === "logs" && scopedLogs.length === 0 ? <div className="p-12 text-center text-xs text-[#848e9c]">No EMA trigger or delivery logs recorded yet.</div> : <div className="divide-y divide-[#162030] max-h-[720px] overflow-y-auto">{tab === "alarms" ? scopedAlerts.map((alert) => { const ex = (alert.exchange || "mexc") as SupportedExchange; const cfg = SUPPORTED_EXCHANGES[ex]; const active = selected?.id === alert.id; return <div key={alert.id} onClick={() => setSelectedId(alert.id)} className={`p-3.5 cursor-pointer flex flex-col gap-2 ${active ? "bg-violet-500/10" : "hover:bg-[#121824]/60"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><strong className="text-sm text-white">{alert.symbol.replace("USDT", "/USDT")}</strong><span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>{cfg.badgeLabel}</span><span className="px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/35 text-[10px] font-bold text-violet-200">EMA {alert.emaMetadata?.period} · {alert.emaMetadata?.timeframe}</span></div><div className="flex gap-1.5" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => toggleActive(alert)} className="p-1.5 rounded bg-[#121824] border border-[#233144] text-[#848e9c]">{alert.active ? <Pause size={12} /> : <Play size={12} />}</button><button type="button" onClick={() => deleteAlert(alert)} className="p-1.5 rounded bg-[#121824] border border-[#233144] text-[#848e9c] hover:text-rose-300"><Trash2 size={12} /></button></div></div><div className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className="text-[#b6c4ff]">{alert.emaMetadata?.direction || (alert.condition === "crossing_down" ? "SUPPORT" : "RESISTANCE")}</span><span className="text-amber-300 font-bold">Dynamic target: ${formatEmaPrice(alert.targetPrice)}</span><span className={`text-[10px] ${alert.active ? "text-emerald-300" : "text-[#848e9c]"}`}>{alert.active ? "Monitoring 24/7" : "Paused / triggered"}</span></div></div>; }) : scopedLogs.map((log) => { const ex = (log.exchange || "mexc") as SupportedExchange; const cfg = SUPPORTED_EXCHANGES[ex]; const active = selected?.id === log.id; return <div key={log.id} onClick={() => setSelectedId(log.id)} className={`p-3.5 cursor-pointer flex flex-col gap-2 ${active ? "bg-violet-500/10" : "hover:bg-[#121824]/60"}`}><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><strong className="text-sm text-white">{log.symbol.replace("USDT", "/USDT")}</strong><span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>{cfg.badgeLabel}</span><span className="px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/35 text-[10px] font-bold text-violet-200">EMA {log.emaMetadata?.period} · {log.emaMetadata?.timeframe}</span></div><span className="flex items-center gap-1 text-[10px] text-[#848e9c]"><Clock size={11} />{new Date(log.triggeredAt).toLocaleString()}</span></div><div className="text-[11px] text-[#d1d4dc]">{log.label}</div>{log.message && <div className="text-[10px] text-[#848e9c]">{log.message}</div>}<div className="flex items-center justify-between gap-2 text-[10px]"><span>Hit <strong className="text-white">${formatEmaPrice(log.triggerPrice)}</strong> · Target ${formatEmaPrice(log.targetPrice)}</span><div className="flex gap-1.5"><DeliveryPill name="Discord" result={log.deliveryResults?.discord} /><DeliveryPill name="Telegram" result={log.deliveryResults?.telegram} /></div></div></div>; })}</div>}
        </section>

        <aside className="lg:col-span-5 flex flex-col gap-3 sticky top-18">{selected && period ? <><EmaLevelMiniChart symbol={selected.symbol} timeframe={selected.emaMetadata?.timeframe || "1H"} exchange={exchange} period={period} emaPrice={selected.targetPrice} height={350} /><div className="p-4 rounded-xl border border-[#1b2535] bg-[#0c1017] text-xs flex flex-col gap-2"><div className="font-bold text-white">{selected.label}</div><div className="grid grid-cols-2 gap-2 text-[11px]"><div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]"><div className="text-[10px] text-[#848e9c]">Alarm Exchange</div><div className="font-bold text-white mt-0.5">{SUPPORTED_EXCHANGES[exchange]?.name}</div></div><div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]"><div className="text-[10px] text-[#848e9c]">EMA Target</div><div className="font-bold text-amber-300 mt-0.5">${formatEmaPrice(selected.targetPrice)}</div></div><div className="col-span-2 p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]"><div className="text-[10px] text-[#848e9c]">Direction</div><div className="font-bold text-violet-200 mt-0.5">{selected.emaMetadata?.direction || "Touch"} · {selected.emaMetadata?.timeframe}</div></div></div></div></> : <div className="p-10 rounded-xl border border-[#1b2535] bg-[#0c1017] text-center text-xs text-[#848e9c]">Choose an alarm or log to inspect its EMA level on the exchange chart.</div>}</aside>
      </main>

      <AlertChannelsModal isOpen={channelsOpen} onClose={() => setChannelsOpen(false)} config={webhookConfig} onSave={setWebhookConfig} />
    </div>
  );
}
