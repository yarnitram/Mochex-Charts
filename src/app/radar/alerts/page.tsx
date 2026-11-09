"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  Search,
  Trash2,
  Pause,
  Play,
  RefreshCw,
  ArrowLeft,
  Radio,
  Zap,
  TrendingUp,
  Send,
  Volume2,
  VolumeX,
  ExternalLink,
  Shield,
  Layers,
  CheckCircle2,
  AlertCircle,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";
import { PriceAlert } from "@/lib/alerts/alerts-engine";
import { AlertWebhookConfig } from "@/lib/alerts/webhook-dispatcher";
import {
  RadarAudioSettings,
  getRadarAudioSettings,
  saveRadarAudioSettings,
  playRadarChime,
} from "@/lib/audio/sound-effects";
import { AlertChannelsModal, DiscordIcon, TelegramIcon } from "@/components/terminal/AlertChannelsModal";
import { RadarAudioSettingsModal } from "@/components/radar/RadarAudioSettingsModal";
import { PoiBulkAlarmModal, CandidateCoinForBulkAlarm } from "@/components/radar/PoiBulkAlarmModal";
import { MAJORS_UNIVERSE, TOP_50_MEMES, TOP_50_AI } from "@/lib/screener/universe-catalog";

export default function RadarAlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "order_block" | "sandwich_zone" | "fvg">("ALL");
  const [timeframeFilter, setTimeframeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAUSED">("ALL");
  const [directionFilter, setDirectionFilter] = useState<"ALL" | "BULLISH" | "BEARISH">("ALL");

  // Selection for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Webhooks & Audio
  const [webhookConfig, setWebhookConfig] = useState<AlertWebhookConfig>({
    discordWebhookUrl: "",
    discordEnabled: false,
    telegramBotToken: "",
    telegramChatId: "",
    telegramEnabled: false,
  });
  const [audioSettings, setAudioSettings] = useState<RadarAudioSettings>(() => getRadarAudioSettings());

  // Modals
  const [isBulkAlarmModalOpen, setIsBulkAlarmModalOpen] = useState(false);
  const [isChannelsModalOpen, setIsChannelsModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);

  // Candidate coins for bulk alarm modal
  const [candidateCoins, setCandidateCoins] = useState<CandidateCoinForBulkAlarm[]>([]);

  // Fetch all server alerts
  const fetchAlerts = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch alerts:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch webhooks & universe candidate coins on mount
  useEffect(() => {
    fetchAlerts();

    fetch("/api/alerts/webhooks")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.config) setWebhookConfig(data.config);
      })
      .catch(() => {});

    // Prepopulate candidate coins from major universes for bulk modal
    const allCoins = [...MAJORS_UNIVERSE, ...TOP_50_AI, ...TOP_50_MEMES];
    const uniqueMap = new Map<string, CandidateCoinForBulkAlarm>();
    for (const c of allCoins) {
      if (!uniqueMap.has(c.symbol)) {
        uniqueMap.set(c.symbol, {
          symbol: c.symbol,
          name: c.name,
          price: 0,
          pois: [],
          poisByTimeframe: {},
        });
      }
    }
    setCandidateCoins(Array.from(uniqueMap.values()));
  }, [fetchAlerts]);

  // Listen to alerts updated event
  useEffect(() => {
    const handleUpdated = () => fetchAlerts(true);
    window.addEventListener("mochex:alerts-updated", handleUpdated);
    return () => window.removeEventListener("mochex:alerts-updated", handleUpdated);
  }, [fetchAlerts]);

  // Helper: radar alerts vs chart alerts
  const isRadarAlert = useCallback((a: PriceAlert) => {
    return Boolean(a.poiMetadata || a.id.startsWith("alert-poi-") || a.id.startsWith("bulk-poi-"));
  }, []);

  // Filtered radar alerts list
  const radarAlerts = useMemo(() => {
    return alerts.filter(isRadarAlert);
  }, [alerts, isRadarAlert]);

  // Filtered according to UI controls
  const filteredAlerts = useMemo(() => {
    return radarAlerts.filter((a) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const symMatch = a.symbol.toLowerCase().includes(q);
        const labelMatch = (a.label || "").toLowerCase().includes(q);
        const condMatch = (a.conditionMessage || "").toLowerCase().includes(q);
        if (!symMatch && !labelMatch && !condMatch) return false;
      }

      // Category
      if (categoryFilter !== "ALL") {
        const cat = a.poiMetadata?.category;
        if (cat !== categoryFilter) return false;
      }

      // Timeframe
      if (timeframeFilter !== "ALL") {
        const tf = a.poiMetadata?.timeframe;
        if (timeframeFilter === "1H" && tf !== "1H" && tf !== "60") return false;
        if (timeframeFilter === "4H" && tf !== "4H" && tf !== "240") return false;
        if (timeframeFilter === "15m" && tf !== "15m") return false;
        if (timeframeFilter === "1D" && tf !== "1D") return false;
      }

      // Status
      if (statusFilter === "ACTIVE" && !a.active) return false;
      if (statusFilter === "PAUSED" && a.active) return false;

      // Direction
      if (directionFilter !== "ALL") {
        const dir = a.poiMetadata?.direction;
        if (dir !== directionFilter) return false;
      }

      return true;
    });
  }, [radarAlerts, searchQuery, categoryFilter, timeframeFilter, statusFilter, directionFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = radarAlerts.length;
    const active = radarAlerts.filter((a) => a.active).length;
    const paused = total - active;
    const uniqueSymbols = new Set(radarAlerts.map((a) => a.symbol.toUpperCase().replace(/[\/\-_]/g, "")));
    const totalTriggers = radarAlerts.reduce((acc, a) => acc + (a.triggeredCount || 0), 0);

    return {
      total,
      active,
      paused,
      uniqueCoinsCount: uniqueSymbols.size,
      totalTriggers,
    };
  }, [radarAlerts]);

  // Batch Selection Handlers
  const toggleSelectAllFiltered = () => {
    if (selectedIds.size >= filteredAlerts.length && filteredAlerts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAlerts.map((a) => a.id)));
    }
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle single alert active
  const handleToggleAlertActive = async (id: string, currentActive: boolean) => {
    const nextActive = !currentActive;
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, active: nextActive } : a))
        );
        window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
        setToastMessage(`✓ Alarm ${nextActive ? "resumed" : "paused"}`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch {
      setToastMessage("Failed to update alarm");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Delete single alert
  const handleDeleteAlert = async (id: string) => {
    try {
      const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
        setToastMessage("✓ Alarm deleted");
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch {
      setToastMessage("Failed to delete alarm");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Batch toggle active status
  const handleBatchToggleActive = async (targetActive: boolean) => {
    const idsToUpdate = selectedIds.size > 0
      ? Array.from(selectedIds)
      : filteredAlerts.map((a) => a.id);

    if (idsToUpdate.length === 0) return;

    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: idsToUpdate,
          updates: { active: targetActive },
        }),
      });

      if (res.ok) {
        const idSet = new Set(idsToUpdate);
        setAlerts((prev) =>
          prev.map((a) => (idSet.has(a.id) ? { ...a, active: targetActive } : a))
        );
        window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
        setToastMessage(`✓ ${targetActive ? "Resumed" : "Paused"} ${idsToUpdate.length} alarm(s)!`);
        setTimeout(() => setToastMessage(null), 3500);
      }
    } catch {
      setToastMessage("Failed to batch update alarms");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Batch delete
  const handleBatchDelete = async () => {
    const idsToDelete = selectedIds.size > 0
      ? Array.from(selectedIds)
      : filteredAlerts.map((a) => a.id);

    if (idsToDelete.length === 0) return;

    if (!confirm(`Are you sure you want to permanently delete ${idsToDelete.length} radar alarm(s)?`)) {
      return;
    }

    try {
      const res = await fetch("/api/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });

      if (res.ok) {
        const idSet = new Set(idsToDelete);
        setAlerts((prev) => prev.filter((a) => !idSet.has(a.id)));
        setSelectedIds(new Set());
        window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
        setToastMessage(`✓ Deleted ${idsToDelete.length} radar alarm(s)!`);
        setTimeout(() => setToastMessage(null), 3500);
      }
    } catch {
      setToastMessage("Failed to batch delete alarms");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-[#d1d4dc] flex flex-col font-mono selection:bg-[#2962ff]/30">
      {/* 1. TOP HEADER NAVIGATION */}
      <header className="h-14 border-b border-[#1b2535] bg-[#0c1017] px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link
            href="/radar"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Back to POI Radar</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Radio size={18} className="animate-pulse" />
            </div>
            <div className="flex flex-col">
              <div className="text-xs font-bold text-white tracking-wider flex items-center gap-1.5">
                RADAR <span className="text-amber-400">CLOUD ALARMS</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/15 text-amber-300 font-semibold border border-amber-400/30">
                  24/7 OFFLINE DAEMON
                </span>
              </div>
              <div className="text-[10px] text-[#848e9c]">
                Centralized monitoring for Order Blocks, Sandwich Zones & FVGs
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 ml-3 pl-3 border-l border-[#1b2535]">
            <span className="w-2 h-2 rounded-full bg-[#00c087] animate-pulse" />
            <span className="text-[11px] text-[#00c087] font-semibold">
              Server Daemon Active
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Audio Chimes Button */}
          <button
            type="button"
            onClick={() => setIsAudioModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
              audioSettings.enabled
                ? "bg-[#121824] border-[#233144] text-[#b6c4ff] hover:text-white hover:bg-[#1a2332]"
                : "bg-[#121824] border-[#ff3b30]/40 text-[#ff3b30] hover:bg-[#1a2332]"
            }`}
            title="Configure Audio Chimes"
          >
            {audioSettings.enabled ? <Volume2 size={13} className="text-[#2962ff]" /> : <VolumeX size={13} />}
            <span className="hidden sm:inline">Audio</span>
          </button>

          {/* Webhook Channels Modal */}
          <button
            type="button"
            onClick={() => setIsChannelsModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
              webhookConfig.discordEnabled || webhookConfig.telegramEnabled
                ? "bg-[#121824] border-[#5865F2]/50 text-[#b6c4ff] hover:text-white hover:bg-[#1a2332]"
                : "bg-[#121824] border-[#233144] text-[#848e9c] hover:text-white hover:bg-[#1a2332]"
            }`}
            title="Configure Discord & Telegram Alert Channels"
          >
            <Send size={13} className="text-[#5865F2]" />
            <span className="hidden sm:inline">Channels</span>
            <div className="flex items-center gap-1">
              {webhookConfig.discordEnabled && <span className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" />}
              {webhookConfig.telegramEnabled && <span className="w-1.5 h-1.5 rounded-full bg-[#229ED9]" />}
            </div>
          </button>

          {/* ⚡ Bulk Alarm Setup CTA */}
          <button
            type="button"
            onClick={() => setIsBulkAlarmModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black font-bold text-xs transition-all shadow-md shadow-amber-500/10 cursor-pointer"
            title="Bulk Arm 24/7 Cloud Alarms across coins"
          >
            <Zap size={13} className="fill-current text-amber-400" />
            <span>Bulk Alarm Setup</span>
          </button>

          {/* Chart Link */}
          <Link
            href="/chart?tab=alerts"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors"
            title="Open Chart Terminal"
          >
            <TrendingUp size={13} />
            <span>Chart Alerts</span>
          </Link>

          {/* Refresh */}
          <button
            onClick={() => fetchAlerts(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors cursor-pointer"
            title="Refresh active alarms"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-[#2962ff]" : ""} />
          </button>
        </div>
      </header>

      {/* TOAST MESSAGE */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-[#0e141f] border border-amber-500/50 text-amber-300 font-mono text-xs shadow-2xl flex items-center gap-2 animate-in fade-in duration-200">
          <Sparkles size={14} className="text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 2. KPI METRICS CARDS */}
      <section className="px-4 sm:px-6 py-4 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total Alarms */}
          <div className="p-3.5 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col gap-1">
            <div className="text-[10px] text-[#848e9c] uppercase font-bold tracking-wider flex items-center justify-between">
              <span>Total Alarms</span>
              <Bell size={12} className="text-amber-400" />
            </div>
            <div className="text-xl font-extrabold text-white font-mono mt-0.5">
              {metrics.total}
            </div>
            <div className="text-[10px] text-[#848e9c]">Across all POI types</div>
          </div>

          {/* Active Alarms */}
          <div className="p-3.5 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col gap-1">
            <div className="text-[10px] text-[#848e9c] uppercase font-bold tracking-wider flex items-center justify-between">
              <span>Active</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
              {metrics.active}
            </div>
            <div className="text-[10px] text-[#848e9c]">Monitoring 24/7</div>
          </div>

          {/* Paused Alarms */}
          <div className="p-3.5 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col gap-1">
            <div className="text-[10px] text-[#848e9c] uppercase font-bold tracking-wider flex items-center justify-between">
              <span>Paused</span>
              <Pause size={12} className="text-slate-500" />
            </div>
            <div className="text-xl font-extrabold text-slate-400 font-mono mt-0.5">
              {metrics.paused}
            </div>
            <div className="text-[10px] text-[#848e9c]">Temporarily muted</div>
          </div>

          {/* Monitored Coins */}
          <div className="p-3.5 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col gap-1">
            <div className="text-[10px] text-[#848e9c] uppercase font-bold tracking-wider flex items-center justify-between">
              <span>Unique Coins</span>
              <Shield size={12} className="text-cyan-400" />
            </div>
            <div className="text-xl font-extrabold text-cyan-400 font-mono mt-0.5">
              {metrics.uniqueCoinsCount}
            </div>
            <div className="text-[10px] text-[#848e9c]">Distinct symbols</div>
          </div>

          {/* Total Triggers */}
          <div className="p-3.5 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col gap-1">
            <div className="text-[10px] text-[#848e9c] uppercase font-bold tracking-wider flex items-center justify-between">
              <span>Fired Events</span>
              <Zap size={12} className="text-amber-400" />
            </div>
            <div className="text-xl font-extrabold text-white font-mono mt-0.5">
              {metrics.totalTriggers}
            </div>
            <div className="text-[10px] text-[#848e9c]">Zone hit notifications</div>
          </div>

          {/* Channels Delivery */}
          <div className="p-3.5 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col gap-1">
            <div className="text-[10px] text-[#848e9c] uppercase font-bold tracking-wider flex items-center justify-between">
              <span>Channels</span>
              <Send size={12} className="text-[#5865F2]" />
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                  webhookConfig.discordEnabled
                    ? "bg-[#5865F2]/20 text-[#5865F2] border-[#5865F2]/40"
                    : "bg-[#121824] text-[#848e9c] border-[#233144]"
                }`}
              >
                DC: {webhookConfig.discordEnabled ? "ON" : "OFF"}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                  webhookConfig.telegramEnabled
                    ? "bg-[#229ED9]/20 text-[#229ED9] border-[#229ED9]/40"
                    : "bg-[#121824] text-[#848e9c] border-[#233144]"
                }`}
              >
                TG: {webhookConfig.telegramEnabled ? "ON" : "OFF"}
              </span>
            </div>
            <div className="text-[10px] text-[#848e9c] mt-0.5">Push dispatch status</div>
          </div>
        </div>
      </section>

      {/* 3. FILTER CONTROLS & BATCH TOOLBAR */}
      <section className="px-4 sm:px-6 pb-4 max-w-7xl mx-auto w-full flex flex-col gap-3">
        <div className="p-3 rounded-xl bg-[#0c1017] border border-[#1b2535] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#848e9c]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by coin symbol (e.g. SOL, PEPE, NEAR) or zone name..."
              className="w-full bg-[#121824] text-white text-xs pl-9 pr-3 py-2 rounded-lg border border-[#233144] focus:outline-none focus:border-[#2962ff] placeholder:text-[#848e9c]/60"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="bg-[#121824] text-[#d1d4dc] text-xs px-3 py-2 rounded-lg border border-[#233144] outline-none cursor-pointer font-bold"
          >
            <option value="ALL">All Categories (OB + Sandwich + FVG)</option>
            <option value="order_block">📦 Validated Order Blocks Only</option>
            <option value="sandwich_zone">🥪 Sandwich Zones ++ Only</option>
            <option value="fvg">⚡ Fair Value Gaps (FVG) Only</option>
          </select>

          {/* Timeframe Filter */}
          <select
            value={timeframeFilter}
            onChange={(e) => setTimeframeFilter(e.target.value)}
            className="bg-[#121824] text-[#d1d4dc] text-xs px-3 py-2 rounded-lg border border-[#233144] outline-none cursor-pointer font-bold"
          >
            <option value="ALL">All Timeframes</option>
            <option value="15m">15m Timeframe</option>
            <option value="1H">1H Timeframe</option>
            <option value="4H">4H Timeframe</option>
            <option value="1D">1D Timeframe</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#121824] text-[#d1d4dc] text-xs px-3 py-2 rounded-lg border border-[#233144] outline-none cursor-pointer font-bold"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="PAUSED">Paused Only</option>
          </select>

          {/* Direction Filter */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as any)}
            className="bg-[#121824] text-[#d1d4dc] text-xs px-3 py-2 rounded-lg border border-[#233144] outline-none cursor-pointer font-bold"
          >
            <option value="ALL">All Directions</option>
            <option value="BULLISH">🟢 Bullish (Demand)</option>
            <option value="BEARISH">🔴 Bearish (Supply)</option>
          </select>
        </div>

        {/* Batch Action Bar */}
        <div className="px-3.5 py-2 rounded-lg bg-[#121824] border border-[#233144] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="flex items-center gap-1.5 text-xs font-bold text-[#b6c4ff] hover:text-white cursor-pointer"
            >
              {selectedIds.size >= filteredAlerts.length && filteredAlerts.length > 0 ? (
                <CheckSquare size={14} className="text-[#2962ff]" />
              ) : (
                <Square size={14} className="text-[#848e9c]" />
              )}
              <span>Select All Filtered ({filteredAlerts.length})</span>
            </button>

            {selectedIds.size > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#2962ff]/20 text-[#2962ff] font-bold">
                {selectedIds.size} Selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBatchToggleActive(false)}
              disabled={filteredAlerts.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1a2332] hover:bg-[#233144] text-[#d1d4dc] border border-[#233144] text-[11px] font-bold transition-all disabled:opacity-40 cursor-pointer"
              title="Pause selected or all filtered alarms"
            >
              <Pause size={11} />
              <span>{selectedIds.size > 0 ? `Pause Selected (${selectedIds.size})` : "Pause All Filtered"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleBatchToggleActive(true)}
              disabled={filteredAlerts.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500 hover:text-black text-emerald-300 border border-emerald-500/40 text-[11px] font-bold transition-all disabled:opacity-40 cursor-pointer"
              title="Resume selected or all filtered alarms"
            >
              <Play size={11} />
              <span>{selectedIds.size > 0 ? `Resume Selected (${selectedIds.size})` : "Resume All Filtered"}</span>
            </button>

            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={filteredAlerts.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500 hover:text-white text-rose-300 border border-rose-500/40 text-[11px] font-bold transition-all disabled:opacity-40 cursor-pointer"
              title="Delete selected or all filtered alarms"
            >
              <Trash2 size={11} />
              <span>{selectedIds.size > 0 ? `Delete Selected (${selectedIds.size})` : "Delete All Filtered"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4. ALARMS DATA TABLE */}
      <main className="px-4 sm:px-6 pb-12 max-w-7xl mx-auto w-full flex-1">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-[#848e9c]">
            <RefreshCw size={24} className="animate-spin text-amber-400" />
            <span className="text-xs">Loading Radar Cloud Alarms...</span>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="p-16 rounded-2xl bg-[#0c1017] border border-[#1b2535] text-center flex flex-col items-center justify-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bell size={28} />
            </div>
            <div className="flex flex-col gap-1 max-w-md">
              <h3 className="text-base font-bold text-white">No Radar Alarms Found</h3>
              <p className="text-xs text-[#848e9c]">
                {radarAlerts.length === 0
                  ? "You haven't armed any 24/7 cloud alarms on Order Blocks, Sandwich Zones, or FVGs yet. Use the Bulk Alarm setup to arm alarms across entire universes in 1 click!"
                  : "No alarms match your active search and filter criteria. Try resetting filters."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {radarAlerts.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setIsBulkAlarmModalOpen(true)}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  <Zap size={13} className="fill-current" />
                  <span>Launch Bulk Alarm Setup</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setCategoryFilter("ALL");
                    setTimeframeFilter("ALL");
                    setStatusFilter("ALL");
                    setDirectionFilter("ALL");
                  }}
                  className="px-4 py-2 rounded-lg bg-[#121824] hover:bg-[#1a2332] text-white text-xs font-bold border border-[#233144] cursor-pointer"
                >
                  Reset All Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1b2535] bg-[#0c1017] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-[#1b2535] bg-[#121824]/60 text-[10px] text-[#848e9c] uppercase font-bold tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.size >= filteredAlerts.length && filteredAlerts.length > 0}
                        onChange={toggleSelectAllFiltered}
                        className="cursor-pointer rounded border-[#233144]"
                      />
                    </th>
                    <th className="py-3 px-3">Coin / Pair</th>
                    <th className="py-3 px-3">Category &amp; Zone</th>
                    <th className="py-3 px-3">TF</th>
                    <th className="py-3 px-3">Direction</th>
                    <th className="py-3 px-3">Target Price</th>
                    <th className="py-3 px-3">Condition</th>
                    <th className="py-3 px-3">Invalidation</th>
                    <th className="py-3 px-3">Channels</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b2535]/50">
                  {filteredAlerts.map((a) => {
                    const isSelected = selectedIds.has(a.id);
                    const formattedTarget =
                      a.targetPrice >= 1 ? a.targetPrice.toFixed(2) : a.targetPrice.toFixed(4);
                    const category = a.poiMetadata?.category || "order_block";
                    const isOb = category === "order_block";
                    const isSandwich = category === "sandwich_zone";
                    const isFvg = category === "fvg";

                    const isBullish = a.poiMetadata?.direction === "BULLISH";

                    return (
                      <tr
                        key={a.id}
                        className={`transition-colors hover:bg-[#121824]/40 ${
                          isSelected ? "bg-[#2962ff]/10" : ""
                        } ${!a.active ? "opacity-60" : ""}`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectId(a.id)}
                            className="cursor-pointer rounded border-[#233144]"
                          />
                        </td>

                        {/* Symbol */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/chart?symbol=${a.symbol.toUpperCase()}`}
                              className="font-bold text-white hover:text-[#2962ff] flex items-center gap-1 group"
                              title="Open in Chart Terminal"
                            >
                              <span>{a.symbol.replace("USDT", "")}</span>
                              <span className="text-[#848e9c] text-[10px] group-hover:text-[#2962ff]">/USDT</span>
                              <ExternalLink size={10} className="text-[#848e9c] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                          </div>
                        </td>

                        {/* Category & Zone Label */}
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                                  isOb
                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                    : isSandwich
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                    : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                }`}
                              >
                                {isOb ? "📦 Validated OB" : isSandwich ? "🥪 Sandwich ++" : "⚡ FVG"}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#848e9c] truncate max-w-[220px]" title={a.label}>
                              {a.label || a.conditionMessage}
                            </span>
                          </div>
                        </td>

                        {/* Timeframe */}
                        <td className="py-3 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-[#121824] border border-[#233144] text-[10px] font-bold text-white">
                            {a.poiMetadata?.timeframe || "1H"}
                          </span>
                        </td>

                        {/* Direction */}
                        <td className="py-3 px-3">
                          <span
                            className={`text-[10px] font-bold flex items-center gap-1 ${
                              isBullish ? "text-[#00c087]" : "text-[#ff3b30]"
                            }`}
                          >
                            <span>{isBullish ? "🟢" : "🔴"}</span>
                            <span>{isBullish ? "DEMAND" : "SUPPLY"}</span>
                          </span>
                        </td>

                        {/* Target Price */}
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-white text-[11px]">
                            ${formattedTarget}
                          </div>
                        </td>

                        {/* Condition */}
                        <td className="py-3 px-3 text-[10px] text-[#848e9c]">
                          <span className="uppercase">{a.condition.replace(/_/g, " ")}</span>
                        </td>

                        {/* Invalidation */}
                        <td className="py-3 px-3">
                          {a.invalidationPrice ? (
                            <span className="text-[10px] text-rose-400 font-mono" title="Invalidation Stop-Out">
                              ${a.invalidationPrice >= 1 ? a.invalidationPrice.toFixed(2) : a.invalidationPrice.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600">—</span>
                          )}
                        </td>

                        {/* Channels */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            {a.notifyDiscord !== false && webhookConfig.discordEnabled && (
                              <span
                                className="text-[8px] px-1 py-0.2 rounded bg-[#5865F2]/20 text-[#5865F2] font-semibold flex items-center gap-0.5"
                                title="Discord active"
                              >
                                <DiscordIcon size={9} />
                                <span>DC</span>
                              </span>
                            )}
                            {a.notifyTelegram !== false && webhookConfig.telegramEnabled && (
                              <span
                                className="text-[8px] px-1 py-0.2 rounded bg-[#229ED9]/20 text-[#229ED9] font-semibold flex items-center gap-0.5"
                                title="Telegram active"
                              >
                                <TelegramIcon size={9} />
                                <span>TG</span>
                              </span>
                            )}
                            {(!webhookConfig.discordEnabled && !webhookConfig.telegramEnabled) && (
                              <span className="text-[9px] text-[#848e9c]/60">Chime Only</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 border ${
                              a.active
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                : "bg-[#121824] text-slate-500 border-[#233144]"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${a.active ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
                            <span>{a.active ? "ACTIVE" : "PAUSED"}</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleAlertActive(a.id, a.active)}
                              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                                a.active
                                  ? "bg-[#121824] border-[#233144] text-[#848e9c] hover:text-white hover:bg-[#1a2332]"
                                  : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500 hover:text-black"
                              }`}
                              title={a.active ? "Pause Alarm" : "Resume Alarm"}
                            >
                              {a.active ? <Pause size={12} /> : <Play size={12} />}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteAlert(a.id)}
                              className="p-1.5 rounded border border-[#233144] bg-[#121824] text-[#848e9c] hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete Alarm"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-2.5 bg-[#121824]/60 border-t border-[#1b2535] text-[10px] text-[#848e9c] flex items-center justify-between">
              <span>Showing {filteredAlerts.length} of {radarAlerts.length} Radar POI Alarms</span>
              <span>All alarms monitored 24/7 on background server daemon</span>
            </div>
          </div>
        )}
      </main>

      {/* 5. MODALS */}
      {/* Bulk Alarm Modal */}
      <PoiBulkAlarmModal
        isOpen={isBulkAlarmModalOpen}
        onClose={() => setIsBulkAlarmModalOpen(false)}
        coins={candidateCoins}
        currentUniverseLabel="Radar Monitored Coins"
        currentExchange="mexc"
        defaultSelectedTimeframes={["15m", "1H", "4H", "1D"]}
        existingAlerts={alerts}
        onSuccess={(count) => {
          setToastMessage(`⚡ Successfully armed ${count} 24/7 Cloud POI Alarms!`);
          setTimeout(() => setToastMessage(null), 4000);
          fetchAlerts(true);
        }}
      />

      {/* Alert Webhook Channels Modal */}
      <AlertChannelsModal
        isOpen={isChannelsModalOpen}
        onClose={() => setIsChannelsModalOpen(false)}
        config={webhookConfig}
        onSave={(newCfg: AlertWebhookConfig) => setWebhookConfig(newCfg)}
      />

      {/* Radar Audio Settings Modal */}
      <RadarAudioSettingsModal
        isOpen={isAudioModalOpen}
        onClose={() => {
          setIsAudioModalOpen(false);
          setAudioSettings(getRadarAudioSettings());
        }}
      />
    </div>
  );
}
