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
  Star,
  Layers,
  Kanban,
  Table,
  Zap,
  Eye,
  Volume2,
  VolumeX,
  FileSpreadsheet,
  FileJson,
  Copy,
  Globe,
} from "lucide-react";
import {
  SupportedExchange,
  ExchangeFilter,
  SUPPORTED_EXCHANGES,
} from "@/lib/screener/multi-exchange-client";
import {
  getUniverseCoins,
  RadarUniverseTab,
  CuratedCoin,
  MAJORS_UNIVERSE,
} from "@/lib/screener/universe-catalog";
import {
  RadarPoiItem,
  PoiCategory,
  PoiDirection,
  PoiStatus,
} from "@/lib/indicators/radar-poi-engine";
import { PoiAlarmModal } from "@/components/radar/PoiAlarmModal";
import { PoiPaperTradeModal } from "@/components/radar/PoiPaperTradeModal";
import { PoiQuickPreviewDrawer } from "@/components/radar/PoiQuickPreviewDrawer";
import { RadarAudioSettingsModal } from "@/components/radar/RadarAudioSettingsModal";
import {
  loadStoredPaperAccount,
  saveStoredPaperAccount,
  evaluatePaperTick,
} from "@/lib/trading/paper-trading-engine";
import {
  RadarAudioSettings,
  getRadarAudioSettings,
  playRadarChime,
} from "@/lib/audio/sound-effects";
import {
  ExportableRadarItem,
  RadarExportMeta,
  downloadRadarCsv,
  downloadRadarJson,
  copyRadarToClipboard,
} from "@/lib/screener/radar-export";
import { mexcWsManager, MiniTickerCallback } from "@/lib/mexc/websocket";
import { useAuth } from "@/lib/auth/use-auth";

interface RadarCoinData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  nearestPoi: RadarPoiItem | null;
  nearestOb: RadarPoiItem | null;
  nearestSandwich: RadarPoiItem | null;
  nearestFvg: RadarPoiItem | null;
  poisByTimeframe: Record<string, RadarPoiItem[]>;
  exchange?: string;
}

export default function RadarPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // View Mode: "table" vs "kanban"
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");

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

  // Active Exchange Filter: "all" | "mexc" | "binance" | "bybit" (DEC-143)
  const [activeExchange, setActiveExchange] = useState<ExchangeFilter>("mexc");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [poiCategoryFilter, setPoiCategoryFilter] = useState<"ALL" | PoiCategory>("ALL");
  const [directionFilter, setDirectionFilter] = useState<"ALL" | PoiDirection>("ALL");
  const [onlyNearPois, setOnlyNearPois] = useState(false);
  const [sortBy, setSortBy] = useState<"proximity" | "volume" | "change">("proximity");

  // Loaded POI radar data
  const [radarData, setRadarData] = useState<Record<string, RadarCoinData>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected coin for POI Alarm Modal
  const [alarmModalData, setAlarmModalData] = useState<{
    symbol: string;
    poi: RadarPoiItem;
    poisByTimeframe: Record<string, RadarPoiItem[]>;
  } | null>(null);

  // Selected coin for Quick Preview Drawer
  const [previewData, setPreviewData] = useState<{
    symbol: string;
    coinName?: string;
    poi: RadarPoiItem;
    currentPrice: number;
    change24h: number;
  } | null>(null);

  // Selected coin for POI Paper Trade Modal (DEC-142)
  const [paperTradeModalData, setPaperTradeModalData] = useState<{
    symbol: string;
    poi: RadarPoiItem;
    currentPrice: number;
  } | null>(null);

  // Live WebSocket Tick Flashing state
  const [priceFlashing, setPriceFlashing] = useState<Record<string, "up" | "down">>({});
  const [isWsConnected, setIsWsConnected] = useState(false);

  // Audio chime settings state & modal
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [audioSettings, setAudioSettings] = useState<RadarAudioSettings>(() => getRadarAudioSettings());
  const audioSettingsRef = React.useRef<RadarAudioSettings>(audioSettings);
  audioSettingsRef.current = audioSettings;

  // Cooldown tracker for live WebSocket zone entry audio triggers (30s per symbol)
  const lastChimedSymbolTimeRef = React.useRef<Record<string, number>>({});

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync audio settings from local custom events
  useEffect(() => {
    const handleAudioSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<RadarAudioSettings>;
      if (customEvent.detail) {
        setAudioSettings(customEvent.detail);
      }
    };
    window.addEventListener("mochex:radar-audio-settings-changed", handleAudioSettingsChanged);
    return () => {
      window.removeEventListener("mochex:radar-audio-settings-changed", handleAudioSettingsChanged);
    };
  }, []);

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
          exchange: activeExchange,
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
  }, [currentCoins, activeTimeframe, activeExchange]);

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

  // Live MEXC WebSocket miniTickers stream for instant price updates & proximity adjustments
  useEffect(() => {
    let isMounted = true;
    setIsWsConnected(true);

    const handleMiniTickers: MiniTickerCallback = (tickers) => {
      if (!isMounted || !tickers || tickers.length === 0) return;

      setRadarData((prev) => {
        let hasUpdates = false;
        const next = { ...prev };
        const flashMap: Record<string, "up" | "down"> = {};

        for (const t of tickers) {
          const sym = t.s.toUpperCase();
          const existing = next[sym];
          if (!existing) continue;

          const newPrice = parseFloat(t.p);
          if (!newPrice || isNaN(newPrice) || newPrice === existing.price) continue;

          const rawR = parseFloat(t.r || "0");
          const newChange24h = Math.abs(rawR) <= 1.0 ? rawR * 100 : rawR;
          const direction: "up" | "down" = newPrice > existing.price ? "up" : "down";
          flashMap[sym] = direction;
          hasUpdates = true;

          // Helper to recalculate a POI's dynamic metrics
          const updatePoi = (poi: RadarPoiItem | null): RadarPoiItem | null => {
            if (!poi) return null;
            const isInside = newPrice >= poi.bottom && newPrice <= poi.top;
            const distEntry =
              newPrice > poi.entryPrice
                ? ((newPrice - poi.entryPrice) / newPrice) * 100
                : newPrice < poi.entryPrice
                ? ((poi.entryPrice - newPrice) / newPrice) * 100
                : 0;
            const distMt = (Math.abs(newPrice - poi.meanThreshold) / newPrice) * 100;
            const isBroken = poi.type === "BULLISH" ? newPrice < poi.bottom : newPrice > poi.top;
            const status: PoiStatus = isBroken
              ? "broken"
              : isInside
              ? "testing"
              : poi.status === "mitigated"
              ? "mitigated"
              : "fresh";

            return {
              ...poi,
              currentPrice: newPrice,
              isInsideZone: isInside,
              distanceToEntryPct: distEntry,
              distanceToMtPct: distMt,
              status,
            };
          };

          // Check if newly entered an active POI zone to trigger real-time chime
          const wasInside = existing.nearestPoi?.isInsideZone;
          const updatedNearestPoi = updatePoi(existing.nearestPoi);
          const nowInside = updatedNearestPoi?.isInsideZone;

          if (
            !wasInside &&
            nowInside &&
            audioSettingsRef.current.enabled &&
            audioSettingsRef.current.chimeOnZoneEntry
          ) {
            const now = Date.now();
            const lastTime = lastChimedSymbolTimeRef.current[sym] || 0;
            if (now - lastTime > 30000) {
              lastChimedSymbolTimeRef.current[sym] = now;
              playRadarChime(audioSettingsRef.current);
              setToastMessage(`🚨 ${sym} entered ${updatedNearestPoi?.label || "active POI zone"}!`);
              setTimeout(() => setToastMessage(null), 4000);
            }
          }

          // Automated Paper Trading Limit & Bracket Evaluation on Tick (DEC-142)
          try {
            const paperAcc = loadStoredPaperAccount();
            if (
              paperAcc.orders.some((o) => o.symbol === sym) ||
              paperAcc.positions.some((p) => p.symbol === sym)
            ) {
              const tickRes = evaluatePaperTick(paperAcc, sym, newPrice);
              if (tickRes.filledOrders.length > 0 || tickRes.closedTrades.length > 0) {
                saveStoredPaperAccount(tickRes.state);
                playRadarChime({ soundType: "cyber_blip", volume: 0.8, enabled: true });
                if (tickRes.filledOrders.length > 0) {
                  const ord = tickRes.filledOrders[0];
                  setToastMessage(
                    `⚡ Paper Limit Filled: ${ord.side.toUpperCase()} ${ord.quantity.toFixed(4)} ${ord.symbol} @ $${ord.limitPrice.toFixed(2)}!`
                  );
                } else if (tickRes.closedTrades.length > 0) {
                  const trd = tickRes.closedTrades[0];
                  const pnlSign = trd.realizedPnl >= 0 ? "+" : "";
                  setToastMessage(
                    `🎯 Paper Trade Closed (${trd.exitReason}): ${pnlSign}$${trd.realizedPnl.toFixed(2)} on ${trd.symbol}!`
                  );
                }
                setTimeout(() => setToastMessage(null), 4500);
              }
            }
          } catch {}

          next[sym] = {
            ...existing,
            price: newPrice,
            change24h: newChange24h || existing.change24h,
            high24h: Math.max(existing.high24h, newPrice),
            low24h: existing.low24h > 0 ? Math.min(existing.low24h, newPrice) : newPrice,
            nearestPoi: updatedNearestPoi,
            nearestOb: updatePoi(existing.nearestOb),
            nearestSandwich: updatePoi(existing.nearestSandwich),
            nearestFvg: updatePoi(existing.nearestFvg),
          };
        }

        if (Object.keys(flashMap).length > 0) {
          setPriceFlashing((f) => ({ ...f, ...flashMap }));
          setTimeout(() => {
            if (isMounted) {
              setPriceFlashing((f) => {
                const cleared = { ...f };
                Object.keys(flashMap).forEach((k) => delete cleared[k]);
                return cleared;
              });
            }
          }, 600);
        }

        return hasUpdates ? next : prev;
      });
    };

    mexcWsManager.connect();
    mexcWsManager.subscribeMiniTickers(handleMiniTickers);

    return () => {
      isMounted = false;
      mexcWsManager.unsubscribeMiniTickers(handleMiniTickers);
    };
  }, []);

  // Filter and Sort coins
  const filteredCoins = useMemo(() => {
    return currentCoins
      .map((coin) => {
        const data = radarData[coin.symbol];
        // Select matching POI based on category filter
        let selectedPoi: RadarPoiItem | null = null;
        if (poiCategoryFilter === "order_block") {
          selectedPoi = data?.nearestOb || null;
        } else if (poiCategoryFilter === "sandwich_zone") {
          selectedPoi = data?.nearestSandwich || null;
        } else if (poiCategoryFilter === "fvg") {
          selectedPoi = data?.nearestFvg || null;
        } else {
          selectedPoi = data?.nearestPoi || null;
        }

        return {
          coin,
          data,
          selectedPoi,
        };
      })
      .filter(({ coin, selectedPoi }) => {
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchSym = coin.symbol.toLowerCase().includes(q);
          const matchName = coin.name.toLowerCase().includes(q);
          if (!matchSym && !matchName) return false;
        }

        // Direction filter
        if (directionFilter !== "ALL") {
          if (!selectedPoi || selectedPoi.type !== directionFilter) return false;
        }

        // Only near POIs (< 2.0% proximity or inside zone)
        if (onlyNearPois) {
          if (!selectedPoi) return false;
          if (!selectedPoi.isInsideZone && selectedPoi.distanceToEntryPct > 2.0) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "proximity") {
          const distA = a.selectedPoi?.distanceToEntryPct ?? 999;
          const distB = b.selectedPoi?.distanceToEntryPct ?? 999;
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
  }, [currentCoins, radarData, searchQuery, poiCategoryFilter, directionFilter, onlyNearPois, sortBy]);

  // Exportable items derived from filtered coins
  const exportItems: ExportableRadarItem[] = useMemo(() => {
    return filteredCoins.map(({ coin, data, selectedPoi }) => ({
      symbol: coin.symbol,
      name: coin.name,
      price: data?.price ?? 0,
      change24h: data?.change24h ?? 0,
      volume24h: data?.volume24h ?? 0,
      selectedPoi,
      exchange: selectedPoi?.exchange || data?.exchange || activeExchange,
      exchangeLabel: selectedPoi?.exchangeLabel || (selectedPoi?.exchange ? selectedPoi.exchange.toUpperCase() : undefined),
    }));
  }, [filteredCoins, activeExchange]);

  const exportMeta: RadarExportMeta = useMemo(() => {
    const universeName =
      activeTab === "majors"
        ? "Majors & Volume"
        : activeTab === "memes"
        ? "Top 50 Meme Coins"
        : activeTab === "ai"
        ? "Top 50 AI Coins"
        : "Custom Watchlist";
    const tfMap: Record<string, string> = {
      "15m": "15m",
      "60": "1H",
      "240": "4H",
      "1D": "1D",
    };
    return {
      universeName,
      categoryFilter: poiCategoryFilter,
      timeframe: tfMap[activeTimeframe] || activeTimeframe,
      totalCoins: filteredCoins.length,
    };
  }, [activeTab, poiCategoryFilter, activeTimeframe, filteredCoins.length]);

  const handleExportCsv = () => {
    downloadRadarCsv(exportItems, `mochex-radar-${activeTab}`);
    setToastMessage(`✓ Exported ${exportItems.length} items to CSV`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExportJson = () => {
    downloadRadarJson(exportItems, exportMeta, `mochex-radar-${activeTab}`);
    setToastMessage(`✓ Exported ${exportItems.length} items to JSON`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyClipboard = async () => {
    const ok = await copyRadarToClipboard(exportItems, exportMeta);
    if (ok) {
      setToastMessage(`✓ Copied ${exportItems.length} scanned POIs to clipboard!`);
    } else {
      setToastMessage("Failed to copy to clipboard");
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Aggregate stats
  const totalDetectedPois = useMemo(() => {
    return Object.values(radarData).filter((d) => d.nearestPoi !== null).length;
  }, [radarData]);

  const totalSandwichZones = useMemo(() => {
    return Object.values(radarData).filter((d) => d.nearestSandwich !== null).length;
  }, [radarData]);

  const totalFvgZones = useMemo(() => {
    return Object.values(radarData).filter((d) => d.nearestFvg !== null).length;
  }, [radarData]);

  const totalNearPois = useMemo(() => {
    return Object.values(radarData).filter(
      (d) => d.nearestPoi && (d.nearestPoi.isInsideZone || d.nearestPoi.distanceToEntryPct <= 1.0)
    ).length;
  }, [radarData]);

  // Partition filtered coins into Kanban Lanes
  const kanbanLanes = useMemo(() => {
    const testing: typeof filteredCoins = [];
    const approaching: typeof filteredCoins = [];
    const fresh: typeof filteredCoins = [];
    const mitigated: typeof filteredCoins = [];

    filteredCoins.forEach((item) => {
      const poi = item.selectedPoi;
      if (!poi) return;

      if (poi.isInsideZone || poi.status === "testing") {
        testing.push(item);
      } else if (poi.status === "mitigated") {
        mitigated.push(item);
      } else if (poi.distanceToEntryPct <= 1.5) {
        approaching.push(item);
      } else {
        fresh.push(item);
      }
    });

    return [
      {
        id: "testing",
        title: "Testing In-Zone",
        subtitle: "Active inside POI boundaries",
        accent: "#f59e0b",
        bgBadge: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
        items: testing,
      },
      {
        id: "approaching",
        title: "Approaching (< 1.5%)",
        subtitle: "Imminent reaction setup",
        accent: "#00c087",
        bgBadge: "bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30",
        items: approaching,
      },
      {
        id: "fresh",
        title: "Fresh Setups",
        subtitle: "Untouched institutional zones",
        accent: "#2962ff",
        bgBadge: "bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/30",
        items: fresh,
      },
      {
        id: "mitigated",
        title: "Mitigated / Retested",
        subtitle: "Previously filled or tested",
        accent: "#848e9c",
        bgBadge: "bg-[#848e9c]/15 text-[#848e9c] border border-[#848e9c]/30",
        items: mitigated,
      },
    ];
  }, [filteredCoins]);

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
                Order Blocks & Sandwich Zones ++ (Supply / Demand)
              </div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-1 ml-4 pl-4 border-l border-[#1b2535]">
            <span className="w-2 h-2 rounded-full bg-[#00c087] animate-pulse" />
            <span className="text-[11px] text-[#00c087] font-semibold">
              24/7 Cloud Offline Alarms Active
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-full bg-[#00c087]/10 border border-[#00c087]/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00c087] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00c087]" />
            </span>
            <span className="text-[10px] text-[#00c087] font-bold tracking-tight">
              LIVE WS TICKER
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Audio Chimes Quick Settings Button */}
          <button
            type="button"
            onClick={() => setIsAudioModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
              audioSettings.enabled
                ? "bg-[#121824] border-[#233144] text-[#b6c4ff] hover:text-white hover:bg-[#1a2332]"
                : "bg-[#121824] border-[#ff3b30]/40 text-[#ff3b30] hover:bg-[#1a2332]"
            }`}
            title="Configure Radar Audio Chimes"
          >
            {audioSettings.enabled ? <Volume2 size={13} className="text-[#2962ff]" /> : <VolumeX size={13} />}
            <span className="hidden sm:inline">Audio</span>
            <span className="text-[10px] text-[#848e9c]">
              {audioSettings.enabled ? `${Math.round(audioSettings.volume * 100)}%` : "Muted"}
            </span>
          </button>

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
            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2 flex-wrap">
              <span>Institutional POI Radar</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#2962ff]/20 text-[#2962ff] border border-[#2962ff]/40 flex items-center gap-1">
                <Sparkles size={11} />
                <span>OB + Sandwich ++ + FVG</span>
              </span>
            </h1>
            <p className="text-xs text-[#848e9c] mt-1 max-w-2xl">
              Monitors MEXC pairs for institutional Validated Order Blocks, Fair Value Gaps (FVG), and Sandwich Zones (Supply & Demand with S/R Confluence). Receive 24/7 Discord & Telegram alarms on zone touches.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="p-2.5 rounded-lg bg-[#121824] border border-[#233144] text-center">
              <div className="text-[10px] text-[#848e9c] uppercase font-bold">Monitored Pairs</div>
              <div className="text-base font-bold text-white mt-0.5">{currentCoins.length}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#121824] border border-[#233144] text-center">
              <div className="text-[10px] text-[#b6c4ff] uppercase font-bold">Sandwich Zones</div>
              <div className="text-base font-bold text-[#b6c4ff] mt-0.5">{totalSandwichZones}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#121824] border border-[#233144] text-center">
              <div className="text-[10px] text-amber-400 uppercase font-bold">Fair Value Gaps</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">{totalFvgZones}</div>
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
            {/* Exchange Source Selector (DEC-143) */}
            <div className="flex items-center rounded-lg bg-[#121824] border border-[#233144] p-0.5">
              {[
                { id: "all", short: "All Feeds", title: "All Exchanges Aggregated" },
                { id: "mexc", short: "MEXC", title: "MEXC Spot" },
                { id: "binance", short: "Binance", title: "Binance Futures (USDT-M)" },
                { id: "bybit", short: "Bybit", title: "Bybit Linear Perpetuals" },
              ].map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => setActiveExchange(ex.id as any)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                    activeExchange === ex.id
                      ? "bg-[#2962ff] text-white shadow-xs"
                      : "text-[#848e9c] hover:text-white"
                  }`}
                  title={ex.title}
                >
                  <Globe size={12} className={activeExchange === ex.id ? "text-white" : "text-[#848e9c]"} />
                  <span className="hidden sm:inline">{ex.short}</span>
                </button>
              ))}
            </div>

            {/* View Mode Toggle: Table vs Kanban */}
            <div className="flex items-center rounded-lg bg-[#121824] border border-[#233144] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                  viewMode === "table"
                    ? "bg-[#2962ff] text-white shadow-xs"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Table size={13} />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                  viewMode === "kanban"
                    ? "bg-[#2962ff] text-white shadow-xs"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Kanban size={13} />
                <span className="hidden sm:inline">Kanban</span>
              </button>
            </div>

            {/* POI Category Filter: All vs FVG vs Order Blocks vs Sandwich Zones */}
            <select
              value={poiCategoryFilter}
              onChange={(e) => setPoiCategoryFilter(e.target.value as any)}
              className="bg-[#121824] text-[#d1d4dc] text-xs px-2.5 py-2 rounded-lg border border-[#233144] outline-none cursor-pointer font-bold"
            >
              <option value="ALL">All POIs (FVG + OB + Sandwich)</option>
              <option value="fvg">⚡ Fair Value Gaps (FVG) Only</option>
              <option value="sandwich_zone">🥪 Sandwich Zones ++ (Supply/Demand)</option>
              <option value="order_block">📦 Validated Order Blocks Only</option>
            </select>

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
              <option value="ALL">All Directions</option>
              <option value="BULLISH">Bullish (Demand) Only</option>
              <option value="BEARISH">Bearish (Supply) Only</option>
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

            {/* 1-Click Export Suite */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-[#233144]">
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors cursor-pointer"
                title="Download Scanned POIs as CSV"
              >
                <FileSpreadsheet size={13} className="text-[#00c087]" />
                <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors cursor-pointer"
                title="Download Scanned POIs as JSON"
              >
                <FileJson size={13} className="text-[#2962ff]" />
                <span className="hidden sm:inline">JSON</span>
              </button>
              <button
                type="button"
                onClick={handleCopyClipboard}
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#848e9c] hover:text-white transition-colors cursor-pointer"
                title="Copy Markdown Summary to Clipboard"
              >
                <Copy size={13} className="text-amber-400" />
                <span className="hidden sm:inline">Copy</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. POI RADAR CONTENT (TABLE OR KANBAN) */}
      <main className="flex-1 px-4 sm:px-6 pb-12 max-w-7xl mx-auto w-full">
        {viewMode === "table" ? (
          <div className="bg-[#0e141f] border border-[#1b2535] rounded-xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#1b2535] bg-[#0c1017] text-[#848e9c] uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4 font-bold">Asset / Pair</th>
                    <th className="py-3 px-4 font-bold">Mark Price</th>
                    <th className="py-3 px-4 font-bold">24h Change / Vol</th>
                    <th className="py-3 px-4 font-bold">Detected POI (FVG / OB / Sandwich)</th>
                    <th className="py-3 px-4 font-bold">Zone Range (50% MT/CE)</th>
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
                        <span>Scanning MEXC Order Blocks & Sandwich Zones ++...</span>
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
                  filteredCoins.map(({ coin, data, selectedPoi }) => {
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

                    const isFvg = selectedPoi?.category === "fvg";
                    const isSandwich = selectedPoi?.category === "sandwich_zone";
                    const isBullish = selectedPoi?.type === "BULLISH";

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
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[8px] font-bold border ${
                                    (selectedPoi?.exchange || data?.exchange) === "binance"
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                      : (selectedPoi?.exchange || data?.exchange) === "bybit"
                                      ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
                                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  }`}
                                >
                                  {selectedPoi?.exchangeLabel || (selectedPoi?.exchange ? selectedPoi.exchange.toUpperCase() : data?.exchange ? data.exchange.toUpperCase() : "MEXC")}
                                </span>
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
                        <td className="py-3.5 px-4 font-mono font-bold">
                          <span
                            className={`px-1.5 py-0.5 rounded transition-all duration-200 ${
                              priceFlashing[coin.symbol] === "up"
                                ? "bg-[#00c087]/20 text-[#00c087]"
                                : priceFlashing[coin.symbol] === "down"
                                ? "bg-[#ff3b30]/20 text-[#ff3b30]"
                                : "text-white"
                            }`}
                          >
                            ${formattedPrice}
                          </span>
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

                        {/* 4. DETECTED POI (OB OR SANDWICH ZONE) */}
                        <td className="py-3.5 px-4">
                          {selectedPoi ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Type Tag */}
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    isBullish
                                      ? "bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30"
                                      : "bg-[#ff3b30]/15 text-[#ff3b30] border border-[#ff3b30]/30"
                                  }`}
                                >
                                  {isSandwich
                                    ? isBullish
                                      ? "DEMAND (GRGG)"
                                      : "SUPPLY (RGRR)"
                                    : isFvg
                                    ? isBullish
                                      ? "BULLISH FVG"
                                      : "BEARISH FVG"
                                    : `${selectedPoi.type} OB`}
                                </span>

                                {/* Timeframe */}
                                <span className="px-1.5 py-0.2 rounded bg-[#172233] text-[#b6c4ff] text-[9px] font-bold">
                                  {selectedPoi.timeframe}
                                </span>

                                {/* Sandwich ++ Badge */}
                                {selectedPoi.isPlus && (
                                  <span className="px-1.5 py-0.2 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 text-[8px] font-bold flex items-center gap-0.5">
                                    <Star size={8} className="fill-yellow-400" />
                                    <span>++ S/R</span>
                                  </span>
                                )}
                              </div>

                              <span className="text-[9px] text-[#848e9c] flex items-center gap-1">
                                {isSandwich ? (
                                  <>
                                    <Layers size={10} className="text-[#2962ff]" />
                                    <span>Sandwich Zone (4-Candle)</span>
                                  </>
                                ) : isFvg ? (
                                  <>
                                    <Zap size={10} className="text-amber-400" />
                                    <span>3-Candle Imbalance ({selectedPoi.fvgGapPct?.toFixed(2)}%)</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles size={10} className="text-[#2962ff]" />
                                    <span>+2C FVG Confirmed</span>
                                  </>
                                )}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#848e9c]/60 italic text-[11px]">
                              No active POI on {activeTimeframe}
                            </span>
                          )}
                        </td>

                        {/* 5. ZONE RANGE */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          {selectedPoi ? (
                            <div className="flex flex-col">
                              <span className="text-white font-semibold">
                                ${selectedPoi.bottom.toFixed(2)} - ${selectedPoi.top.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-[#2962ff]">
                                {isFvg ? "50% CE" : "MT"}: ${selectedPoi.meanThreshold.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#848e9c]">—</span>
                          )}
                        </td>

                        {/* 6. PROXIMITY */}
                        <td className="py-3.5 px-4 font-mono">
                          {selectedPoi ? (
                            <div className="flex flex-col gap-1 min-w-[100px]">
                              {selectedPoi.isInsideZone ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00c087]/20 text-[#00c087] border border-[#00c087]/40 font-bold text-[10px] animate-pulse">
                                  <span>TESTING ZONE</span>
                                </span>
                              ) : (
                                <>
                                  <span
                                    className={`font-bold ${
                                      selectedPoi.distanceToEntryPct <= 1.0
                                        ? "text-[#00c087]"
                                        : selectedPoi.distanceToEntryPct <= 2.5
                                        ? "text-[#f5ac37]"
                                        : "text-[#848e9c]"
                                    }`}
                                  >
                                    +{selectedPoi.distanceToEntryPct.toFixed(2)}% to entry
                                  </span>
                                  <div className="w-full bg-[#172233] h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${
                                        selectedPoi.distanceToEntryPct <= 1.0
                                          ? "bg-[#00c087]"
                                          : selectedPoi.distanceToEntryPct <= 2.5
                                          ? "bg-[#f5ac37]"
                                          : "bg-[#2962ff]"
                                      }`}
                                      style={{
                                        width: `${Math.max(
                                          5,
                                          Math.min(100, 100 - selectedPoi.distanceToEntryPct * 15)
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
                            {selectedPoi && (
                              <>
                                <button
                                  onClick={() =>
                                    setPreviewData({
                                      symbol: coin.symbol,
                                      coinName: coin.name,
                                      poi: selectedPoi,
                                      currentPrice: price,
                                      change24h,
                                    })
                                  }
                                  title="Quick Chart Preview"
                                  className="p-1.5 rounded bg-[#121824] hover:bg-[#1a2332] text-[#848e9c] hover:text-[#2962ff] border border-[#233144] transition-colors cursor-pointer"
                                >
                                  <Eye size={13} />
                                </button>

                                <button
                                  onClick={() =>
                                    setAlarmModalData({
                                      symbol: coin.symbol,
                                      poi: selectedPoi,
                                      poisByTimeframe: data?.poisByTimeframe || {},
                                    })
                                  }
                                  title="Set 24/7 Cloud Offline Alarm"
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#2962ff]/15 hover:bg-[#2962ff] text-[#2962ff] hover:text-white border border-[#2962ff]/30 text-[11px] font-bold transition-all cursor-pointer"
                                >
                                  <Bell size={12} />
                                  <span className="hidden sm:inline">Set Alarm</span>
                                </button>

                                <button
                                  onClick={() =>
                                    setPaperTradeModalData({
                                      symbol: coin.symbol,
                                      poi: selectedPoi,
                                      currentPrice: price,
                                    })
                                  }
                                  title={`Arm Automated Paper Trade on ${coin.symbol}`}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#00c087]/15 hover:bg-[#00c087] text-[#00c087] hover:text-black border border-[#00c087]/30 text-[11px] font-bold transition-all cursor-pointer"
                                >
                                  <Zap size={12} className="fill-current" />
                                  <span className="hidden md:inline">Trade</span>
                                </button>
                              </>
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
        ) : (
          /* KANBAN BOARD VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            {kanbanLanes.map((lane) => (
              <div
                key={lane.id}
                className="bg-[#0c1017] border border-[#1b2535] rounded-xl p-3 flex flex-col gap-3 min-h-[480px]"
              >
                {/* Lane Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-[#172233]">
                  <div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: lane.accent }}
                      />
                      <span className="font-bold text-white text-xs tracking-tight">
                        {lane.title}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#848e9c] block mt-0.5">
                      {lane.subtitle}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${lane.bgBadge}`}>
                    {lane.items.length}
                  </span>
                </div>

                {/* Lane Cards */}
                <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[calc(100vh-300px)] pr-0.5">
                  {loading && lane.items.length === 0 ? (
                    <div className="py-12 text-center text-[#848e9c] text-xs">
                      <RefreshCw size={16} className="animate-spin text-[#2962ff] mx-auto mb-2" />
                      <span>Scanning POIs...</span>
                    </div>
                  ) : lane.items.length === 0 ? (
                    <div className="py-12 px-4 rounded-lg bg-[#0e141f]/50 border border-dashed border-[#1f2c3f] text-center text-[#848e9c]/60 text-[11px]">
                      No pairs in this status
                    </div>
                  ) : (
                    lane.items.map(({ coin, data, selectedPoi }) => {
                      if (!selectedPoi) return null;
                      const price = data?.price || selectedPoi.currentPrice;
                      const change24h = data?.change24h || 0;
                      const isPositive = change24h >= 0;

                      const formattedPrice =
                        price >= 1
                          ? price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : price.toFixed(4);

                      const isFvg = selectedPoi.category === "fvg";
                      const isSandwich = selectedPoi.category === "sandwich_zone";
                      const isBullish = selectedPoi.type === "BULLISH";

                      return (
                        <div
                          key={coin.symbol}
                          className="p-3 rounded-lg bg-[#0e141f] border border-[#1b2535] hover:border-[#2962ff]/60 transition-all flex flex-col gap-2 shadow-xs group"
                        >
                          {/* Asset Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <Link
                                  href={`/chart?symbol=${coin.symbol}`}
                                  className="font-bold text-white text-xs hover:text-[#2962ff] transition-colors"
                                >
                                  {coin.symbol.replace("USDT", "/USDT")}
                                </Link>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[8px] font-bold border ${
                                    (selectedPoi.exchange || data?.exchange) === "binance"
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                      : (selectedPoi.exchange || data?.exchange) === "bybit"
                                      ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
                                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  }`}
                                >
                                  {selectedPoi.exchangeLabel || (selectedPoi.exchange ? selectedPoi.exchange.toUpperCase() : data?.exchange ? data.exchange.toUpperCase() : "MEXC")}
                                </span>
                              </div>
                              <span className="text-[10px] text-[#848e9c] truncate max-w-[120px]">
                                {coin.name}
                              </span>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-xs font-bold ${
                                  isPositive ? "text-[#00c087]" : "text-[#ff3b30]"
                                }`}
                              >
                                {isPositive ? "+" : ""}
                                {change24h.toFixed(2)}%
                              </span>
                              <span
                                className={`text-[10px] block font-mono font-bold transition-all duration-200 ${
                                  priceFlashing[coin.symbol] === "up"
                                    ? "text-[#00c087]"
                                    : priceFlashing[coin.symbol] === "down"
                                    ? "text-[#ff3b30]"
                                    : "text-[#848e9c]"
                                }`}
                              >
                                ${formattedPrice}
                              </span>
                            </div>
                          </div>

                          {/* POI Tag & Status */}
                          <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-[#172233]">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  isBullish
                                    ? "bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30"
                                    : "bg-[#ff3b30]/15 text-[#ff3b30] border border-[#ff3b30]/30"
                                }`}
                              >
                                {isSandwich
                                  ? isBullish
                                    ? "DEMAND (GRGG)"
                                    : "SUPPLY (RGRR)"
                                  : isFvg
                                  ? isBullish
                                    ? "BULL FVG"
                                    : "BEAR FVG"
                                  : `${selectedPoi.type} OB`}
                              </span>

                              <span className="px-1.5 py-0.2 rounded bg-[#172233] text-[#b6c4ff] text-[9px] font-bold">
                                {selectedPoi.timeframe}
                              </span>

                              {selectedPoi.isPlus && (
                                <span className="px-1.5 py-0.2 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 text-[8px] font-bold flex items-center gap-0.5">
                                  <Star size={8} className="fill-yellow-400" />
                                  <span>++</span>
                                </span>
                              )}
                            </div>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                selectedPoi.isInsideZone
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse"
                                  : selectedPoi.distanceToEntryPct <= 1.5
                                  ? "bg-[#00c087]/20 text-[#00c087] border border-[#00c087]/40"
                                  : "bg-[#172233] text-[#848e9c]"
                              }`}
                            >
                              {selectedPoi.isInsideZone
                                ? "IN ZONE"
                                : `${selectedPoi.distanceToEntryPct.toFixed(2)}%`}
                            </span>
                          </div>

                          {/* Zone Boundaries */}
                          <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-[#0c1017] p-2 rounded border border-[#172233] font-mono">
                            <div>
                              <span className="text-[#848e9c] text-[9px] block">Entry Level</span>
                              <span className="text-white font-semibold">
                                ${selectedPoi.entryPrice.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#2962ff] text-[9px] block">
                                {isFvg ? "50% CE" : "50% MT"}
                              </span>
                              <span className="text-[#b6c4ff] font-semibold">
                                ${selectedPoi.meanThreshold.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <button
                              onClick={() =>
                                setPreviewData({
                                  symbol: coin.symbol,
                                  coinName: coin.name,
                                  poi: selectedPoi,
                                  currentPrice: price,
                                  change24h,
                                })
                              }
                              title="Quick Chart Preview"
                              className="p-1.5 rounded-lg bg-[#121824] hover:bg-[#1a2332] text-[#848e9c] hover:text-[#2962ff] border border-[#233144] transition-colors cursor-pointer"
                            >
                              <Eye size={12} />
                            </button>

                            <button
                              onClick={() =>
                                setAlarmModalData({
                                  symbol: coin.symbol,
                                  poi: selectedPoi,
                                  poisByTimeframe: data?.poisByTimeframe || {},
                                })
                              }
                              className="flex-1 py-1.5 px-2 rounded-lg bg-[#2962ff]/15 hover:bg-[#2962ff] text-[#2962ff] hover:text-white border border-[#2962ff]/30 text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                            >
                              <Bell size={11} />
                              <span>24/7 Cloud Alarm</span>
                            </button>

                            <button
                              onClick={() =>
                                setPaperTradeModalData({
                                  symbol: coin.symbol,
                                  poi: selectedPoi,
                                  currentPrice: price,
                                })
                              }
                              title={`Arm Paper Trade on ${coin.symbol}`}
                              className="p-1.5 rounded-lg bg-[#00c087]/15 hover:bg-[#00c087] text-[#00c087] hover:text-black border border-[#00c087]/30 transition-colors cursor-pointer"
                            >
                              <Zap size={12} className="fill-current" />
                            </button>

                            <Link
                              href={`/chart?symbol=${coin.symbol}`}
                              title="Open in Terminal"
                              className="p-1.5 rounded-lg bg-[#121824] hover:bg-[#1a2332] text-[#848e9c] hover:text-white border border-[#233144] transition-colors"
                            >
                              <ExternalLink size={12} />
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 5. POI ALARM CONFIGURATION MODAL */}
      {alarmModalData && (
        <PoiAlarmModal
          isOpen={Boolean(alarmModalData)}
          onClose={() => setAlarmModalData(null)}
          symbol={alarmModalData.symbol}
          poi={alarmModalData.poi}
          availablePoisByTimeframe={alarmModalData.poisByTimeframe}
          onSuccess={(count) => {
            setToastMessage(`Created ${count} 24/7 Cloud POI Alarm(s)!`);
            setTimeout(() => setToastMessage(null), 4000);
          }}
        />
      )}

      {/* 6. POI QUICK CHART PREVIEW DRAWER */}
      {previewData && (
        <PoiQuickPreviewDrawer
          isOpen={Boolean(previewData)}
          onClose={() => setPreviewData(null)}
          symbol={previewData.symbol}
          coinName={previewData.coinName}
          poi={previewData.poi}
          currentPrice={previewData.currentPrice}
          change24h={previewData.change24h}
          onOpenAlarmModal={() => {
            const sym = previewData.symbol;
            const coinData = radarData[sym];
            setAlarmModalData({
              symbol: sym,
              poi: previewData.poi,
              poisByTimeframe: coinData?.poisByTimeframe || {},
            });
          }}
          onOpenPaperTradeModal={() => {
            setPaperTradeModalData({
              symbol: previewData.symbol,
              poi: previewData.poi,
              currentPrice: previewData.currentPrice,
            });
          }}
        />
      )}

      {/* 7. RADAR AUDIO SETTINGS MODAL */}
      <RadarAudioSettingsModal
        isOpen={isAudioModalOpen}
        onClose={() => setIsAudioModalOpen(false)}
      />

      {/* 8. POI PAPER TRADE MODAL (DEC-142) */}
      {paperTradeModalData && (
        <PoiPaperTradeModal
          isOpen={Boolean(paperTradeModalData)}
          onClose={() => setPaperTradeModalData(null)}
          poi={paperTradeModalData.poi}
          currentPrice={paperTradeModalData.currentPrice}
          onSuccess={(msg) => {
            setToastMessage(`⚡ ${msg}`);
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
