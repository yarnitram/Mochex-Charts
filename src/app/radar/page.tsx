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
  Send,
  ShieldAlert,
  FileSpreadsheet,
  FileJson,
  Copy,
  Globe,
  Target,
  Key,
  ScrollText,
} from "lucide-react";
import {
  SupportedExchange,
  ExchangeFilter,
  SUPPORTED_EXCHANGES,
} from "@/lib/screener/multi-exchange-client";
import { PoiHistoricalMetrics } from "@/lib/indicators/poi-backtest-metrics";
import {
  getUniverseCoins,
  RadarUniverseTab,
  CuratedCoin,
  MAJORS_UNIVERSE,
  TOP_150_MEMES,
  TOP_150_AI,
} from "@/lib/screener/universe-catalog";
import {
  RadarPoiItem,
  PoiCategory,
  PoiDirection,
  PoiStatus,
  formatPoiPrice,
  getPoiZoneRange,
} from "@/lib/indicators/radar-poi-engine";
import { detectPoiInvalidationBreak } from "@/lib/indicators/poi-invalidation-engine";
import { PoiAlarmModal } from "@/components/radar/PoiAlarmModal";
import { PoiBulkAlarmModal, CandidateCoinForBulkAlarm } from "@/components/radar/PoiBulkAlarmModal";
import { PriceAlert, isPoiPriceAlert } from "@/lib/alerts/alerts-engine";
import { loadClientAlerts, syncAlerts } from "@/lib/alerts/alerts-sync";

import { PortfolioRiskHeatSummary, evaluatePortfolioRiskHeat, ScannedCandidateForRisk, PoiCorrelationRiskInfo } from "@/lib/indicators/portfolio-risk-engine";
import { BrokerCredentialsModal } from "@/components/terminal/BrokerCredentialsModal";
import { PoiLiveTradeModal } from "@/components/radar/PoiLiveTradeModal";
import { AlertChannelsModal } from "@/components/terminal/AlertChannelsModal";
import { AlertWebhookConfig } from "@/lib/alerts/webhook-dispatcher";
import { loadClientWebhooks, syncWebhooks } from "@/lib/alerts/webhooks-sync";
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

function formatZonePrice(val: number): string {
  if (val >= 100) return val.toFixed(2);
  if (val >= 1) return val.toFixed(2);
  if (val >= 0.01) return val.toFixed(4);
  return val.toFixed(6);
}

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
  metrics?: PoiHistoricalMetrics | null;
  correlation?: PoiCorrelationRiskInfo | null;
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

  // Multi-Timeframe filter for detection: 15m, 30m, 1H (60), 2H (120), 4H (240), 1D, 1W (DEC-151, DEC-164)
  const ALL_RADAR_TIMEFRAMES = ["15m", "30", "60", "120", "240", "1D", "1W"];

  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("mochex:radar_selected_timeframes");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return ["15m", "30", "60", "120", "240", "1D", "1W"];
  });

  const toggleTimeframe = (tfVal: string) => {
    setSelectedTimeframes((prev) => {
      let next: string[];
      if (prev.includes(tfVal)) {
        next = prev.length > 1 ? prev.filter((t) => t !== tfVal) : prev;
      } else {
        next = [...prev, tfVal];
      }
      try {
        localStorage.setItem("mochex:radar_selected_timeframes", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const selectAllTimeframes = () => {
    const all = ["15m", "30", "60", "120", "240", "1D", "1W"];
    setSelectedTimeframes(all);
    try {
      localStorage.setItem("mochex:radar_selected_timeframes", JSON.stringify(all));
    } catch {}
  };

  // Active Exchange Filter: "all" | "mexc" | "binance" | "bybit" (DEC-143)
  const [activeExchange, setActiveExchange] = useState<ExchangeFilter>("mexc");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [poiCategoryFilter, setPoiCategoryFilter] = useState<
    "ALL" | "confluence" | "sweep" | "liquidity" | "broken" | "absorption" | "risk_cluster" | "has_alarms" | PoiCategory
  >("ALL");
  const [directionFilter, setDirectionFilter] = useState<"ALL" | PoiDirection>("ALL");
  const [onlyNearPois, setOnlyNearPois] = useState(false);
  const [sortBy, setSortBy] = useState<
    "proximity" | "correlation" | "confluence" | "liquidity" | "volume" | "change" | "winrate" | "imbalance"
  >("proximity");

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

  // Alert Channels Webhook Modal State (DEC-154)
  // Portfolio Risk Heat & Sector Exposure State (DEC-155)
  const [portfolioRiskSummary, setPortfolioRiskSummary] = useState<PortfolioRiskHeatSummary | null>(null);
  const [isRiskDrawerOpen, setIsRiskDrawerOpen] = useState(false);
  const [isChannelsModalOpen, setIsChannelsModalOpen] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState<AlertWebhookConfig>(loadClientWebhooks);

  useEffect(() => {
    // 1. Initial hydration from client storage immediately
    setWebhookConfig(loadClientWebhooks());

    // 2. Non-destructive sync with server
    syncWebhooks().then((synced) => {
      setWebhookConfig(synced);
    }).catch(() => {});

    const handleWebhooksUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<AlertWebhookConfig>;
      if (customEvent.detail) {
        setWebhookConfig(customEvent.detail);
      } else {
        setWebhookConfig(loadClientWebhooks());
      }
    };
    window.addEventListener("mochex:webhooks-updated", handleWebhooksUpdated);
    return () => {
      window.removeEventListener("mochex:webhooks-updated", handleWebhooksUpdated);
    };
  }, []);

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

  // Active Server Alerts & Bulk Alarm State (DEC-157)
  const [activeAlerts, setActiveAlerts] = useState<PriceAlert[]>([]);
  const [isBulkAlarmModalOpen, setIsBulkAlarmModalOpen] = useState(false);

  const fetchActiveAlerts = useCallback(() => {
    syncAlerts((merged) => {
      setActiveAlerts(merged);
    });
  }, []);

  useEffect(() => {
    const saved = loadClientAlerts();
    if (saved.length > 0) {
      setActiveAlerts(saved);
    }
    fetchActiveAlerts();
    const handleAlertsUpdated = () => fetchActiveAlerts();
    window.addEventListener("mochex:alerts-updated", handleAlertsUpdated);
    window.addEventListener("focus", handleAlertsUpdated);
    const interval = setInterval(fetchActiveAlerts, 15000);
    return () => {
      window.removeEventListener("mochex:alerts-updated", handleAlertsUpdated);
      window.removeEventListener("focus", handleAlertsUpdated);
      clearInterval(interval);
    };
  }, [fetchActiveAlerts]);

  // Index active alerts by normalized symbol
  const alertsBySymbol = useMemo(() => {
    const map: Record<string, PriceAlert[]> = {};
    for (const a of activeAlerts) {
      if (!a.active) continue;
      const key = a.symbol.toUpperCase().replace(/[\/\-_]/g, "");
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [activeAlerts]);

  // Helper to identify radar POI alerts vs standard chart alerts (DEC-158)
  const isRadarAlert = useCallback((a: PriceAlert) => {
    return isPoiPriceAlert(a);
  }, []);

  const radarAlerts = useMemo(() => {
    return activeAlerts.filter(isRadarAlert);
  }, [activeAlerts, isRadarAlert]);

  const activeRadarAlertsCount = useMemo(() => {
    return radarAlerts.filter((a) => a.active).length;
  }, [radarAlerts]);

  const radarCoinsCount = useMemo(() => {
    return Object.keys(alertsBySymbol).length;
  }, [alertsBySymbol]);

  // Multi-Broker Direct Execution States (DEC-156)
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
  const [hasActiveBroker, setHasActiveBroker] = useState(false);
  const [liveTradeModalData, setLiveTradeModalData] = useState<{
    symbol: string;
    poi: RadarPoiItem;
  } | null>(null);

  const checkBrokerCredentials = useCallback(() => {
    fetch("/api/broker/credentials")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.credentials) {
          const keys = Object.keys(data.credentials);
          setHasActiveBroker(keys.length > 0);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkBrokerCredentials();
  }, [checkBrokerCredentials]);

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

  // Load custom symbols & saved multi-timeframe selection on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mochex:radar_custom_symbols");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCustomSymbols(parsed);
        }
      }
      const savedTfs = localStorage.getItem("mochex:radar_selected_timeframes");
      if (savedTfs) {
        const parsedTfs = JSON.parse(savedTfs);
        if (Array.isArray(parsedTfs) && parsedTfs.length > 0) {
          setSelectedTimeframes(parsedTfs);
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

  // Fetch Radar POI detections from API across all 4 institutional timeframes
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
          timeframes: ["1W", "1D", "240", "120", "60", "30", "15m"],
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
          try {
            sessionStorage.setItem("mochex:radar_cached_pois", JSON.stringify(data.results));
          } catch {}
          if (data.portfolioRisk) {
            setPortfolioRiskSummary(data.portfolioRisk);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch radar POIs:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentCoins, activeExchange]);

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

            const breakTelemetry = isBroken
              ? poi.breakTelemetry || detectPoiInvalidationBreak(poi, newPrice)
              : null;

            return {
              ...poi,
              currentPrice: newPrice,
              isInsideZone: isInside,
              distanceToEntryPct: distEntry,
              distanceToMtPct: distMt,
              status,
              breakTelemetry,
            };
          };

          // Check if newly entered an active POI zone to trigger real-time chime
          const wasInside = existing.nearestPoi?.isInsideZone;
          const wasBroken = existing.nearestPoi?.status === "broken";
          const updatedNearestPoi = updatePoi(existing.nearestPoi);
          const nowInside = updatedNearestPoi?.isInsideZone;
          const nowBroken = updatedNearestPoi?.status === "broken";

          // POI Invalidation Real-Time Trigger (DEC-150)
          if (!wasBroken && nowBroken && updatedNearestPoi) {
            const telemetry = updatedNearestPoi.breakTelemetry || detectPoiInvalidationBreak(updatedNearestPoi, newPrice);
            if (telemetry) {
              updatedNearestPoi.breakTelemetry = telemetry;
              playRadarChime({ soundType: "urgent_warning", volume: 0.9, enabled: true });
              setToastMessage(`🚨 POI INVALIDATED: ${sym} ${updatedNearestPoi.label} broken (-${telemetry.overshootPct}%)!`);
              setTimeout(() => setToastMessage(null), 5000);
            }
          }

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
        const isAllSelected = selectedTimeframes.length >= 7;
        // Gather POIs from the user's selected timeframes (sorted by closest proximity)
        const activeTfPois = selectedTimeframes
          .flatMap((tf) => {
            const direct = data?.poisByTimeframe?.[tf];
            if (Array.isArray(direct) && direct.length > 0) return direct;
            const altKey = tf === "60" ? "1H" : tf === "240" ? "4H" : tf === "120" ? "2H" : tf === "30" ? "30m" : tf === "1W" ? "1w" : tf;
            return data?.poisByTimeframe?.[altKey] || [];
          })
          .sort((a, b) => a.distanceToEntryPct - b.distanceToEntryPct);
        const fallbackAllPois = Object.values(data?.poisByTimeframe || {}).flat();
        const candidatePois =
          activeTfPois.length > 0
            ? activeTfPois
            : isAllSelected
            ? fallbackAllPois
            : [];

        // Select matching POI based on category filter & selected timeframes
        let selectedPoi: RadarPoiItem | null = null;
        if (poiCategoryFilter === "order_block") {
          selectedPoi =
            candidatePois.find((p) => p.category === "order_block") ||
            (isAllSelected ? data?.nearestOb || null : null);
        } else if (poiCategoryFilter === "sandwich_zone") {
          selectedPoi =
            candidatePois.find((p) => p.category === "sandwich_zone") ||
            (isAllSelected ? data?.nearestSandwich || null : null);
        } else if (poiCategoryFilter === "fvg") {
          selectedPoi =
            candidatePois.find((p) => p.category === "fvg") ||
            (isAllSelected ? data?.nearestFvg || null : null);
        } else if (poiCategoryFilter === "sweep") {
          selectedPoi =
            candidatePois.find((p) => p.sweep || p.status === "sweep") ||
            (isAllSelected && data?.nearestPoi?.sweep ? data.nearestPoi : null);
        } else if (poiCategoryFilter === "liquidity") {
          const sortedByLiq = [...candidatePois].sort(
            (a, b) => (b.liquidity?.densityPercentile ?? 0) - (a.liquidity?.densityPercentile ?? 0)
          );
          selectedPoi =
            sortedByLiq[0] || (isAllSelected ? data?.nearestPoi || null : null);
        } else if (poiCategoryFilter === "broken") {
          selectedPoi =
            candidatePois.find((p) => p.status === "broken" || Boolean(p.breakTelemetry)) ||
            (isAllSelected && data?.nearestPoi?.status === "broken"
              ? data.nearestPoi
              : null);
        } else if (poiCategoryFilter === "absorption") {
          const sortedByAbs = [...candidatePois].sort(
            (a, b) => (b.orderFlow?.absorptionScore ?? 0) - (a.orderFlow?.absorptionScore ?? 0)
          );
          selectedPoi =
            sortedByAbs[0] || (isAllSelected ? data?.nearestPoi || null : null);
        } else if (poiCategoryFilter === "risk_cluster") {
          const sortedByRisk = [...candidatePois].sort(
            (a, b) => (b.correlation?.clusterExposureScore ?? 0) - (a.correlation?.clusterExposureScore ?? 0)
          );
          selectedPoi =
            sortedByRisk[0] || (isAllSelected ? data?.nearestPoi || null : null);
        } else if (poiCategoryFilter === "confluence") {
          const sortedByConf = [...candidatePois].sort(
            (a, b) => (b.confluence?.score ?? 0) - (a.confluence?.score ?? 0)
          );
          selectedPoi =
            sortedByConf[0] || (isAllSelected ? data?.nearestPoi || null : null);
        } else {
          selectedPoi =
            candidatePois[0] || (isAllSelected ? data?.nearestPoi || null : null);
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

        // Confluence filter (DEC-146)
        if (poiCategoryFilter === "confluence") {
          if (!selectedPoi || !selectedPoi.confluence || selectedPoi.confluence.score < 2) return false;
        }

        // Sweep filter
        if (poiCategoryFilter === "sweep") {
          if (!selectedPoi || (!selectedPoi.sweep && selectedPoi.status !== "sweep")) return false;
        }

        // Liquidity Density filter (DEC-149)
        if (poiCategoryFilter === "liquidity") {
          if (!selectedPoi || !selectedPoi.liquidity || selectedPoi.liquidity.densityPercentile < 70) return false;
        }

        // Invalidation / Broken filter (DEC-150)
        if (poiCategoryFilter === "broken") {
          if (!selectedPoi || (selectedPoi.status !== "broken" && !selectedPoi.breakTelemetry)) return false;
        }

        // Order Flow Absorption filter (DEC-153)
        if (poiCategoryFilter === "absorption") {
          if (!selectedPoi || !selectedPoi.orderFlow || !selectedPoi.orderFlow.isAbsorptionConfirmed) return false;
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
        if (sortBy === "confluence") {
          const confA = a.selectedPoi?.confluence?.score || 0;
          const confB = b.selectedPoi?.confluence?.score || 0;
          if (confB !== confA) return confB - confA;
          const distA = a.selectedPoi?.distanceToEntryPct ?? 999;
          const distB = b.selectedPoi?.distanceToEntryPct ?? 999;
          return distA - distB;
        }
        if (sortBy === "liquidity") {
          const liqA = a.selectedPoi?.liquidity?.densityPercentile ?? 0;
          const liqB = b.selectedPoi?.liquidity?.densityPercentile ?? 0;
          if (liqB !== liqA) return liqB - liqA;
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
        if (sortBy === "winrate") {
          const wrA = a.selectedPoi?.metrics?.winRatePct ?? -1;
          const wrB = b.selectedPoi?.metrics?.winRatePct ?? -1;
          return wrB - wrA;
        }
        if (sortBy === "correlation") {
          const corrA = a.selectedPoi?.correlation?.btcCorrelation ?? 0;
          const corrB = b.selectedPoi?.correlation?.btcCorrelation ?? 0;
          if (corrB !== corrA) return corrB - corrA;
          const distA = a.selectedPoi?.distanceToEntryPct ?? 999;
          const distB = b.selectedPoi?.distanceToEntryPct ?? 999;
          return distA - distB;
        }
        if (sortBy === "imbalance") {
          const imbA = a.selectedPoi?.orderFlow?.absorptionScore ?? 0;
          const imbB = b.selectedPoi?.orderFlow?.absorptionScore ?? 0;
          if (imbB !== imbA) return imbB - imbA;
          const distA = a.selectedPoi?.distanceToEntryPct ?? 999;
          const distB = b.selectedPoi?.distanceToEntryPct ?? 999;
          return distA - distB;
        }
        return 0;
      });
  }, [currentCoins, radarData, searchQuery, poiCategoryFilter, directionFilter, onlyNearPois, sortBy, selectedTimeframes, alertsBySymbol]);



  const currentUniverseLabel =
    activeTab === "majors"
      ? "Majors & Volume (Futures)"
      : activeTab === "memes"
      ? "Top 150 Meme Futures"
      : activeTab === "ai"
      ? "Top 150 AI Futures"
      : "Custom Watchlist";

  // Candidate coins for bulk alarm setup across current universe (DEC-158)
  const candidateCoinsForBulk: CandidateCoinForBulkAlarm[] = useMemo(() => {
    const list: CandidateCoinForBulkAlarm[] = [];
    for (const coin of currentCoins) {
      const data = radarData[coin.symbol];
      if (!data) continue;
      const allPois: RadarPoiItem[] = [];
      Object.values(data?.poisByTimeframe || {}).forEach((tPois) => {
        if (Array.isArray(tPois)) allPois.push(...tPois);
      });
      if (allPois.length > 0 || data.nearestPoi || data.nearestOb || data.nearestSandwich || data.nearestFvg) {
        list.push({
          symbol: coin.symbol,
          name: coin.name,
          price: data.price || 0,
          pois: allPois.length > 0 ? allPois : (data.nearestPoi ? [data.nearestPoi] : []),
          poisByTimeframe: data.poisByTimeframe || {},
        });
      }
    }
    return list;
  }, [currentCoins, radarData]);

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
        ? "Majors & Volume (Futures)"
        : activeTab === "memes"
        ? "Top 150 Meme Futures"
        : activeTab === "ai"
        ? "Top 150 AI Futures"
        : "Custom Watchlist";
    const tfMap: Record<string, string> = {
      "15m": "15m",
      "30": "30m",
      "30m": "30m",
      "60": "1H",
      "1H": "1H",
      "120": "2H",
      "2H": "2H",
      "240": "4H",
      "4H": "4H",
      "1D": "1D",
      "1W": "1W",
    };
    const formattedTfs = selectedTimeframes.map((tf) => tfMap[tf] || tf).join("+");
    return {
      universeName,
      categoryFilter: poiCategoryFilter,
      timeframe: formattedTfs || "All TFs",
      totalCoins: filteredCoins.length,
    };
  }, [activeTab, poiCategoryFilter, selectedTimeframes, filteredCoins.length]);

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


  // Live Portfolio Risk Heat & Skew Recalculation (DEC-155)
  const livePortfolioRisk = useMemo(() => {
    if (filteredCoins.length === 0) return portfolioRiskSummary;
    const btcCoin = filteredCoins.find((c) => c.coin.symbol === "BTCUSDT");
    const candidates: ScannedCandidateForRisk[] = filteredCoins.map((fc) => ({
      symbol: fc.coin.symbol,
      direction: fc.selectedPoi?.type || null,
      distancePct: fc.selectedPoi?.distanceToEntryPct,
      isInZone: fc.selectedPoi?.isInsideZone,
      change24h: fc.data?.change24h || 0,
      btcCorrelation: fc.selectedPoi?.correlation?.btcCorrelation,
    }));
    return evaluatePortfolioRiskHeat(candidates, btcCoin?.data?.change24h || 0);
  }, [filteredCoins, portfolioRiskSummary]);
  // Partition filtered coins into Kanban Lanes
  const kanbanLanes = useMemo(() => {
    const sweeps: typeof filteredCoins = [];
    const testing: typeof filteredCoins = [];
    const approaching: typeof filteredCoins = [];
    const fresh: typeof filteredCoins = [];
    const broken: typeof filteredCoins = [];
    const mitigated: typeof filteredCoins = [];

    filteredCoins.forEach((item) => {
      const poi = item.selectedPoi;
      if (!poi) return;

      if (poi.status === "broken" || Boolean(poi.breakTelemetry)) {
        broken.push(item);
      } else if (poi.status === "sweep" || Boolean(poi.sweep)) {
        sweeps.push(item);
      } else if (poi.isInsideZone || poi.status === "testing") {
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
        id: "sweeps",
        title: "🧹 Liquidity Sweeps",
        subtitle: "Fakeouts & Reversal Traps",
        accent: "#a855f7",
        bgBadge: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
        items: sweeps,
      },
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
        id: "broken",
        title: "🚨 Invalidation / Broken",
        subtitle: "Stop-out & breached setups",
        accent: "#ef4444",
        bgBadge: "bg-red-500/15 text-red-400 border border-red-500/30",
        items: broken,
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

          {/* Alert Channels (Discord & Telegram) Quick Settings Button */}
          <button
            type="button"
            onClick={() => setIsChannelsModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
              webhookConfig.discordEnabled || webhookConfig.telegramEnabled
                ? "bg-[#121824] border-[#5865F2]/50 text-[#b6c4ff] hover:text-white hover:bg-[#1a2332]"
                : "bg-[#121824] border-[#233144] text-[#848e9c] hover:text-white hover:bg-[#1a2332]"
            }`}
            title="Configure Discord Webhook & Telegram Bot Channels"
          >
            <Send size={13} className="text-[#5865F2]" />
            <span className="hidden sm:inline">Channels</span>
            <div className="flex items-center gap-1">
              {webhookConfig.discordEnabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#5865F2]" title="Discord Active" />
              )}
              {webhookConfig.telegramEnabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#229ED9]" title="Telegram Active" />
              )}
            </div>
          </button>


          {/* Bulk Alarm Trigger Button (DEC-157) */}
          <button
            type="button"
            onClick={() => setIsBulkAlarmModalOpen(true)}
            disabled={candidateCoinsForBulk.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer disabled:opacity-40 ${
              candidateCoinsForBulk.length > 0
                ? "bg-amber-500/15 border-amber-500/50 text-amber-300 hover:bg-amber-500 hover:text-black shadow-md shadow-amber-500/10"
                : "bg-[#121824] border-[#233144] text-[#848e9c]"
            }`}
            title={`Bulk Arm 24/7 Cloud Alarms across ${candidateCoinsForBulk.length} matching coins`}
          >
            <Zap size={13} className="fill-current text-amber-400" />
            <span className="hidden sm:inline">Bulk Alarm</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-mono font-bold">
              {candidateCoinsForBulk.length}
            </span>
          </button>

          {/* Direct link to Dedicated Radar Alerts Dashboard (DEC-158) */}
          <Link
            href="/radar/alerts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black font-bold text-xs transition-all shadow-md shadow-amber-500/10 cursor-pointer"
            title="Open Dedicated Radar 24/7 Cloud Alarms Dashboard"
          >
            <Bell size={13} className="text-amber-400 fill-amber-400" />
            <span className="hidden sm:inline">Radar Alarms</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-mono font-extrabold">
              {radarAlerts.length}
            </span>
            <ExternalLink size={11} className="opacity-70" />
          </Link>

          {/* Direct link to Notification & Discord Delivery Logs (DEC-166) */}
          <Link
            href="/radar/logs"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] hover:border-[#5865F2]/50 text-[#b6c4ff] hover:text-white font-bold text-xs transition-colors cursor-pointer"
            title="Inspect 24/7 Server Alert & Discord Delivery Logs"
          >
            <ScrollText size={13} className="text-[#5865F2]" />
            <span className="hidden sm:inline">Logs</span>
          </Link>

          {/* Multi-Broker Direct Execution Modal Button (DEC-156) */}
          <button
            type="button"
            onClick={() => setIsBrokerModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
              hasActiveBroker
                ? "bg-[#121824] border-emerald-500/50 text-emerald-300 hover:text-white hover:bg-[#1a2332]"
                : "bg-[#121824] border-[#233144] text-[#848e9c] hover:text-white hover:bg-[#1a2332]"
            }`}
            title="Configure Broker API Keys (MEXC, Binance, Bybit)"
          >
            <Key size={13} className={hasActiveBroker ? "text-emerald-400" : "text-amber-400"} />
            <span className="hidden sm:inline">Broker</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasActiveBroker ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              }`}
              title={hasActiveBroker ? "Broker API Active" : "No Broker Configured"}
            />
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 shrink-0">
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
            {/* Portfolio Risk Heat Monitor Card (DEC-155) */}
            <button
              type="button"
              onClick={() => setIsRiskDrawerOpen((prev) => !prev)}
              className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                isRiskDrawerOpen
                  ? "bg-[#162032] border-[#2962ff] shadow-md shadow-[#2962ff]/20"
                  : "bg-[#121824] border-[#233144] hover:border-[#2962ff]/50"
              }`}
              title="Click to toggle Portfolio Risk & Sector Heat Monitor"
            >
              <div className="text-[10px] text-amber-400 uppercase font-bold flex items-center gap-1">
                <ShieldAlert size={11} />
                <span>Risk Heat</span>
              </div>
              <div className="text-sm font-extrabold mt-0.5 flex items-center gap-1">
                <span
                  className={
                    livePortfolioRisk?.riskTier === "EXTREME"
                      ? "text-rose-400 font-black animate-pulse"
                      : livePortfolioRisk?.riskTier === "ELEVATED"
                      ? "text-amber-400 font-bold"
                      : livePortfolioRisk?.riskTier === "MODERATE"
                      ? "text-cyan-400 font-bold"
                      : "text-emerald-400 font-bold"
                  }
                >
                  {livePortfolioRisk?.overallRiskScore ?? 28}% {livePortfolioRisk?.riskTier ?? "LOW"}
                </span>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* 2.5 INTERACTIVE PORTFOLIO RISK & SECTOR HEAT MONITOR PANEL (DEC-155) */}
      {isRiskDrawerOpen && livePortfolioRisk && (
        <section className="bg-[#0b1019] border-b border-[#1b2535] px-4 sm:px-6 py-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-w-7xl mx-auto flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Portfolio Risk & Sector Exposure Monitor</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-extrabold border ${
                        livePortfolioRisk.riskTier === "EXTREME"
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
                          : livePortfolioRisk.riskTier === "ELEVATED"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : livePortfolioRisk.riskTier === "MODERATE"
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      }`}
                    >
                      {livePortfolioRisk.overallRiskScore}/100 {livePortfolioRisk.riskTier} RISK
                    </span>
                  </h2>
                  <p className="text-[11px] text-[#848e9c]">
                    Real-time market directional skew, BTC correlation clustering, and sector concurrence telemetry to prevent correlated multi-asset drawdowns.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-[#848e9c]">
                  <span>Avg BTC Correlation:</span>
                  <strong className="text-white">ρ +{livePortfolioRisk.averageBtcCorrelation.toFixed(2)}</strong>
                </div>
                <div className="flex items-center gap-1.5 text-[#848e9c]">
                  <span>Concurrent In-Zone:</span>
                  <strong className="text-amber-400 font-bold">{livePortfolioRisk.nearProximityPoisCount} pairs (&lt; 1.5%)</strong>
                </div>
              </div>
            </div>

            {/* Directional Skew Gauge */}
            <div className="p-3 rounded-xl bg-[#121824] border border-[#233144] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#00c087] flex items-center gap-1">
                  <span>🟢 Bullish Demand:</span>
                  <span>{livePortfolioRisk.bullishPoisCount} ({Math.round((livePortfolioRisk.bullishPoisCount / Math.max(1, livePortfolioRisk.bullishPoisCount + livePortfolioRisk.bearishPoisCount)) * 100)}%)</span>
                </span>
                <span className="text-[11px] font-mono text-[#b6c4ff]">
                  Directional Skew: {livePortfolioRisk.directionalSkewPct >= 0 ? "+" : ""}{livePortfolioRisk.directionalSkewPct}% ({livePortfolioRisk.directionalBias.replace(/_/g, " ")})
                </span>
                <span className="text-[#ff3b30] flex items-center gap-1">
                  <span>🔴 Bearish Supply:</span>
                  <span>{livePortfolioRisk.bearishPoisCount} ({Math.round((livePortfolioRisk.bearishPoisCount / Math.max(1, livePortfolioRisk.bullishPoisCount + livePortfolioRisk.bearishPoisCount)) * 100)}%)</span>
                </span>
              </div>
              <div className="h-2 w-full bg-[#1b2535] rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-[#00c087] transition-all duration-500"
                  style={{
                    width: `${Math.round(
                      (livePortfolioRisk.bullishPoisCount /
                        Math.max(1, livePortfolioRisk.bullishPoisCount + livePortfolioRisk.bearishPoisCount)) *
                        100
                    )}%`,
                  }}
                />
                <div
                  className="h-full bg-[#ff3b30] transition-all duration-500"
                  style={{
                    width: `${Math.round(
                      (livePortfolioRisk.bearishPoisCount /
                        Math.max(1, livePortfolioRisk.bullishPoisCount + livePortfolioRisk.bearishPoisCount)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Sector Heat Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {Object.values(livePortfolioRisk.sectorBreakdown).map((sm) => {
                if (sm.totalCoins === 0) return null;
                return (
                  <div
                    key={sm.sector}
                    className="p-2.5 rounded-lg bg-[#121824] border border-[#233144] flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-[11px] truncate">{sm.badge}</span>
                      <span
                        className={`text-[8px] font-extrabold px-1 rounded border ${
                          sm.heatTier === "EXTREME"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            : sm.heatTier === "ELEVATED"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : sm.heatTier === "MODERATE"
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        }`}
                      >
                        {sm.heatTier}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#848e9c] font-mono mt-1">
                      <span>Monitored: <strong className="text-white">{sm.totalCoins}</strong></span>
                      <span>Near: <strong className={sm.nearProximityCount > 0 ? "text-amber-400 font-bold" : "text-white"}>{sm.nearProximityCount}</strong></span>
                    </div>
                    <div className="text-[10px] text-[#848e9c] font-mono flex justify-between">
                      <span>BTC ρ:</span>
                      <span className="text-cyan-400">+{sm.averageBtcCorrelation.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sizing & Warning Banner */}
            <div className="p-3 rounded-lg bg-[#121824] border border-[#233144] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                  Institutional Risk Advisories
                </span>
                <div className="flex flex-col gap-0.5 text-[11px] text-[#d1d4dc]">
                  {livePortfolioRisk.warningMessages.map((msg, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span>{msg}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0e141f] border border-[#233144] md:max-w-xs shrink-0 flex flex-col gap-1">
                <span className="text-[9px] text-[#848e9c] uppercase font-bold">Execution Guidance</span>
                <span className="text-[11px] font-semibold text-white leading-tight">
                  {livePortfolioRisk.sizingRecommendation}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. CONTROLS, TABS & FILTERS */}
      <section className="px-4 sm:px-6 py-4 max-w-7xl mx-auto w-full flex flex-col gap-3">
        {/* Active Radar Alarms Banner (DEC-158) */}
        {activeRadarAlertsCount > 0 && (
          <div className="p-3 px-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span>
                <strong className="text-amber-300 font-bold">{activeRadarAlertsCount} 24/7 Radar Alarms Active</strong> across {radarCoinsCount} coins.
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {poiCategoryFilter !== "has_alarms" && (
                <button
                  type="button"
                  onClick={() => setPoiCategoryFilter("has_alarms")}
                  className="px-2.5 py-1 rounded bg-[#121824] hover:bg-[#1a2332] text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer"
                >
                  Filter Armed Coins
                </button>
              )}
              <Link
                href="/radar/alerts"
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20"
              >
                <span>Manage in Radar Alarms Page</span>
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        )}

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
            Majors & Volume Futures ({MAJORS_UNIVERSE.length})
          </button>

          <button
            onClick={() => setActiveTab("memes")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "memes"
                ? "bg-[#2962ff] text-white shadow-md shadow-[#2962ff]/30"
                : "bg-[#121824] text-[#848e9c] hover:text-white border border-[#233144]"
            }`}
          >
            🔥 Top 150 Meme Futures ({TOP_150_MEMES.length})
          </button>

          <button
            onClick={() => setActiveTab("ai")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === "ai"
                ? "bg-[#2962ff] text-white shadow-md shadow-[#2962ff]/30"
                : "bg-[#121824] text-[#848e9c] hover:text-white border border-[#233144]"
            }`}
          >
            ⚡ Top 150 AI Futures ({TOP_150_AI.length})
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
                { id: "all", short: "All Feeds", title: "All Futures Exchanges Aggregated" },
                { id: "mexc", short: "MEXC", title: "MEXC Futures (USDT-M)" },
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
              <option value="has_alarms">🔔 Armed Alarms ({activeRadarAlertsCount} Alarms across {radarCoinsCount} Coins)</option>
              <option value="absorption">🛡️ Order Flow Absorption & CVD Div (≥ 65%)</option>
              <option value="risk_cluster">⚠️ High Directional Cluster (≥ 50% Exposure)</option>
              <option value="confluence">🔥 Multi-Timeframe Confluence (≥ 2x)</option>
              <option value="liquidity">💧 High Liquidity Magnets (≥ 70%)</option>
              <option value="broken">🚨 Invalidated / Stop-Out Zones</option>
              <option value="sweep">🧹 Liquidity Sweeps Only</option>
              <option value="fvg">⚡ Fair Value Gaps (FVG) Only</option>
              <option value="sandwich_zone">🥪 Sandwich Zones ++ (Supply/Demand)</option>
              <option value="order_block">📦 Validated Order Blocks Only</option>
            </select>

            {/* Multi-Timeframe Selector (DEC-151, DEC-164) */}
            <div
              className="flex items-center gap-1 bg-[#121824] p-0.5 rounded-lg border border-[#233144]"
              title="Toggle one or multiple timeframes at once (click ALL to select all 7 timeframes)"
            >
              <button
                type="button"
                onClick={selectAllTimeframes}
                className={`px-2 py-1 rounded text-[10px] font-extrabold transition-colors cursor-pointer ${
                  selectedTimeframes.length >= 7
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                ALL
              </button>
              {[
                { label: "15m", val: "15m" },
                { label: "30m", val: "30" },
                { label: "1H", val: "60" },
                { label: "2H", val: "120" },
                { label: "4H", val: "240" },
                { label: "1D", val: "1D" },
                { label: "1W", val: "1W" },
              ].map((tf) => {
                const isSelected = selectedTimeframes.includes(tf.val);
                return (
                  <button
                    type="button"
                    key={tf.val}
                    onClick={() => toggleTimeframe(tf.val)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#2962ff] text-white shadow-xs"
                        : "text-[#848e9c] hover:text-white"
                    }`}
                  >
                    {tf.label}
                  </button>
                );
              })}
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
              <option value="imbalance">Sort: Strongest Orderbook Imbalance</option>
              <option value="confluence">Sort: Highest MTF Confluence</option>
              <option value="liquidity">Sort: Highest Liquidity Density</option>
              <option value="winrate">Sort: Highest POI Win-Rate</option>
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
      <main
        className={`flex-1 px-4 sm:px-6 pb-12 w-full mx-auto transition-all duration-300 ${
          viewMode === "kanban" ? "max-w-[1920px]" : "max-w-7xl"
        }`}
      >
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
                                {alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")]?.length > 0 && (
                                  <span
                                    className="px-1.5 py-0.2 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[9px] font-mono font-bold flex items-center gap-1 shadow-sm"
                                    title={`${alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")].length} active 24/7 cloud alarm(s) set on ${coin.symbol}`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    <span>{alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")].length} Armed</span>
                                  </span>
                                )}

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

                                {/* Historical Win Rate Badge (DEC-144) */}
                                {selectedPoi.metrics && selectedPoi.metrics.totalTested > 0 && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold border flex items-center gap-0.5 ${
                                      selectedPoi.metrics.winRatePct >= 70
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                        : selectedPoi.metrics.winRatePct >= 50
                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                    }`}
                                    title={`Empirical Reaction: ${selectedPoi.metrics.wins} wins / ${selectedPoi.metrics.losses} losses (${selectedPoi.metrics.avgRr}R avg)`}
                                  >
                                    <span>🎯 {selectedPoi.metrics.winRatePct}%</span>
                                    <span className="text-[7px] text-[#848e9c]">({selectedPoi.metrics.wins}/{selectedPoi.metrics.totalTested})</span>
                                  </span>
                                )}

                                {/* Sandwich ++ Badge */}
                                {selectedPoi.isPlus && (
                                  <span className="px-1.5 py-0.2 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 text-[8px] font-bold flex items-center gap-0.5">
                                    <Star size={8} className="fill-yellow-400" />
                                    <span>++ S/R</span>
                                  </span>
                                )}

                                {/* Multi-Asset Sector & Correlation Badge (DEC-155) */}
                                {selectedPoi.correlation && (
                                  <span
                                    className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-[#172233] text-[#b6c4ff] border border-[#233144] flex items-center gap-1 shrink-0"
                                    title={`${selectedPoi.correlation.sectorLabel} | Correlation to BTC: ${selectedPoi.correlation.btcCorrelation >= 0 ? "+" : ""}${selectedPoi.correlation.btcCorrelation.toFixed(2)} | Cluster Risk: ${selectedPoi.correlation.clusterExposureScore}%`}
                                  >
                                    <span>{selectedPoi.correlation.sectorBadge}</span>
                                    <span
                                      className={
                                        selectedPoi.correlation.btcCorrelation >= 0.7
                                          ? "text-emerald-400 font-extrabold"
                                          : selectedPoi.correlation.btcCorrelation >= 0.35
                                          ? "text-cyan-400"
                                          : "text-[#848e9c]"
                                      }
                                    >
                                      ρ{selectedPoi.correlation.btcCorrelation >= 0 ? "+" : ""}
                                      {selectedPoi.correlation.btcCorrelation.toFixed(2)}
                                    </span>
                                  </span>
                                )}

                                {/* Sweep Badge (DEC-145) */}
                                {selectedPoi.sweep && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[8px] font-bold flex items-center gap-0.5 animate-pulse">
                                    <span>🧹 SWEEP ({selectedPoi.sweep.rejectionWickPct.toFixed(0)}% Wick)</span>
                                  </span>
                                )}

                                {/* MTF Confluence Badge (DEC-146) */}
                                {selectedPoi.confluence && selectedPoi.confluence.score >= 2 && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold border flex items-center gap-0.5 ${
                                      selectedPoi.confluence.score >= 3
                                        ? "bg-orange-500/20 text-orange-300 border-orange-500/40 animate-pulse"
                                        : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                    }`}
                                    title={`Multi-Timeframe Confluence: ${selectedPoi.confluence.description} (Cluster: $${formatZonePrice(selectedPoi.confluence.clusterBottom)} - $${formatZonePrice(selectedPoi.confluence.clusterTop)})`}
                                  >
                                    <span>{selectedPoi.confluence.label} ({selectedPoi.confluence.timeframes.join("·")})</span>
                                  </span>
                                )}

                                {/* Liquidity Density Ribbon Badge (DEC-149) */}
                                {selectedPoi.liquidity && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold border flex items-center gap-0.5 ${
                                      selectedPoi.liquidity.isPeakMagnet
                                        ? "bg-cyan-500/25 text-cyan-200 border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.4)] animate-pulse"
                                        : selectedPoi.liquidity.tier === "ultra"
                                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                        : selectedPoi.liquidity.tier === "high"
                                        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                                        : "bg-[#172233] text-[#848e9c] border-[#233144]"
                                    }`}
                                    title={`Liquidity Density: ${selectedPoi.liquidity.densityPercentile.toFixed(0)}% (${selectedPoi.liquidity.tier.toUpperCase()})${selectedPoi.liquidity.isPeakMagnet ? " [PRIMARY MAGNET]" : ""} - Dominance: ${selectedPoi.liquidity.demandDominancePct.toFixed(0)}% Demand (${selectedPoi.liquidity.sentimentBias})`}
                                  >
                                    <span>
                                      {selectedPoi.liquidity.isPeakMagnet ? "🧲 " : "💧 "}
                                      {selectedPoi.liquidity.densityPercentile.toFixed(0)}% Liq
                                    </span>
                                  </span>
                                )}

                                {/* Order Flow & CVD Absorption Badge (DEC-153) */}
                                {selectedPoi.orderFlow && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold border flex items-center gap-0.5 ${
                                      selectedPoi.orderFlow.isAbsorptionConfirmed
                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse"
                                        : selectedPoi.orderFlow.verdict === "LIMIT_WALL_DEFENSE"
                                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                        : selectedPoi.orderFlow.verdict === "CVD_DIVERGENCE"
                                        ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                        : selectedPoi.orderFlow.verdict === "PRESSURE_RISK"
                                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                        : "bg-[#172233] text-[#848e9c] border-[#233144]"
                                    }`}
                                    title={`Order Flow: ${selectedPoi.orderFlow.summaryText} (Absorption Score: ${selectedPoi.orderFlow.absorptionScore}/100)`}
                                  >
                                    <span>{selectedPoi.orderFlow.badgeLabel}</span>
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
                              No active POI on{" "}
                              {selectedTimeframes
                                .map((tf) => (tf === "60" ? "1H" : tf === "240" ? "4H" : tf === "120" ? "2H" : tf === "30" ? "30m" : tf))
                                .join("/")}
                            </span>
                          )}
                        </td>

                        {/* 5. ZONE RANGE */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          {selectedPoi ? (() => {
                            const zr = getPoiZoneRange(selectedPoi);
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className="text-white font-semibold"
                                  title={`Bottom: $${zr.bottomFormatted} | Top: $${zr.topFormatted} (${zr.spreadPct.toFixed(2)}% height)`}
                                >
                                  {zr.rangeText}
                                </span>
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="text-[#2962ff]">
                                    {isFvg ? "50% CE" : "MT"}: ${formatPoiPrice(selectedPoi.meanThreshold)}
                                  </span>
                                  <span className="text-[#848e9c]">
                                    ({zr.spreadPct.toFixed(2)}%)
                                  </span>
                                </div>
                              </div>
                            );
                          })() : (
                            <span className="text-[#848e9c]">—</span>
                          )}
                        </td>

                        {/* 6. PROXIMITY */}
                        <td className="py-3.5 px-4 font-mono">
                          {selectedPoi ? (
                            <div className="flex flex-col gap-1 min-w-[100px]">
                              {selectedPoi.status === "broken" || Boolean(selectedPoi.breakTelemetry) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-[10px] animate-pulse">
                                  <span>🚨 BROKEN (-{selectedPoi.breakTelemetry?.overshootPct ?? 0.2}%)</span>
                                </span>
                              ) : selectedPoi.sweep ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold text-[10px] animate-pulse">
                                  <span>🧹 SWEEP REVERSAL</span>
                                </span>
                              ) : selectedPoi.isInsideZone ? (
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
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                                    alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")]?.length > 0
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500 hover:text-black shadow-sm"
                                      : "bg-[#2962ff]/15 hover:bg-[#2962ff] text-[#2962ff] hover:text-white border border-[#2962ff]/30"
                                  }`}
                                >
                                  <Bell size={12} className={alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")]?.length > 0 ? "fill-amber-400 text-amber-400" : ""} />
                                  <span className="hidden sm:inline">{alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")]?.length > 0 ? `${alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")].length} Armed` : "Set Alarm"}</span>
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
                                <button
                                  onClick={() =>
                                    setLiveTradeModalData({
                                      symbol: coin.symbol,
                                      poi: selectedPoi,
                                    })
                                  }
                                  title={`Execute Live Broker Order on ${coin.symbol}`}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer"
                                >
                                  <Key size={12} />
                                  <span className="hidden lg:inline">Live</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 items-start">
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

                              {/* Historical Win Rate Badge (DEC-144) */}
                              {selectedPoi.metrics && selectedPoi.metrics.totalTested > 0 && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[8px] font-bold border flex items-center gap-0.5 ${
                                    selectedPoi.metrics.winRatePct >= 70
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                      : selectedPoi.metrics.winRatePct >= 50
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                      : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                  }`}
                                  title={`Historical Win Rate: ${selectedPoi.metrics.wins} wins / ${selectedPoi.metrics.losses} losses (${selectedPoi.metrics.avgRr}R avg)`}
                                >
                                  <span>🎯 {selectedPoi.metrics.winRatePct}%</span>
                                </span>
                              )}

                              {selectedPoi.correlation && (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-[#172233] text-[#b6c4ff] border border-[#233144] flex items-center gap-1 shrink-0"
                                  title={`${selectedPoi.correlation.sectorLabel} | Correlation to BTC: ${selectedPoi.correlation.btcCorrelation >= 0 ? "+" : ""}${selectedPoi.correlation.btcCorrelation.toFixed(2)}`}
                                >
                                  <span>{selectedPoi.correlation.sectorBadge}</span>
                                  <span
                                    className={
                                      selectedPoi.correlation.btcCorrelation >= 0.7
                                        ? "text-emerald-400 font-bold"
                                        : "text-[#848e9c]"
                                    }
                                  >
                                    ρ{selectedPoi.correlation.btcCorrelation >= 0 ? "+" : ""}{selectedPoi.correlation.btcCorrelation.toFixed(2)}
                                  </span>
                                </span>
                              )}

                              {selectedPoi.isPlus && (
                                <span className="px-1.5 py-0.2 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 text-[8px] font-bold flex items-center gap-0.5">
                                  <Star size={8} className="fill-yellow-400" />
                                  <span>++</span>
                                </span>
                              )}

                              {selectedPoi.sweep && (
                                <span
                                  className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[8px] font-bold flex items-center gap-0.5 animate-pulse"
                                  title={`Liquidity Sweep: ${selectedPoi.sweep.type === "BULLISH_SWEEP" ? "Bullish Reversal Trap" : "Bearish Reversal Trap"} (${selectedPoi.sweep.rejectionWickPct.toFixed(0)}% wick rejection)`}
                                >
                                  <span>🧹 SWEEP ({selectedPoi.sweep.rejectionWickPct.toFixed(0)}%)</span>
                                </span>
                              )}

                              {/* MTF Confluence Badge (DEC-146) */}
                              {selectedPoi.confluence && selectedPoi.confluence.score >= 2 && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[8px] font-bold border flex items-center gap-0.5 ${
                                    selectedPoi.confluence.score >= 3
                                      ? "bg-orange-500/20 text-orange-300 border-orange-500/40 animate-pulse"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  }`}
                                  title={`MTF Confluence: ${selectedPoi.confluence.description}`}
                                >
                                  <span>{selectedPoi.confluence.label}</span>
                                </span>
                              )}

                              {/* Liquidity Density Ribbon Badge (DEC-149) */}
                              {selectedPoi.liquidity && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[8px] font-bold border flex items-center gap-0.5 ${
                                    selectedPoi.liquidity.isPeakMagnet
                                      ? "bg-cyan-500/25 text-cyan-200 border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.4)] animate-pulse"
                                      : selectedPoi.liquidity.tier === "ultra"
                                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                      : selectedPoi.liquidity.tier === "high"
                                      ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                                      : "bg-[#172233] text-[#848e9c] border-[#233144]"
                                  }`}
                                  title={`Liquidity Density: ${selectedPoi.liquidity.densityPercentile.toFixed(0)}% (${selectedPoi.liquidity.tier.toUpperCase()})${selectedPoi.liquidity.isPeakMagnet ? " [PRIMARY MAGNET]" : ""}`}
                                >
                                  <span>
                                    {selectedPoi.liquidity.isPeakMagnet ? "🧲 " : "💧 "}
                                    {selectedPoi.liquidity.densityPercentile.toFixed(0)}% Liq
                                  </span>
                                </span>
                              )}

                              {/* Order Flow & CVD Absorption Badge (DEC-153) */}
                              {selectedPoi.orderFlow && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[8px] font-bold border flex items-center gap-0.5 ${
                                    selectedPoi.orderFlow.isAbsorptionConfirmed
                                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse"
                                      : selectedPoi.orderFlow.verdict === "LIMIT_WALL_DEFENSE"
                                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                      : selectedPoi.orderFlow.verdict === "CVD_DIVERGENCE"
                                      ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                      : selectedPoi.orderFlow.verdict === "PRESSURE_RISK"
                                      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                      : "bg-[#172233] text-[#848e9c] border-[#233144]"
                                  }`}
                                  title={`Order Flow: ${selectedPoi.orderFlow.summaryText} (Absorption Score: ${selectedPoi.orderFlow.absorptionScore}/100)`}
                                >
                                  <span>{selectedPoi.orderFlow.badgeLabel}</span>
                                </span>
                              )}
                            </div>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                selectedPoi.status === "broken" || Boolean(selectedPoi.breakTelemetry)
                                  ? "bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse"
                                  : selectedPoi.status === "sweep" || Boolean(selectedPoi.sweep)
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse"
                                  : selectedPoi.isInsideZone
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse"
                                  : selectedPoi.distanceToEntryPct <= 1.5
                                  ? "bg-[#00c087]/20 text-[#00c087] border border-[#00c087]/40"
                                  : "bg-[#172233] text-[#848e9c]"
                              }`}
                            >
                              {selectedPoi.status === "broken" || Boolean(selectedPoi.breakTelemetry)
                                ? `🚨 BROKEN (-${selectedPoi.breakTelemetry?.overshootPct ?? 0.2}%)`
                                : selectedPoi.status === "sweep" || Boolean(selectedPoi.sweep)
                                ? "🧹 SWEPT"
                                : selectedPoi.isInsideZone
                                ? "IN ZONE"
                                : `${selectedPoi.distanceToEntryPct.toFixed(2)}%`}
                            </span>
                          </div>

                          {/* Zone Boundaries */}
                          {(() => {
                            const zr = getPoiZoneRange(selectedPoi);
                            return (
                              <div className="space-y-1.5 text-[10px] bg-[#0c1017] p-2 rounded border border-[#172233] font-mono">
                                <div className="flex items-center justify-between gap-2 pb-1 border-b border-[#172233]/80">
                                  <span className="text-[#848e9c] text-[9px]">
                                    {selectedPoi.category === "order_block" ? "OB Range" : "Zone Range"}
                                  </span>
                                  <span className="text-white font-semibold">
                                    {zr.rangeText}{" "}
                                    <span className="text-[#848e9c] font-normal">
                                      ({zr.spreadPct.toFixed(2)}%)
                                    </span>
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div>
                                    <span className="text-[#848e9c] text-[9px] block">Entry Level</span>
                                    <span className="text-white font-semibold">
                                      ${formatPoiPrice(selectedPoi.entryPrice)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[#2962ff] text-[9px] block">
                                      {isFvg ? "50% CE" : "50% MT"}
                                    </span>
                                    <span className="text-[#b6c4ff] font-semibold">
                                      ${formatPoiPrice(selectedPoi.meanThreshold)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

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
                              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")]?.length > 0
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500 hover:text-black"
                                : "bg-[#2962ff]/15 hover:bg-[#2962ff] text-[#2962ff] hover:text-white border border-[#2962ff]/30"
                            }`}
                            >
                              <Bell size={11} className={alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")]?.length > 0 ? "fill-amber-400 text-amber-400" : ""} />
                              <span>{alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")]?.length > 0 ? `${alertsBySymbol[coin.symbol.toUpperCase().replace(/[\/\-_]/g, "")].length} Armed` : "24/7 Cloud Alarm"}</span>
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
          existingAlerts={activeAlerts}
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
          activeAlerts={alertsBySymbol[previewData.symbol.toUpperCase().replace(/[\/\-_]/g, "")] || []}
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
          onOpenLiveTradeModal={() => {
            setLiveTradeModalData({
              symbol: previewData.symbol,
              poi: previewData.poi,
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

      {/* 9. ALERT CHANNELS (DISCORD & TELEGRAM) CONFIGURATION MODAL (DEC-154) */}
      <AlertChannelsModal
        isOpen={isChannelsModalOpen}
        onClose={() => setIsChannelsModalOpen(false)}
        config={webhookConfig}
        onSave={(cfg) => setWebhookConfig(cfg)}
      />

      
      {/* 10. MULTI-BROKER CREDENTIALS CONFIGURATION MODAL (DEC-156) */}
      <BrokerCredentialsModal
        isOpen={isBrokerModalOpen}
        onClose={() => setIsBrokerModalOpen(false)}
        onCredentialsUpdated={checkBrokerCredentials}
      />

      {/* 11. POI LIVE TRADE DIRECT EXECUTION MODAL (DEC-156) */}
      {liveTradeModalData && (
        <PoiLiveTradeModal
          isOpen={Boolean(liveTradeModalData)}
          onClose={() => setLiveTradeModalData(null)}
          poi={liveTradeModalData.poi}
          symbol={liveTradeModalData.symbol}
          onOpenBrokerConfig={() => {
            setLiveTradeModalData(null);
            setIsBrokerModalOpen(true);
          }}
        />
      )}

      
      {/* 12. POI BULK ALARM CONFIGURATION MODAL (DEC-157) */}
      <PoiBulkAlarmModal
        isOpen={isBulkAlarmModalOpen}
        onClose={() => setIsBulkAlarmModalOpen(false)}
        coins={candidateCoinsForBulk}
        currentUniverseLabel={currentUniverseLabel}
        currentExchange={activeExchange}
        defaultSelectedTimeframes={selectedTimeframes}
        existingAlerts={activeAlerts}
        onSuccess={(count) => {
          setToastMessage(`⚡ Successfully armed ${count} 24/7 Cloud POI Alarms!`);
          setTimeout(() => setToastMessage(null), 4000);
          fetchActiveAlerts();
        }}
      />

      {/* Toast Notification with Direct Radar Alarms link */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0c1017] border border-amber-500/60 text-amber-300 font-bold text-xs shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-amber-400" />
            <span>{toastMessage}</span>
          </div>
          <Link
            href="/radar/alerts"
            className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] flex items-center gap-1 transition-all shadow-md"
          >
            <span>View Alarms</span>
            <ExternalLink size={11} />
          </Link>
        </div>
      )}
    </div>
  );
}
