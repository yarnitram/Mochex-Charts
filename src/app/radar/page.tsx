"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Radar,
  Bell,
  Search,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import {
  getUniverseCoins,
  RadarUniverseTab,
  CuratedCoin,
  MAJORS_UNIVERSE,
} from "@/lib/screener/universe-catalog";
import {
  ValidatedOrderBlock,
  OrderBlockType,
} from "@/lib/indicators/validated-ob-engine";
import { PoiAlarmModal } from "@/components/radar/PoiAlarmModal";
import { useAuth } from "@/lib/auth/use-auth";

interface RadarCoinData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  nearestOb: ValidatedOrderBlock | null;
  obsByTimeframe: Record<string, ValidatedOrderBlock[]>;
}

export default function RadarPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // Active Universe Tab
  const [activeTab, setActiveTab] = useState<RadarUniverseTab>("majors");

  // Custom Watchlist symbols saved locally
  const [customSymbols, setCustomSymbols] = useState<string[]>([
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
  ]);
  const [newCustomSymbol, setNewCustomSymbol] = useState("");

  // Timeframe filter for detection: "15m" | "60" | "240" | "1D"
  const [activeTimeframe, setActiveTimeframe] = useState<string>("240"); // Default 4H

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"ALL" | OrderBlockType>("ALL");
  const [onlyNearPois, setOnlyNearPois] = useState(false);
  const [sortBy, setSortBy] = useState<"proximity" | "volume" | "change">("proximity");

  // Loaded POI radar data
  const [radarData, setRadarData] = useState<Record<string, RadarCoinData>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected coin for POI Alarm Modal
  const [alarmModalData, setAlarmModalData] = useState<{
    symbol: string;
    orderBlock: ValidatedOrderBlock;
    obsByTimeframe: Record<string, ValidatedOrderBlock[]>;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load custom symbols on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mochex:radar_custom_symbols");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCustomSymbols(parsed);
        }
      }
    } catch {}
  }, []);

  const saveCustomSymbols = (symbols: string[]) => {
    setCustomSymbols(symbols);
    try {
      localStorage.setItem("mochex:radar_custom_symbols", JSON.stringify(symbols));
    } catch {}
  };

  const handleAddCustomSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomSymbol.trim()) return;
    const clean = newCustomSymbol.trim().toUpperCase();
    const formatted = clean.endsWith("USDT") ? clean : `${clean}USDT`;
    if (!customSymbols.includes(formatted)) {
      const updated = [formatted, ...customSymbols];
      saveCustomSymbols(updated);
      setNewCustomSymbol("");
    }
  };

  const handleRemoveCustomSymbol = (symbol: string) => {
    const updated = customSymbols.filter((s) => s !== symbol);
    saveCustomSymbols(updated);
  };

  // Coins in current universe tab
  const currentCoins = useMemo(() => {
    return getUniverseCoins(activeTab, customSymbols);
  }, [activeTab, customSymbols]);

  // Fetch Radar POI detections from API
  const fetchRadarData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const symbolsToScan = currentCoins.map((c) => c.symbol);
      const res = await fetch("/api/radar/pois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: symbolsToScan,
          timeframes: [activeTimeframe, "240", "60", "15m"],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          const map: Record<string, RadarCoinData> = {};
          data.results.forEach((item: RadarCoinData) => {
            map[item.symbol] = item;
          });
          setRadarData((prev) => ({ ...prev, ...map }));
        }
      }
    } catch (err) {
      console.warn("Failed to fetch radar POIs:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentCoins, activeTimeframe]);

  // Refresh data when universe tab or active timeframe changes
  useEffect(() => {
    fetchRadarData();
  }, [fetchRadarData]);

  // Periodic polling every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRadarData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchRadarData]);

  // Filter and Sort coins
  const filteredCoins = useMemo(() => {
    return currentCoins
      .map((coin) => {
        const data = radarData[coin.symbol];
        return {
          coin,
          data,
          nearestOb: data?.nearestOb || null,
        };
      })
      .filter(({ coin, nearestOb }) => {
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchSym = coin.symbol.toLowerCase().includes(q);
          const matchName = coin.name.toLowerCase().includes(q);
          if (!matchSym && !matchName) return false;
        }

        // Direction filter
        if (directionFilter !== "ALL") {
          if (!nearestOb || nearestOb.type !== directionFilter) return false;
        }

        // Only near POIs (< 2.0% proximity or inside zone)
        if (onlyNearPois) {
          if (!nearestOb) return false;
          if (!nearestOb.isInsideZone && nearestOb.distanceToEntryPct > 2.0) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "proximity") {
          const distA = a.nearestOb?.distanceToEntryPct ?? 999;
          const distB = b.nearestOb?.distanceToEntryPct ?? 999;
          return distA - distB;
        }
        if (sortBy === "volume") {
          const volA = a.data?.volume24h ?? 0;
          const volB = b.data?.volume24h ?? 0;
          return volB - volA;
        }
        if (sortBy === "change") {
          const chgA = a.data?.change24h ?? 0;
          const chgB = b.data?.change24h ?? 0;
          return Math.abs(chgB) - Math.abs(chgA);
        }
        return 0;
      });
  }, [currentCoins, radarData, searchQuery, directionFilter, onlyNearPois, sortBy]);

  // Aggregate stats
  const totalDetectedObs = useMemo(() => {
    return Object.values(radarData).filter((d) => d.nearestOb !== null).length;
  }, [radarData]);

  const totalNearPois = useMemo(() => {
    return Object.values(radarData).filter(
      (d) => d.nearestOb && (d.nearestOb.isInsideZone || d.nearestOb.distanceToEntryPct <= 1.0)
    ).length;
  }, [radarData]);

  return (
    <div className="min-h-screen bg-[#080b11] text-[#d1d4dc] flex flex-col font-mono selection:bg-[#2962ff]/30">
      {/* 1. TOP HEADER NAVIGATION */}
      <header className="h-14 border-b border-[#1b2535] bg-[#0c1017] px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link href="/chart" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-[#2962ff]/15 border border-[#2962ff]/40 flex items-center justify-center text-[#2962ff] group-hover:bg-[#2962ff] group-hover:text-white transition-all">
              <Radar size={18} />
            </div>
            <div className="flex flex-col">
              <div className="text-xs font-bold text-white tracking-wider flex items-center gap-1.5">
                MOCHEX <span className="text-[#00c087]">RADAR</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#00c087]/15 text-[#00c087] font-semibold border border-[#00c087]/30">
                  INSTITUTIONAL
                </span>
              </div>
              <div className="text-[10px] text-[#848e9c]">
                Points of Interest & Validated Order Blocks
              </div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-1 ml-4 pl-4 border-l border-[#1b2535]">
            <span className="w-2 h-2 rounded-full bg-[#00c087] animate-pulse" />
            <span className="text-[11px] text-[#00c087] font-semibold">
              24/7 Cloud Offline Alarms Active
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchRadarData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-[#2962ff]" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            href="/chart"
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#2962ff] hover:bg-[#1e50db] text-white text-xs font-bold transition-all shadow-md shadow-[#2962ff]/25"
          >
            <span>Workstation Terminal</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </header>

      {/* 2. SUB-HERO STATS BAR */}
      <section className="bg-[#0e141f] border-b border-[#1b2535] px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <span>Smart Order Block Radar</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#2962ff]/20 text-[#2962ff] border border-[#2962ff]/40">
                +2C FVG Validated
              </span>
            </h1>
            <p className="text-xs text-[#848e9c] mt-1 max-w-2xl">
              Continuously screens the MEXC spot universe for institutional Order Blocks confirmed by immediate 2-candle Fair Value Gaps. Receive 24/7 Discord & Telegram alarms on zone touches.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div className="p-2.5 rounded-lg bg-[#121824] border border-[#233144] text-center">
              <div className="text-[10px] text-[#848e9c] uppercase font-bold">Monitored Pairs</div>
              <div className="text-base font-bold text-white mt-0.5">{currentCoins.length}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#121824] border border-[#233144] text-center">
              <div className="text-[10px] text-[#848e9c] uppercase font-bold">Validated OBs</div>
              <div className="text-base font-bold text-[#b6c4ff] mt-0.5">{totalDetectedObs}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#121824] border border-[#233144] text-center">
              <div className="text-[10px] text-[#00c087] uppercase font-bold">&lt; 1% Proximity</div>
              <div className="text-base font-bold text-[#00c087] mt-0.5">{totalNearPois}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CONTROLS, TABS & FILTERS */}
      <section className="px-4 sm:px-6 py-4 max-w-7xl mx-auto w-full flex flex-col gap-3">
        {/* Universe Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 border-b border-[#1b2535]">
          <button
            onClick={() => setActiveTab("majors")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "majors"
                ? "bg-[#2962ff] text-white shadow-md shadow-[#2962ff]/30"
                : "bg-[#121824] text-[#848e9c] hover:text-white border border-[#233144]"
            }`}
          >
            Majors & Volume ({MAJORS_UNIVERSE.length})
          </button>

          <button
            onClick={() => setActiveTab("memes")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "memes"
                ? "bg-[#2962ff] text-white shadow-md shadow-[#2962ff]/30"
                : "bg-[#121824] text-[#848e9c] hover:text-white border border-[#233144]"
            }`}
          >
            🔥 Top 50 Meme Coins
          </button>

          <button
            onClick={() => setActiveTab("ai")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "ai"
                ? "bg-[#2962ff] text-white shadow-md shadow-[#2962ff]/30"
                : "bg-[#121824] text-[#848e9c] hover:text-white border border-[#233144]"
            }`}
          >
            ⚡ Top 50 AI Coins
          </button>

          <button
            onClick={() => setActiveTab("custom")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "custom"
                ? "bg-[#2962ff] text-white shadow-md shadow-[#2962ff]/30"
                : "bg-[#121824] text-[#848e9c] hover:text-white border border-[#233144]"
            }`}
          >
            ⭐ My Watchlist ({customSymbols.length})
          </button>
        </div>

        {/* Custom Watchlist Symbol Adder Bar (Visible on "custom" tab) */}
        {activeTab === "custom" && (
          <form
            onSubmit={handleAddCustomSymbol}
            className="flex items-center gap-2 p-2 rounded-lg bg-[#121824] border border-[#233144]"
          >
            <input
              type="text"
              value={newCustomSymbol}
              onChange={(e) => setNewCustomSymbol(e.target.value)}
              placeholder="Add MEXC pair to custom radar (e.g. SUI, KAS, TIA, PEPE)..."
              className="flex-1 bg-transparent text-xs text-white placeholder-[#848e9c]/50 outline-none px-2"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded bg-[#2962ff] hover:bg-[#1e50db] text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus size={13} />
              <span>Add Pair</span>
            </button>
          </form>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0e141f] p-3 rounded-xl border border-[#1b2535]">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#848e9c]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by ticker or name..."
              className="w-full bg-[#121824] text-xs text-white placeholder-[#848e9c]/60 pl-8 pr-3 py-2 rounded-lg border border-[#233144] focus:outline-none focus:border-[#2962ff]"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Primary Timeframe Selector */}
            <div className="flex items-center gap-1 bg-[#121824] p-0.5 rounded-lg border border-[#233144]">
              {[
                { label: "15m", val: "15m" },
                { label: "1H", val: "60" },
                { label: "4H", val: "240" },
                { label: "1D", val: "1D" },
              ].map((tf) => (
                <button
                  key={tf.val}
                  onClick={() => setActiveTimeframe(tf.val)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                    activeTimeframe === tf.val
                      ? "bg-[#2962ff] text-white"
                      : "text-[#848e9c] hover:text-white"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Direction Filter */}
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as any)}
              className="bg-[#121824] text-[#d1d4dc] text-xs px-2.5 py-2 rounded-lg border border-[#233144] outline-none cursor-pointer"
            >
              <option value="ALL">All OB Types</option>
              <option value="BULLISH">Bullish OB Only</option>
              <option value="BEARISH">Bearish OB Only</option>
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#121824] text-[#d1d4dc] text-xs px-2.5 py-2 rounded-lg border border-[#233144] outline-none cursor-pointer"
            >
              <option value="proximity">Sort: Closest to Zone</option>
              <option value="volume">Sort: 24h Volume</option>
              <option value="change">Sort: 24h Change %</option>
            </select>

            {/* Near POIs Only Toggle */}
            <button
              onClick={() => setOnlyNearPois((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                onlyNearPois
                  ? "bg-[#00c087]/20 text-[#00c087] border-[#00c087]/50"
                  : "bg-[#121824] text-[#848e9c] border-[#233144] hover:text-white"
              }`}
            >
              <Filter size={13} />
              <span>&lt; 2% Near Zone</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4. POI RADAR TABLE */}
      <main className="flex-1 px-4 sm:px-6 pb-12 max-w-7xl mx-auto w-full">
        <div className="bg-[#0e141f] border border-[#1b2535] rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1b2535] bg-[#0c1017] text-[#848e9c] uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4 font-bold">Asset / Pair</th>
                  <th className="py-3 px-4 font-bold">Mark Price</th>
                  <th className="py-3 px-4 font-bold">24h Change / Vol</th>
                  <th className="py-3 px-4 font-bold">Nearest Validated OB</th>
                  <th className="py-3 px-4 font-bold">Zone Range (50% MT)</th>
                  <th className="py-3 px-4 font-bold">Proximity</th>
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#172233]">
                {loading && filteredCoins.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-[#848e9c]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw size={24} className="animate-spin text-[#2962ff]" />
                        <span>Scanning MEXC Order Blocks & FVG Confluences...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredCoins.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-[#848e9c]">
                      No coins match the selected filters or search query.
                    </td>
                  </tr>
                ) : (
                  filteredCoins.map(({ coin, data, nearestOb }) => {
                    const price = data?.price || 0;
                    const change24h = data?.change24h || 0;
                    const volume24h = data?.volume24h || 0;
                    const isPositive = change24h >= 0;

                    const formattedPrice =
                      price >= 1
                        ? price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : price.toFixed(4);

                    const formattedVol =
                      volume24h >= 1_000_000_000
                        ? `$${(volume24h / 1_000_000_000).toFixed(2)}B`
                        : volume24h >= 1_000_000
                        ? `$${(volume24h / 1_000_000).toFixed(2)}M`
                        : `$${(volume24h / 1_000).toFixed(1)}K`;

                    return (
                      <tr
                        key={coin.symbol}
                        className="hover:bg-[#121a29] transition-colors group"
                      >
                        {/* 1. ASSET */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-2.5">
                            <div className="flex flex-col">
                              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                                <Link
                                  href={`/chart?symbol=${coin.symbol}`}
                                  className="hover:text-[#2962ff] transition-colors"
                                >
                                  {coin.symbol.replace("USDT", "/USDT")}
                                </Link>
                              </div>
                              <div className="text-[10px] text-[#848e9c] truncate max-w-[120px]">
                                {coin.name}
                              </div>
                            </div>
                            {activeTab === "custom" && (
                              <button
                                onClick={() => handleRemoveCustomSymbol(coin.symbol)}
                                title="Remove from custom watchlist"
                                className="opacity-0 group-hover:opacity-100 p-1 text-[#848e9c] hover:text-[#ff3b30] transition-opacity cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 2. PRICE */}
                        <td className="py-3.5 px-4 font-mono font-bold text-white">
                          ${formattedPrice}
                        </td>

                        {/* 3. 24H CHANGE & VOL */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex flex-col">
                            <span
                              className={`font-bold ${
                                isPositive ? "text-[#00c087]" : "text-[#ff3b30]"
                              }`}
                            >
                              {isPositive ? "+" : ""}
                              {change24h.toFixed(2)}%
                            </span>
                            <span className="text-[10px] text-[#848e9c]">{formattedVol}</span>
                          </div>
                        </td>

                        {/* 4. NEAREST ORDER BLOCK */}
                        <td className="py-3.5 px-4">
                          {nearestOb ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    nearestOb.type === "BULLISH"
                                      ? "bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30"
                                      : "bg-[#ff3b30]/15 text-[#ff3b30] border border-[#ff3b30]/30"
                                  }`}
                                >
                                  {nearestOb.type} OB
                                </span>
                                <span className="px-1.5 py-0.2 rounded bg-[#172233] text-[#b6c4ff] text-[9px] font-bold">
                                  {nearestOb.timeframe}
                                </span>
                              </div>
                              <span className="text-[9px] text-[#848e9c] flex items-center gap-1">
                                <Sparkles size={10} className="text-[#2962ff]" />
                                +2C FVG Confirmed
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#848e9c]/60 italic text-[11px]">
                              No active OB on {activeTimeframe}
                            </span>
                          )}
                        </td>

                        {/* 5. ZONE RANGE */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          {nearestOb ? (
                            <div className="flex flex-col">
                              <span className="text-white font-semibold">
                                ${nearestOb.bottom.toFixed(2)} - ${nearestOb.top.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-[#2962ff]">
                                MT: ${nearestOb.meanThreshold.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#848e9c]">—</span>
                          )}
                        </td>

                        {/* 6. PROXIMITY */}
                        <td className="py-3.5 px-4 font-mono">
                          {nearestOb ? (
                            <div className="flex flex-col gap-1 min-w-[100px]">
                              {nearestOb.isInsideZone ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00c087]/20 text-[#00c087] border border-[#00c087]/40 font-bold text-[10px] animate-pulse">
                                  <span>TESTING ZONE</span>
                                </span>
                              ) : (
                                <>
                                  <span
                                    className={`font-bold ${
                                      nearestOb.distanceToEntryPct <= 1.0
                                        ? "text-[#00c087]"
                                        : nearestOb.distanceToEntryPct <= 2.5
                                        ? "text-[#f5ac37]"
                                        : "text-[#848e9c]"
                                    }`}
                                  >
                                    +{nearestOb.distanceToEntryPct.toFixed(2)}% to entry
                                  </span>
                                  <div className="w-full bg-[#172233] h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${
                                        nearestOb.distanceToEntryPct <= 1.0
                                          ? "bg-[#00c087]"
                                          : nearestOb.distanceToEntryPct <= 2.5
                                          ? "bg-[#f5ac37]"
                                          : "bg-[#2962ff]"
                                      }`}
                                      style={{
                                        width: `${Math.max(
                                          5,
                                          Math.min(100, 100 - nearestOb.distanceToEntryPct * 15)
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#848e9c]">—</span>
                          )}
                        </td>

                        {/* 7. ACTIONS */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {nearestOb && (
                              <button
                                onClick={() =>
                                  setAlarmModalData({
                                    symbol: coin.symbol,
                                    orderBlock: nearestOb,
                                    obsByTimeframe: data?.obsByTimeframe || {},
                                  })
                                }
                                title="Set 24/7 Cloud Offline Alarm"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#2962ff]/15 hover:bg-[#2962ff] text-[#2962ff] hover:text-white border border-[#2962ff]/30 text-[11px] font-bold transition-all cursor-pointer"
                              >
                                <Bell size={12} />
                                <span className="hidden sm:inline">Set Alarm</span>
                              </button>
                            )}

                            <Link
                              href={`/chart?symbol=${coin.symbol}`}
                              title="Open in Trading Terminal"
                              className="p-1.5 rounded bg-[#121824] hover:bg-[#1a2332] text-[#848e9c] hover:text-white border border-[#233144] transition-colors cursor-pointer"
                            >
                              <ExternalLink size={13} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 5. POI ALARM CONFIGURATION MODAL */}
      {alarmModalData && (
        <PoiAlarmModal
          isOpen={Boolean(alarmModalData)}
          onClose={() => setAlarmModalData(null)}
          symbol={alarmModalData.symbol}
          orderBlock={alarmModalData.orderBlock}
          availableObsByTimeframe={alarmModalData.obsByTimeframe}
          onSuccess={(count) => {
            setToastMessage(`Created ${count} 24/7 Cloud POI Alarm(s)!`);
            setTimeout(() => setToastMessage(null), 4000);
          }}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00c087] text-black font-bold text-xs shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
