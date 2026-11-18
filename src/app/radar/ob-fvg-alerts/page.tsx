"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Pause,
  Play,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  AlertLogEntry,
  ChannelDeliveryResult,
  findDuplicateAlerts,
  formatAlarmPrice,
  PriceAlert,
} from "@/lib/alerts/alerts-engine";
import {
  loadClientAlerts,
  recordDeletedAlertIds,
  saveClientAlerts,
  syncAlerts,
} from "@/lib/alerts/alerts-sync";
import { loadClientWebhooks, syncWebhooks } from "@/lib/alerts/webhooks-sync";
import { AlertWebhookConfig } from "@/lib/alerts/webhook-dispatcher";
import { AlertChannelsModal } from "@/components/terminal/AlertChannelsModal";
import { ObZoneMiniChart } from "@/components/radar/ObZoneMiniChart";
import { buildMochexChartUrl } from "@/lib/chart/chart-url";

import { SUPPORTED_EXCHANGES, SupportedExchange } from "@/lib/screener/multi-exchange-client";

interface InspectableChartTarget {
  id: string;
  symbol: string;
  timeframe: string;
  exchange: SupportedExchange;
  zoneTop: number;
  zoneBottom: number;
  direction: "BULLISH" | "BEARISH";
  targetPrice: number;
  invalidationPrice?: number;
  pattern?: "RGG" | "GRR";
  label: string;
}

function DeliveryPill({
  name,
  res,
}: {
  name: string;
  res?: ChannelDeliveryResult;
}) {
  if (!res) {
    return (
      <span className="px-1.5 py-0.5 rounded bg-[#121824] border border-[#233144] text-[9px] text-[#848e9c]">
        {name}: N/A
      </span>
    );
  }
  if (res.ok) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-[9px] font-bold text-emerald-300">
        <CheckCircle2 size={9} />
        {name}: Sent
      </span>
    );
  }
  if (res.skipped) {
    return (
      <span
        title={res.skippedReason}
        className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-[9px] text-amber-300"
      >
        {name}: Skipped
      </span>
    );
  }
  return (
    <span
      title={res.error}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-[9px] font-bold text-rose-300"
    >
      <XCircle size={9} />
      {name}: Failed
    </span>
  );
}

export default function ObFvgAlertsAndLogsPage() {
  const [activeTab, setActiveTab] = useState<"alarms" | "logs">("alarms");
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [logs, setLogs] = useState<AlertLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [scopeFilter, setScopeFilter] = useState<"ob_fvg" | "all">("ob_fvg");
  const [exchangeFilter, setExchangeFilter] = useState<"ALL" | SupportedExchange>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInspectId, setSelectedInspectId] = useState<string | null>(null);

  const [webhookConfig, setWebhookConfig] = useState<AlertWebhookConfig>(
    loadClientWebhooks
  );
  const [isChannelsModalOpen, setIsChannelsModalOpen] = useState(false);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      await syncAlerts(setAlerts);
      const res = await fetch("/api/alerts/logs?limit=200", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    setAlerts(loadClientAlerts());
    fetchAll();
    syncWebhooks().then(setWebhookConfig).catch(() => {});

    const handleUpdated = () => fetchAll(true);
    window.addEventListener("mochex:alerts-updated", handleUpdated);
    window.addEventListener("focus", handleUpdated);
    const tid = setInterval(() => fetchAll(true), 15_000);
    return () => {
      window.removeEventListener("mochex:alerts-updated", handleUpdated);
      window.removeEventListener("focus", handleUpdated);
      clearInterval(tid);
    };
  }, [fetchAll]);

  const scopedAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (scopeFilter === "ob_fvg") {
        const isOb = a.poiMetadata?.category === "order_block";
        if (!isOb) return false;
      }
      if (exchangeFilter !== "ALL") {
        const ex = a.exchange || a.poiMetadata?.exchange || "mexc";
        if (ex !== exchangeFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (
          !a.symbol.toLowerCase().includes(q) &&
          !(a.label || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [alerts, scopeFilter, exchangeFilter, searchQuery]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (exchangeFilter !== "ALL") {
        const ex = l.exchange || l.poiMetadata?.exchange || "mexc";
        if (ex !== exchangeFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (
          !l.symbol.toLowerCase().includes(q) &&
          !(l.label || "").toLowerCase().includes(q) &&
          !(l.message || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [logs, exchangeFilter, searchQuery]);

  const duplicateIds = useMemo(
    () => findDuplicateAlerts(scopedAlerts).duplicateIds,
    [scopedAlerts]
  );

  // Build chart inspection target from currently selected item or first item in active tab
  const inspectTarget: InspectableChartTarget | null = useMemo(() => {
    if (activeTab === "alarms") {
      const picked =
        scopedAlerts.find((a) => a.id === selectedInspectId) || scopedAlerts[0];
      if (!picked) return null;
      const ex: SupportedExchange =
        picked.exchange || picked.poiMetadata?.exchange || "mexc";
      const zTop = picked.poiMetadata?.zoneTop ?? picked.targetPrice;
      const zBot = picked.poiMetadata?.zoneBottom ?? picked.targetPrice;
      return {
        id: picked.id,
        symbol: picked.symbol,
        timeframe: picked.poiMetadata?.timeframe || "1H",
        exchange: ex,
        zoneTop: zTop,
        zoneBottom: zBot,
        direction:
          picked.poiMetadata?.direction ||
          (picked.condition === "crossing_up" ? "BEARISH" : "BULLISH"),
        targetPrice: picked.targetPrice,
        invalidationPrice: picked.invalidationPrice ?? picked.poiMetadata?.invalidationPrice,
        pattern: picked.poiMetadata?.pattern,
        label: picked.label,
      };
    } else {
      const pickedLog =
        filteredLogs.find((l) => l.id === selectedInspectId) || filteredLogs[0];
      if (!pickedLog) return null;
      const ex: SupportedExchange =
        pickedLog.exchange || pickedLog.poiMetadata?.exchange || "mexc";
      const zTop = pickedLog.poiMetadata?.zoneTop ?? pickedLog.targetPrice;
      const zBot = pickedLog.poiMetadata?.zoneBottom ?? pickedLog.targetPrice;
      return {
        id: pickedLog.id,
        symbol: pickedLog.symbol,
        timeframe: pickedLog.poiMetadata?.timeframe || "1H",
        exchange: ex,
        zoneTop: zTop,
        zoneBottom: zBot,
        direction:
          pickedLog.poiMetadata?.direction ||
          (pickedLog.condition === "crossing_up" ? "BEARISH" : "BULLISH"),
        targetPrice: pickedLog.targetPrice,
        invalidationPrice: pickedLog.poiMetadata?.invalidationPrice,
        pattern: pickedLog.poiMetadata?.pattern,
        label: pickedLog.label,
      };
    }
  }, [activeTab, scopedAlerts, filteredLogs, selectedInspectId]);

  const handleToggleActive = async (alert: PriceAlert) => {
    const nextActive = !alert.active;
    const updated = alerts.map((a) =>
      a.id === alert.id ? { ...a, active: nextActive } : a
    );
    setAlerts(updated);
    saveClientAlerts(updated);
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [alert.id], updates: { active: nextActive } }),
    }).catch(() => {});
  };

  const handleDeleteIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    recordDeletedAlertIds(ids);
    const remaining = alerts.filter((a) => !idSet.has(a.id));
    setAlerts(remaining);
    saveClientAlerts(remaining);
    await fetch("/api/alerts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
  };

  const handleClearLogs = async () => {
    if (!confirm("Clear all server trigger & delivery logs?")) return;
    const res = await fetch("/api/alerts/logs", { method: "DELETE" });
    if (res.ok) setLogs([]);
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-[#d1d4dc] flex flex-col font-mono selection:bg-[#2962ff]/30">
      {/* HEADER */}
      <header className="h-14 border-b border-[#1b2535] bg-[#0c1017] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link
            href="/radar/ob-fvg"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">OB+FVG Scanner</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Bell size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>OB + FVG ALARM SET &amp; LOGS</span>
              </div>
              <div className="text-[10px] text-[#848e9c]">
                Armed Alarms with Live Exchange Chart &amp; OB Range + Trigger Delivery Logs
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
          </button>

          <Link
            href="/radar/ob-fvg"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#00c087]/40 bg-[#00c087]/15 hover:bg-[#00c087] text-[#00c087] hover:text-black font-bold text-xs transition-all"
          >
            <ShieldCheck size={13} />
            <span>Auto Scanner</span>
          </Link>

          <button
            type="button"
            onClick={() => fetchAll(true)}
            className="p-2 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-[#848e9c] hover:text-white cursor-pointer"
            title="Refresh alarms and logs"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-[#2962ff]" : ""} />
          </button>
        </div>
      </header>

      {/* TABS & FILTERS */}
      <section className="px-4 sm:px-6 pt-4 max-w-7xl mx-auto w-full flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Primary Tabs: Alarm Set vs Logs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0c1017] border border-[#1b2535]">
            <button
              type="button"
              onClick={() => setActiveTab("alarms")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                activeTab === "alarms"
                  ? "bg-amber-500 text-slate-950"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              <Bell size={13} />
              <span>Alarm Set ({scopedAlerts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("logs")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                activeTab === "logs"
                  ? "bg-[#2962ff] text-white"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              <ScrollText size={13} />
              <span>Trigger &amp; Delivery Logs ({filteredLogs.length})</span>
            </button>
          </div>

          {/* Search & Exchange Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#848e9c]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter symbol..."
                className="bg-[#0c1017] border border-[#233144] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2962ff]"
              />
            </div>

            <select
              value={exchangeFilter}
              onChange={(e) => setExchangeFilter(e.target.value as any)}
              className="bg-[#0c1017] border border-[#233144] rounded-lg px-2.5 py-1.5 text-xs text-white font-bold outline-none cursor-pointer"
            >
              <option value="ALL">All Exchanges</option>
              <option value="bybit">Bybit Perps Only</option>
              <option value="binance">Binance Perps Only</option>
              <option value="mexc">MEXC Perps Only</option>
            </select>

            {activeTab === "alarms" && (
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value as any)}
                className="bg-[#0c1017] border border-[#233144] rounded-lg px-2.5 py-1.5 text-xs text-white font-bold outline-none cursor-pointer"
              >
                <option value="ob_fvg">Validated OB+FVG Only</option>
                <option value="all">All Armed Alarms</option>
              </select>
            )}

            {activeTab === "alarms" && duplicateIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleDeleteIds(duplicateIds)}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500 border border-amber-500/40 text-amber-300 hover:text-black text-xs font-bold cursor-pointer"
              >
                Remove Duplicates ({duplicateIds.length})
              </button>
            )}

            {activeTab === "logs" && logs.length > 0 && (
              <button
                type="button"
                onClick={handleClearLogs}
                className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-bold cursor-pointer"
              >
                Clear Logs
              </button>
            )}
          </div>
        </div>
      </section>

      {/* SPLIT VIEW: LIST LEFT + LIVE CHART & OB RANGE RIGHT */}
      <main className="px-4 sm:px-6 py-4 max-w-7xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: ALARM SET OR LOGS */}
        <div className="lg:col-span-7 rounded-xl border border-[#1b2535] bg-[#0c1017] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-[#848e9c]">
              Loading {activeTab === "alarms" ? "armed alarms" : "delivery logs"}...
            </div>
          ) : activeTab === "alarms" ? (
            scopedAlerts.length === 0 ? (
              <div className="p-12 text-center text-xs text-[#848e9c] flex flex-col items-center gap-3">
                <span>No armed OB+FVG alarms match your filter.</span>
                <Link
                  href="/radar/ob-fvg"
                  className="px-3 py-1.5 rounded-lg bg-[#00c087] text-slate-950 font-bold text-xs"
                >
                  Open Auto OB+FVG Scanner
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#162030] max-h-[650px] overflow-y-auto">
                {scopedAlerts.map((alert) => {
                  const ex: SupportedExchange =
                    alert.exchange || alert.poiMetadata?.exchange || "mexc";
                  const exCfg = SUPPORTED_EXCHANGES[ex];
                  const zTop = alert.poiMetadata?.zoneTop ?? 0;
                  const zBot = alert.poiMetadata?.zoneBottom ?? 0;
                  const low = Math.min(zBot, zTop);
                  const high = Math.max(zBot, zTop);
                  const spreadPct = low > 0 ? ((high - low) / low) * 100 : 0;
                  const isBull =
                    alert.poiMetadata?.direction === "BULLISH" ||
                    alert.condition === "crossing_down";
                  const isSelected = inspectTarget?.id === alert.id;

                  return (
                    <div
                      key={alert.id}
                      onClick={() => setSelectedInspectId(alert.id)}
                      className={`p-3.5 cursor-pointer transition-colors flex flex-col gap-2 ${
                        isSelected ? "bg-[#2962ff]/12" : "hover:bg-[#121824]/60"
                      } ${!alert.active ? "opacity-60" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-white">
                            {alert.symbol.replace("USDT", "/USDT")}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-[#121824] border border-[#233144] text-[10px] font-bold text-white">
                            {alert.poiMetadata?.timeframe || "1H"}
                          </span>
                          {alert.poiMetadata?.pattern && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                isBull
                                  ? "bg-[#00c087]/15 text-[#00c087] border-[#00c087]/35"
                                  : "bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/35"
                              }`}
                            >
                              {alert.poiMetadata.pattern}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${exCfg.badgeBg} ${exCfg.badgeText} ${exCfg.badgeBorder}`}
                          >
                            {exCfg.badgeLabel}
                          </span>
                        </div>

                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleActive(alert)}
                            className="p-1.5 rounded bg-[#121824] hover:bg-[#1a2332] border border-[#233144] text-[#848e9c] hover:text-white cursor-pointer"
                            title={alert.active ? "Pause alarm" : "Resume alarm"}
                          >
                            {alert.active ? <Pause size={12} /> : <Play size={12} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIds([alert.id])}
                            className="p-1.5 rounded bg-[#121824] hover:bg-rose-500/20 border border-[#233144] text-[#848e9c] hover:text-rose-400 cursor-pointer"
                            title="Delete alarm"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="text-[#b6c4ff]">
                          OB Price Range:{" "}
                          {high > 0 ? (
                            <strong className="text-white">
                              ${formatAlarmPrice(low)} — ${formatAlarmPrice(high)}
                            </strong>
                          ) : (
                            <span className="text-[#848e9c]">—</span>
                          )}{" "}
                          {spreadPct > 0 && (
                            <span className="text-[#848e9c]">
                              ({spreadPct.toFixed(2)}%)
                            </span>
                          )}
                        </div>
                        <div className="text-amber-300 font-bold">
                          Trigger: ${formatAlarmPrice(alert.targetPrice)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#848e9c]">
              No alarm trigger or delivery logs recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-[#162030] max-h-[650px] overflow-y-auto">
              {filteredLogs.map((log) => {
                const ex: SupportedExchange =
                  log.exchange || log.poiMetadata?.exchange || "mexc";
                const exCfg = SUPPORTED_EXCHANGES[ex];
                const zTop = log.poiMetadata?.zoneTop ?? 0;
                const zBot = log.poiMetadata?.zoneBottom ?? 0;
                const low = Math.min(zBot, zTop);
                const high = Math.max(zBot, zTop);
                const isSelected = inspectTarget?.id === log.id;

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedInspectId(log.id)}
                    className={`p-3.5 cursor-pointer transition-colors flex flex-col gap-2 ${
                      isSelected ? "bg-[#2962ff]/12" : "hover:bg-[#121824]/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-white">
                          {log.symbol.replace("USDT", "/USDT")}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${exCfg.badgeBg} ${exCfg.badgeText} ${exCfg.badgeBorder}`}
                        >
                          {exCfg.badgeLabel}
                        </span>
                        {log.poiMetadata?.timeframe && (
                          <span className="px-1.5 py-0.5 rounded bg-[#121824] border border-[#233144] text-[10px] font-bold text-white">
                            {log.poiMetadata.timeframe}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]">
                        <Clock size={11} />
                        <span>{new Date(log.triggeredAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-[#d1d4dc]">{log.label}</div>
                    {log.message && (
                      <div className="text-[10px] text-[#848e9c]">{log.message}</div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span>
                          Hit:{" "}
                          <strong className="text-white">
                            ${formatAlarmPrice(log.triggerPrice)}
                          </strong>
                        </span>
                        {high > 0 && (
                          <span className="text-[#b6c4ff]">
                            OB Range:{" "}
                            <strong className="text-white">
                              ${formatAlarmPrice(low)} — ${formatAlarmPrice(high)}
                            </strong>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <DeliveryPill
                          name="Discord"
                          res={log.deliveryResults?.discord}
                        />
                        <DeliveryPill
                          name="Telegram"
                          res={log.deliveryResults?.telegram}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: EXCHANGE CHART & OB PRICE RANGE INSPECTOR */}
        <div className="lg:col-span-5 flex flex-col gap-3 sticky top-18">
          {inspectTarget ? (
            <>
              <ObZoneMiniChart
                symbol={inspectTarget.symbol}
                timeframe={inspectTarget.timeframe}
                exchange={inspectTarget.exchange}
                zoneTop={inspectTarget.zoneTop}
                zoneBottom={inspectTarget.zoneBottom}
                direction={inspectTarget.direction}
                targetPrice={inspectTarget.targetPrice}
                invalidationPrice={inspectTarget.invalidationPrice}
                pattern={inspectTarget.pattern}
                height={340}
              />

              <div className="p-4 rounded-xl border border-[#1b2535] bg-[#0c1017] flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-white truncate">
                    {inspectTarget.label}
                  </div>
                  <Link
                    href={buildMochexChartUrl({
                      symbol: inspectTarget.symbol,
                      timeframe: inspectTarget.timeframe,
                      exchange: inspectTarget.exchange,
                      indicator: "validated-ob-radar",
                      targetPrice: inspectTarget.targetPrice,
                    })}
                    className="text-[11px] text-[#8eaaff] hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>Full Chart</span>
                    <ExternalLink size={11} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]">
                    <div className="text-[10px] text-[#848e9c]">
                      Alarm Checking Exchange
                    </div>
                    <div className="font-bold text-white mt-0.5">
                      {SUPPORTED_EXCHANGES[inspectTarget.exchange]?.name}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]">
                    <div className="text-[10px] text-[#848e9c]">Alarm Target</div>
                    <div className="font-bold text-amber-300 mt-0.5">
                      ${formatAlarmPrice(inspectTarget.targetPrice)}
                    </div>
                  </div>
                  <div className="col-span-2 p-2.5 rounded-lg bg-[#121824] border border-[#1b2535]">
                    <div className="text-[10px] text-[#848e9c]">
                      Validated OB Price Range (Bottom — Top)
                    </div>
                    <div className="font-bold text-white mt-0.5">
                      $
                      {formatAlarmPrice(
                        Math.min(inspectTarget.zoneBottom, inspectTarget.zoneTop)
                      )}{" "}
                      — $
                      {formatAlarmPrice(
                        Math.max(inspectTarget.zoneBottom, inspectTarget.zoneTop)
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-10 rounded-xl border border-[#1b2535] bg-[#0c1017] text-center text-xs text-[#848e9c]">
              Click any armed alarm or log entry on the left to display its live exchange candlestick chart and OB price range.
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
