"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Flame,
  Star,
  Activity,
  ChevronDown,
  ChevronUp,
  Trash2,
  X,
  List,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Settings2,
  Edit3,
  Check,
  TrendingUp,
  RotateCcw,
  Zap,
} from "lucide-react";
import { mexcWsManager } from "@/lib/mexc/websocket";
import { MexcMiniTickerItem } from "@/lib/mexc/types";
import { OrderDepthLadder } from "./OrderDepthLadder";
import { DepthOfMarketTape } from "./DepthOfMarketTape";
import { AddPairModal } from "../watchlist/AddPairModal";
import { AuthUser } from "@/lib/auth/use-auth";
import {
  WatchlistProfile,
  DEFAULT_WATCHLIST_PROFILES,
  loadWatchlistProfiles,
  saveWatchlistProfiles,
  loadActiveProfileId,
  saveActiveProfileId,
  createWatchlistProfile,
  renameWatchlistProfile,
  deleteWatchlistProfile,
  addSymbolToProfile,
  removeSymbolFromProfile,
} from "@/lib/watchlist/watchlist-profiles";
import { ChartDrawing, formatDrawingObjectLabel } from "@/lib/chart/drawing-math";
import { calculatePricePrecision } from "@/lib/chart/price-precision";
import {
  PriceAlert,
  AlertLogEntry,
  AlertCondition,
  AlertFrequency,
  evaluateAlertsBatch,
  playInstitutionalAlertChime,
  StrategyAlertEvaluationContext,
} from "@/lib/alerts/alerts-engine";
import {
  PaperAccountState,
  PaperOrderInput,
  OrderSide,
  OrderType,
  createInitialPaperAccount,
  placePaperOrder,
  closePaperPosition,
  cancelPaperOrder,
  evaluatePaperTick,
  calculatePositionUnrealizedPnl,
  calculateAccountEquity,
} from "@/lib/trading/paper-trading-engine";
import { getIntrabarPricePath } from "@/lib/replay/replay-engine";
import { Bar } from "@/types/tradingview";
import {
  SIDEBAR_DEFAULT_WIDTH,
  clampSidebarWidth,
  computeSidebarWidthFromDrag,
} from "@/lib/ui/resizable-layout";

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  currentPrice?: number;
  user?: AuthUser | null;
  activeIndicators?: string[];
  hiddenIndicators?: string[];
  onToggleIndicator?: (name: string) => void;
  onToggleIndicatorVisibility?: (name: string) => void;
}

interface TickerRow {
  symbol: string;
  price: number;
  change: number;
  high: number;
  low: number;
  volume: number;
}

const DEFAULT_WATCHLIST: TickerRow[] = [
  { symbol: "BTCUSDT", price: 68420.5, change: 3.42, high: 69120.0, low: 67200.0, volume: 42819.5 },
  { symbol: "ETHUSDT", price: 3485.2, change: -1.15, high: 3560.0, low: 3410.0, volume: 182400.0 },
  { symbol: "SOLUSDT", price: 178.65, change: 7.82, high: 182.0, low: 165.2, volume: 924500.0 },
  { symbol: "MXUSDT", price: 3.84, change: 0.52, high: 3.92, low: 3.79, volume: 48920.0 },
  { symbol: "XRPUSDT", price: 0.542, change: -0.45, high: 0.555, low: 0.538, volume: 1420000.0 },
  { symbol: "DOGEUSDT", price: 0.128, change: 4.12, high: 0.134, low: 0.122, volume: 3840000.0 },
  { symbol: "BNBUSDT", price: 588.4, change: 1.25, high: 595.0, low: 580.0, volume: 34200.0 },
  { symbol: "SUIUSDT", price: 1.94, change: 12.4, high: 2.05, low: 1.72, volume: 890000.0 },
];

export function RightSidebar({
  isOpen,
  onClose,
  selectedSymbol,
  onSelectSymbol,
  currentPrice = 68420.5,
  user,
  activeIndicators = [],
  hiddenIndicators = [],
  onToggleIndicator,
  onToggleIndicatorVisibility,
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<"watchlist" | "trade" | "dom" | "alerts" | "objects" | "hot">("watchlist");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddPairOpen, setIsAddPairOpen] = useState(false);
  const [isListDropdownOpen, setIsListDropdownOpen] = useState(false);

  // Horizontal Resizable Width State (260px - 560px, default 320px, DEC-077)
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("mochex:sidebar_width");
      if (saved) {
        setSidebarWidth(clampSidebarWidth(Number(saved)));
      }
    } catch {}
  }, []);

  const persistSidebarWidth = useCallback((w: number) => {
    const clamped = clampSidebarWidth(w);
    setSidebarWidth(clamped);
    try {
      localStorage.setItem("mochex:sidebar_width", String(clamped));
    } catch {}
  }, []);

  const handleStartSidebarResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      setIsResizingSidebar(true);

      const handleMove = (moveEvent: MouseEvent) => {
        const nextW = computeSidebarWidthFromDrag(startWidth, startX, moveEvent.clientX);
        setSidebarWidth(nextW);
      };

      const handleUp = (upEvent: MouseEvent) => {
        const finalW = computeSidebarWidthFromDrag(startWidth, startX, upEvent.clientX);
        persistSidebarWidth(finalW);
        setIsResizingSidebar(false);
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [sidebarWidth, persistSidebarWidth]
  );

  // Paper Trading & Order Execution State (DEC-072)
  const [paperAccount, setPaperAccount] = useState<PaperAccountState>(() =>
    createInitialPaperAccount(100000)
  );
  const paperAccountRef = useRef<PaperAccountState>(createInitialPaperAccount(100000));
  const [orderSide, setOrderSide] = useState<OrderSide>("long");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [orderLimitPrice, setOrderLimitPrice] = useState<string>("");
  const [orderMarginUsdt, setOrderMarginUsdt] = useState<string>("1000");
  const [orderLeverage, setOrderLeverage] = useState<number>(5);
  const [orderTp, setOrderTp] = useState<string>("");
  const [orderSl, setOrderSl] = useState<string>("");
  const [tradeSubTab, setTradeSubTab] = useState<"positions" | "orders" | "history">("positions");
  const [tradeFeedback, setTradeFeedback] = useState<string | null>(null);

  const savePaperAccount = useCallback((nextAccount: PaperAccountState) => {
    paperAccountRef.current = nextAccount;
    setPaperAccount(nextAccount);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mochex:paper_account", JSON.stringify(nextAccount));
      } catch {}
      window.dispatchEvent(
        new CustomEvent("mochex:paper-trading-updated", { detail: nextAccount })
      );
    }
  }, []);

  // Object Tree State (DEC-070)
  const [chartDrawings, setChartDrawings] = useState<ChartDrawing[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>("");

  // Token Groups / Watchlist Profiles (DEC-091 & DEC-092)
  const [profiles, setProfiles] = useState<WatchlistProfile[]>(DEFAULT_WATCHLIST_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>(
    DEFAULT_WATCHLIST_PROFILES[0].id
  );
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState("");

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) || profiles[0] || DEFAULT_WATCHLIST_PROFILES[0];
  const activeSymbols = activeProfile.symbols;
  const activeListName = activeProfile.name;

  const [tickers, setTickers] = useState<Record<string, TickerRow>>(() => {
    const map: Record<string, TickerRow> = {};
    DEFAULT_WATCHLIST.forEach((t) => {
      map[t.symbol] = t;
    });
    return map;
  });

  // Live Price, Drawing & Strategy Crossing Alerts State (DEC-069 & DEC-079)
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [alertLogs, setAlertLogs] = useState<AlertLogEntry[]>([]);
  const [alertFormMode, setAlertFormMode] = useState<"price" | "strategy">("price");
  const [newAlertPrice, setNewAlertPrice] = useState<string>("");
  const [newAlertCondition, setNewAlertCondition] = useState<AlertCondition>("crossing");
  const [newAlertFrequency, setNewAlertFrequency] = useState<AlertFrequency>("only_once");
  const [newAlertScriptName, setNewAlertScriptName] = useState<string>("");
  const [newAlertLabel, setNewAlertLabel] = useState<string>("");
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const [activeToast, setActiveToast] = useState<AlertLogEntry | null>(null);

  const alertsRef = useRef<PriceAlert[]>([]);
  const prevPricesRef = useRef<Record<string, number>>({});
  const isSoundEnabledRef = useRef<boolean>(true);
  const currentPriceRef = useRef<number>(currentPrice);

  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);

  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
  }, [isSoundEnabled]);

  const saveAlerts = useCallback((nextAlerts: PriceAlert[]) => {
    alertsRef.current = nextAlerts;
    setAlerts(nextAlerts);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mochex:price_alerts", JSON.stringify(nextAlerts));
      } catch {}
      window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
    }
  }, []);

  const saveAlertLogs = useCallback((nextLogs: AlertLogEntry[]) => {
    const capped = nextLogs.slice(0, 50);
    setAlertLogs(capped);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("mochex:alert_logs", JSON.stringify(capped));
      } catch {}
    }
  }, []);

  // Load persisted alerts, logs, paper account, and watchlist profiles on client mount (DEC-092)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const loadedProfiles = loadWatchlistProfiles();
      setProfiles(loadedProfiles);
      setActiveProfileId(loadActiveProfileId(loadedProfiles));

      const savedAlerts = localStorage.getItem("mochex:price_alerts");
      if (savedAlerts) {
        const parsed = JSON.parse(savedAlerts);
        if (Array.isArray(parsed)) {
          alertsRef.current = parsed;
          setAlerts(parsed);
        }
      }
      const savedLogs = localStorage.getItem("mochex:alert_logs");
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs);
        if (Array.isArray(parsedLogs)) {
          setAlertLogs(parsedLogs);
        }
      }
      const savedPaper = localStorage.getItem("mochex:paper_account");
      if (savedPaper) {
        const parsedPaper = JSON.parse(savedPaper);
        if (parsedPaper && typeof parsedPaper.balance === "number") {
          paperAccountRef.current = parsedPaper;
          setPaperAccount(parsedPaper);
        }
      }
    } catch {}
  }, []);

  // Keep default target price & limit price inputs synced when switching symbols
  useEffect(() => {
    if (currentPrice > 0) {
      const suggested =
        currentPrice >= 1
          ? (currentPrice * 1.005).toFixed(2)
          : (currentPrice * 1.005).toFixed(4);
      setNewAlertPrice(suggested);
      setOrderLimitPrice(
        currentPrice >= 1 ? currentPrice.toFixed(2) : currentPrice.toFixed(4)
      );
    }
  }, [selectedSymbol]);

  // Listen for 1-click paper order execution from chart drawings or quick-trade bar (DEC-072)
  useEffect(() => {
    const handleExecutePaperOrder = (e: Event) => {
      const detail = (e as CustomEvent<{ order: PaperOrderInput }>).detail;
      if (!detail || !detail.order) return;

      const mark =
        detail.order.symbol === selectedSymbol
          ? currentPriceRef.current
          : prevPricesRef.current[detail.order.symbol] || currentPriceRef.current;

      const res = placePaperOrder(
        paperAccountRef.current,
        detail.order,
        mark,
        Date.now()
      );
      savePaperAccount(res.state);
      setActiveTab("trade");
      setTradeSubTab(res.status === "placed" ? "orders" : "positions");
      setTradeFeedback(res.message);
      if (isSoundEnabledRef.current) {
        playInstitutionalAlertChime();
      }
    };

    const handleOpenPaperTrade = (e: Event) => {
      const detail = (e as CustomEvent<{ side?: OrderSide }>).detail;
      if (detail?.side) {
        setOrderSide(detail.side);
      }
      setActiveTab("trade");
    };

    const handleOpenDom = () => {
      setActiveTab("dom");
    };

    window.addEventListener("mochex:execute-paper-order", handleExecutePaperOrder);
    window.addEventListener("mochex:open-paper-trade", handleOpenPaperTrade);
    window.addEventListener("mochex:open-dom", handleOpenDom);
    return () => {
      window.removeEventListener("mochex:execute-paper-order", handleExecutePaperOrder);
      window.removeEventListener("mochex:open-paper-trade", handleOpenPaperTrade);
      window.removeEventListener("mochex:open-dom", handleOpenDom);
    };
  }, [selectedSymbol, savePaperAccount]);

  useEffect(() => {
    if (!tradeFeedback) return;
    const t = setTimeout(() => setTradeFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [tradeFeedback]);

  // Listen for 1-click drawing alerts from TradingViewContainer floating toolbar
  useEffect(() => {
    const handleCreateDrawingAlert = (e: Event) => {
      const detail = (e as CustomEvent<{ alerts: PriceAlert[] }>).detail;
      if (!detail || !Array.isArray(detail.alerts) || detail.alerts.length === 0) return;

      const incoming = detail.alerts;
      const incomingDrawingIds = new Set(incoming.map((a) => a.drawingId).filter(Boolean));
      const filteredExisting = alertsRef.current.filter(
        (a) => !(a.drawingId && incomingDrawingIds.has(a.drawingId))
      );
      const next = [...incoming, ...filteredExisting];
      saveAlerts(next);
      setActiveTab("alerts");
      if (isSoundEnabledRef.current) {
        playInstitutionalAlertChime();
      }
    };

    window.addEventListener("mochex:create-drawing-alert", handleCreateDrawingAlert);
    return () =>
      window.removeEventListener("mochex:create-drawing-alert", handleCreateDrawingAlert);
  }, [saveAlerts]);

  // Listen for Strategy & Indicator condition alerts creation & evaluation (DEC-079)
  useEffect(() => {
    const handleCreateStrategyAlert = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          symbol?: string;
          scriptName?: string;
          code?: string;
          condition?: AlertCondition;
          frequency?: AlertFrequency;
        }>
      ).detail;
      if (!detail) return;

      const targetSym = detail.symbol || selectedSymbol;
      const nowMs = Date.now();
      const condition: AlertCondition = detail.condition || "strategy_any_order";
      const sName = detail.scriptName || "Active Script";
      const created: PriceAlert = {
        id: `alert-strat-${targetSym}-${nowMs}`,
        symbol: targetSym,
        targetPrice: currentPriceRef.current || 0,
        condition,
        frequency: detail.frequency || "once_per_bar_close",
        sourceType: "strategy_order",
        scriptName: sName,
        label: `${sName}: ${condition.replace(/_/g, " ").toUpperCase()}`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
      };

      saveAlerts([created, ...alertsRef.current]);
      setActiveTab("alerts");
      setAlertFormMode("strategy");
      if (isSoundEnabledRef.current) {
        playInstitutionalAlertChime();
      }
    };

    const handleEvaluateStrategyAlerts = (e: Event) => {
      const detail = (e as CustomEvent<StrategyAlertEvaluationContext>).detail;
      if (!detail || !detail.symbol) return;

      const sym = detail.symbol;
      const prevPrice = detail.prevPrice ?? prevPricesRef.current[sym] ?? currentPriceRef.current;
      const currPrice = detail.currentPrice ?? currentPriceRef.current;
      const timeSec = detail.currentTimeSec ?? Math.floor(Date.now() / 1000);
      const nowMs = detail.nowMs ?? Date.now();

      const { updatedAlerts, triggeredLogs } = evaluateAlertsBatch(
        alertsRef.current,
        sym,
        prevPrice,
        currPrice,
        timeSec,
        nowMs,
        detail
      );

      if (triggeredLogs.length > 0) {
        saveAlerts(updatedAlerts);
        setAlertLogs((prev) => {
          const next = [...triggeredLogs, ...prev].slice(0, 50);
          try {
            localStorage.setItem("mochex:alert_logs", JSON.stringify(next));
          } catch {}
          return next;
        });
        setActiveToast(triggeredLogs[0]);
        if (isSoundEnabledRef.current) {
          playInstitutionalAlertChime();
        }
      }
    };

    window.addEventListener("mochex:create-strategy-alert", handleCreateStrategyAlert);
    window.addEventListener("mochex:evaluate-strategy-alerts", handleEvaluateStrategyAlerts);
    return () => {
      window.removeEventListener("mochex:create-strategy-alert", handleCreateStrategyAlert);
      window.removeEventListener("mochex:evaluate-strategy-alerts", handleEvaluateStrategyAlerts);
    };
  }, [selectedSymbol, saveAlerts]);

  // Listen for drawings synchronization and Object Tree open trigger (DEC-070)
  useEffect(() => {
    const handleDrawingsSync = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          symbol: string;
          drawings: ChartDrawing[];
          selectedDrawingId: string | null;
        }>
      ).detail;
      if (detail && Array.isArray(detail.drawings)) {
        setChartDrawings(detail.drawings);
        setSelectedDrawingId(detail.selectedDrawingId || null);
      }
    };

    const handleOpenObjectTree = () => {
      setActiveTab("objects");
      window.dispatchEvent(new CustomEvent("mochex:request-drawings-sync"));
    };

    window.addEventListener("mochex:drawings-sync", handleDrawingsSync);
    window.addEventListener("mochex:open-object-tree", handleOpenObjectTree);
    window.dispatchEvent(new CustomEvent("mochex:request-drawings-sync"));

    return () => {
      window.removeEventListener("mochex:drawings-sync", handleDrawingsSync);
      window.removeEventListener("mochex:open-object-tree", handleOpenObjectTree);
    };
  }, []);

  const dispatchObjectTreeAction = (
    action:
      | "select"
      | "toggle_hide"
      | "toggle_lock"
      | "clone"
      | "reorder"
      | "rename"
      | "open_settings"
      | "delete",
    drawingId: string,
    extra?: { direction?: "forward" | "backward"; name?: string }
  ) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("mochex:object-tree-action", {
        detail: {
          action,
          drawingId,
          ...extra,
        },
      })
    );
  };

  // Helper to evaluate a price tick for a given symbol
  const processSymbolPriceTick = useCallback(
    (sym: string, nextPrice: number, customTimeMs?: number) => {
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;
      const prevPrice = prevPricesRef.current[sym];
      prevPricesRef.current[sym] = nextPrice;

      const nowMs = customTimeMs && customTimeMs > 0 ? customTimeMs : Date.now();

      // 1. Evaluate Paper Trading Limit fills & TP/SL triggers (DEC-072)
      const currentPaper = paperAccountRef.current;
      if (
        currentPaper.orders.some((o) => o.symbol === sym) ||
        currentPaper.positions.some((p) => p.symbol === sym)
      ) {
        const paperTick = evaluatePaperTick(currentPaper, sym, nextPrice, nowMs);
        if (paperTick.filledOrders.length > 0 || paperTick.closedTrades.length > 0) {
          savePaperAccount(paperTick.state);
          if (paperTick.closedTrades.length > 0) {
            const trd = paperTick.closedTrades[0];
            const sign = trd.realizedPnl >= 0 ? "+" : "";
            setTradeFeedback(
              `${trd.exitReason === "take_profit" ? "TP HIT" : "SL HIT"} · ${trd.symbol.replace("USDT", "")} (${sign}$${trd.realizedPnl.toFixed(2)})`
            );
          } else if (paperTick.filledOrders.length > 0) {
            const ord = paperTick.filledOrders[0];
            setTradeFeedback(
              `LIMIT FILLED · ${ord.side.toUpperCase()} ${ord.symbol.replace("USDT", "")} @ $${ord.limitPrice.toFixed(2)}`
            );
          }
          if (isSoundEnabledRef.current) {
            playInstitutionalAlertChime();
          }
        }
      }

      // 2. Evaluate Live Crossing Alerts (DEC-069)
      if (typeof prevPrice !== "number" || prevPrice <= 0 || prevPrice === nextPrice) {
        return;
      }
      if (alertsRef.current.length === 0) return;

      const { updatedAlerts, triggeredLogs } = evaluateAlertsBatch(
        alertsRef.current,
        sym,
        prevPrice,
        nextPrice,
        Math.floor(nowMs / 1000),
        nowMs
      );

      if (triggeredLogs.length > 0) {
        saveAlerts(updatedAlerts);
        setAlertLogs((prev) => {
          const next = [...triggeredLogs, ...prev].slice(0, 50);
          try {
            localStorage.setItem("mochex:alert_logs", JSON.stringify(next));
          } catch {}
          return next;
        });
        setActiveToast(triggeredLogs[0]);
        if (isSoundEnabledRef.current) {
          playInstitutionalAlertChime();
        }
      }
    },
    [saveAlerts, savePaperAccount]
  );

  // Listen for Bar Replay Intrabar OHLC Simulation ticks (DEC-073)
  useEffect(() => {
    const handleReplayTick = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          symbol: string;
          bar: Bar;
          isForwardStep?: boolean;
        }>
      ).detail;
      if (!detail || !detail.bar || !detail.symbol) return;

      if (detail.isForwardStep) {
        const path = getIntrabarPricePath(detail.bar);
        for (const pricePoint of path) {
          processSymbolPriceTick(detail.symbol, pricePoint, detail.bar.time);
        }
      } else {
        prevPricesRef.current[detail.symbol] = detail.bar.close;
      }
    };

    window.addEventListener("mochex:replay-tick", handleReplayTick);
    return () => window.removeEventListener("mochex:replay-tick", handleReplayTick);
  }, [processSymbolPriceTick]);

  // Evaluate whenever active chart symbol's currentPrice updates
  useEffect(() => {
    if (selectedSymbol && currentPrice > 0) {
      processSymbolPriceTick(selectedSymbol, currentPrice);
    }
  }, [selectedSymbol, currentPrice, processSymbolPriceTick]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => setActiveToast(null), 6000);
    return () => clearTimeout(timer);
  }, [activeToast]);

  // Sync cloud watchlists into profiles
  const fetchCloudWatchlists = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/watchlists", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const cloudProfiles: WatchlistProfile[] = data.map((d: any) => ({
            id: d.id || `profile_${d.name.toLowerCase().replace(/\s+/g, "-")}`,
            name: d.name,
            symbols: Array.isArray(d.symbols) ? d.symbols : [],
            isCustom: true,
          }));
          setProfiles(cloudProfiles);
          saveWatchlistProfiles(cloudProfiles);
          setActiveProfileId(cloudProfiles[0].id);
        }
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    fetchCloudWatchlists();
  }, [fetchCloudWatchlists]);

  // WebSocket Live Price updates + Resilient Polling Fallback (DEC-093)
  useEffect(() => {
    let isCancelled = false;
    const lastMiniTickerTickRef = { current: 0 };

    mexcWsManager.connect();
    const handleTickers = (items: MexcMiniTickerItem[]) => {
      lastMiniTickerTickRef.current = Date.now();
      setTickers((prev) => {
        const next = { ...prev };
        for (const item of items) {
          const parsedPrice = parseFloat(item.p);
          if (parsedPrice > 0) {
            processSymbolPriceTick(item.s, parsedPrice);
          }
          if (next[item.s]) {
            next[item.s] = {
              ...next[item.s],
              price: parsedPrice || next[item.s].price,
              change: parseFloat(item.r) * 100 || next[item.s].change,
              high: parseFloat(item.h) || next[item.s].high,
              low: parseFloat(item.l) || next[item.s].low,
              volume: parseFloat(item.v) || next[item.s].volume,
            };
          }
        }
        return next;
      });
    };

    mexcWsManager.subscribeMiniTickers(handleTickers);

    // Watchlist REST Polling Fallback (every 4s if WS silent >5s)
    const pollInterval = setInterval(async () => {
      if (isCancelled) return;
      if (Date.now() - lastMiniTickerTickRef.current < 5000) {
        return;
      }

      try {
        const res = await fetch("/api/mexc/ticker");
        if (res.ok && !isCancelled) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setTickers((prev) => {
              const next = { ...prev };
              for (const item of data) {
                if (next[item.symbol]) {
                  const p = parseFloat(item.lastPrice);
                  if (p > 0) {
                    processSymbolPriceTick(item.symbol, p);
                  }
                  next[item.symbol] = {
                    ...next[item.symbol],
                    price: p || next[item.symbol].price,
                    change: parseFloat(item.priceChangePercent) * 100 || next[item.symbol].change,
                    high: parseFloat(item.highPrice) || next[item.symbol].high,
                    low: parseFloat(item.lowPrice) || next[item.symbol].low,
                    volume: parseFloat(item.volume) || next[item.symbol].volume,
                  };
                }
              }
              return next;
            });
          }
        }
      } catch {}
    }, 4000);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
      mexcWsManager.unsubscribeMiniTickers(handleTickers);
    };
  }, [processSymbolPriceTick]);

  const handleAddSymbol = async (sym: string) => {
    if (activeSymbols.includes(sym)) return;
    const nextProfiles = addSymbolToProfile(profiles, activeProfile.id, sym);
    setProfiles(nextProfiles);

    // Seed ticker row if not present
    if (!tickers[sym]) {
      setTickers((prev) => ({
        ...prev,
        [sym]: {
          symbol: sym,
          price: 1.0,
          change: 0.0,
          high: 1.05,
          low: 0.95,
          volume: 50000,
        },
      }));
    }

    if (user) {
      try {
        await fetch("/api/watchlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: activeProfile.name,
            symbols: [...activeProfile.symbols, sym],
            isDefault: true,
          }),
        });
      } catch {}
    }
  };

  const handleRemoveSymbol = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextProfiles = removeSymbolFromProfile(profiles, activeProfile.id, sym);
    setProfiles(nextProfiles);
  };

  const handleSelectProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    saveActiveProfileId(profileId);
    setIsListDropdownOpen(false);
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    const { profiles: nextProfiles, newProfile } = createWatchlistProfile(
      profiles,
      newProfileName.trim()
    );
    setProfiles(nextProfiles);
    setActiveProfileId(newProfile.id);
    setNewProfileName("");
    setIsCreatingProfile(false);
    setIsListDropdownOpen(false);
  };

  const handleRenameProfile = (profileId: string, newName: string) => {
    if (!newName.trim()) return;
    const nextProfiles = renameWatchlistProfile(profiles, profileId, newName.trim());
    setProfiles(nextProfiles);
    setEditingProfileId(null);
  };

  const handleDeleteProfile = (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profiles.length <= 1) return;
    const { profiles: nextProfiles, activeId } = deleteWatchlistProfile(profiles, profileId);
    setProfiles(nextProfiles);
    setActiveProfileId(activeId);
  };

  const handleCreateManualAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const nowMs = Date.now();

    if (alertFormMode === "price") {
      const target = parseFloat(newAlertPrice);
      if (!Number.isFinite(target) || target <= 0) return;

      const formattedPrice = target >= 1 ? target.toFixed(2) : target.toFixed(4);
      const created: PriceAlert = {
        id: `alert-price-${selectedSymbol}-${nowMs}`,
        symbol: selectedSymbol,
        targetPrice: target,
        condition: newAlertCondition,
        frequency: newAlertFrequency,
        sourceType: "price",
        label:
          newAlertLabel.trim() ||
          `${selectedSymbol.replace("USDT", "/USDT")} ${newAlertCondition.replace(/_/g, " ")} $${formattedPrice}`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
      };

      saveAlerts([created, ...alertsRef.current]);
      setNewAlertLabel("");
    } else {
      const isScriptCondition = newAlertCondition === "script_condition";
      const isIndicator = newAlertCondition.startsWith("indicator_");
      const sourceType = isScriptCondition || isIndicator ? "indicator_condition" : "strategy_order";
      const scriptPrefix = newAlertScriptName.trim() ? `${newAlertScriptName.trim()}: ` : "";
      const created: PriceAlert = {
        id: `alert-strat-${selectedSymbol}-${nowMs}`,
        symbol: selectedSymbol,
        targetPrice: currentPriceRef.current || 0,
        condition: newAlertCondition,
        frequency: newAlertFrequency,
        sourceType,
        scriptName: newAlertScriptName.trim() || undefined,
        label:
          newAlertLabel.trim() ||
          `${scriptPrefix}${newAlertCondition.replace(/_/g, " ").toUpperCase()} (${selectedSymbol.replace("USDT", "")})`,
        active: true,
        triggeredCount: 0,
        createdAt: nowMs,
      };

      saveAlerts([created, ...alertsRef.current]);
      setNewAlertLabel("");
    }
  };

  const handleToggleAlertActive = (id: string) => {
    const next = alertsRef.current.map((a) =>
      a.id === id ? { ...a, active: !a.active } : a
    );
    saveAlerts(next);
  };

  const handleDeleteAlert = (id: string) => {
    const next = alertsRef.current.filter((a) => a.id !== id);
    saveAlerts(next);
  };

  const handleSubmitPaperOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const marginVal = parseFloat(orderMarginUsdt);
    const limitVal = parseFloat(orderLimitPrice);
    const tpVal = orderTp.trim() ? parseFloat(orderTp) : undefined;
    const slVal = orderSl.trim() ? parseFloat(orderSl) : undefined;

    const res = placePaperOrder(
      paperAccountRef.current,
      {
        symbol: selectedSymbol,
        side: orderSide,
        orderType,
        price: orderType === "limit" ? limitVal : currentPrice,
        marginAmountUsdt: marginVal,
        leverage: orderLeverage,
        takeProfit: tpVal && tpVal > 0 ? tpVal : undefined,
        stopLoss: slVal && slVal > 0 ? slVal : undefined,
      },
      currentPrice,
      Date.now()
    );

    savePaperAccount(res.state);
    setTradeFeedback(res.message);
    if (res.status === "placed") {
      setTradeSubTab("orders");
    } else if (res.status === "filled") {
      setTradeSubTab("positions");
    }
    if (res.status !== "rejected" && isSoundEnabledRef.current) {
      playInstitutionalAlertChime();
    }
  };

  if (!isOpen) return null;

  const baseTickerList = activeSymbols
    .map((sym) => tickers[sym] || { symbol: sym, price: 1.0, change: 0, high: 1, low: 1, volume: 1000 })
    .filter((t) => t.symbol.toLowerCase().includes(searchQuery.toLowerCase().trim()));

  const tickerList =
    activeTab === "hot"
      ? [...baseTickerList].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      : baseTickerList;

  const activeAlertCount = alerts.filter((a) => a.active).length;

  const markPricesMap: Record<string, number> = {};
  Object.values(tickers).forEach((t) => {
    markPricesMap[t.symbol] = t.price;
  });
  markPricesMap[selectedSymbol] = currentPrice;

  const equitySummary = calculateAccountEquity(paperAccount, markPricesMap);
  const openTradeCount = paperAccount.positions.length + paperAccount.orders.length;

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="bg-surface-container-lowest border-l border-border flex flex-col h-full select-none shrink-0 z-20 relative"
    >
      {/* Left-Edge Horizontal Resize Handle (260px - 560px, double-click to reset to 320px, DEC-077) */}
      <div
        onMouseDown={handleStartSidebarResize}
        onDoubleClick={() => persistSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
        title="Drag to resize sidebar (260px–560px) · Double-click to reset to 320px"
        className={`absolute -left-1 top-0 bottom-0 w-2 z-30 cursor-col-resize group flex items-center justify-center transition-colors ${
          isResizingSidebar ? "bg-[#2962ff]/40" : "hover:bg-[#2962ff]/25"
        }`}
      >
        <div
          className={`w-[2px] h-10 rounded-full transition-colors ${
            isResizingSidebar ? "bg-[#2962ff]" : "bg-transparent group-hover:bg-[#2962ff]"
          }`}
        />
      </div>

      {/* Floating Alert Triggered Toast Banner (DEC-069 & DEC-079) */}
      {activeToast && (
        <div className="fixed top-14 right-6 z-50 w-80 bg-surface-container-high border-2 border-gold rounded-lg shadow-2xl p-3 font-mono text-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-gold font-bold">
              <BellRing size={15} className="animate-bounce shrink-0" />
              <span>ALERT TRIGGERED · {activeToast.symbol.replace("USDT", "/USDT")}</span>
            </div>
            <button
              onClick={() => setActiveToast(null)}
              className="text-muted hover:text-on-surface p-0.5 cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
          <div className="mt-1.5 text-on-surface font-semibold">{activeToast.label}</div>
          {activeToast.message && (
            <div className="text-[11px] text-muted mt-0.5 italic">{activeToast.message}</div>
          )}
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
            <span>
              Price @{" "}
              <strong className="text-secondary">
                ${activeToast.triggerPrice >= 1 ? activeToast.triggerPrice.toFixed(2) : activeToast.triggerPrice.toFixed(4)}
              </strong>
            </span>
            <span>{new Date(activeToast.triggeredAt).toLocaleTimeString()}</span>
          </div>

          {/* Interactive Paper Trade Action (DEC-079) */}
          {activeToast.strategyOrderSide && (
            <div className="mt-2.5 pt-2 border-t border-border flex items-center gap-1.5">
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("mochex:open-paper-trade", {
                      detail: { side: activeToast.strategyOrderSide === "long" ? "buy" : "sell" },
                    })
                  );
                  setActiveToast(null);
                }}
                className={`flex-1 py-1 px-2 rounded text-[11px] font-bold flex items-center justify-center gap-1 transition-colors shadow-xs ${
                  activeToast.strategyOrderSide === "long"
                    ? "bg-secondary hover:bg-secondary-hover text-surface"
                    : "bg-tertiary hover:bg-tertiary-hover text-white"
                }`}
              >
                <Zap size={12} />
                <span>Paper Trade: {activeToast.strategyOrderSide.toUpperCase()}</span>
              </button>
              <button
                onClick={() => {
                  onSelectSymbol(activeToast.symbol);
                  setActiveTab("alerts");
                  setActiveToast(null);
                }}
                className="py-1 px-2 rounded text-[10px] bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border border-border"
              >
                Inspect
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sidebar Header & Tabs */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-1.5 py-1.5">
        <div className="flex items-center gap-0.5 bg-surface-container-low p-0.5 rounded border border-border">
          <button
            onClick={() => setActiveTab("watchlist")}
            className={`px-1.5 py-1 rounded text-[10px] font-mono font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === "watchlist"
                ? "bg-primary-container text-white shadow-xs"
                : "text-muted hover:text-on-surface"
            }`}
          >
            <Star size={10} />
            <span>List</span>
          </button>
          <button
            onClick={() => setActiveTab("trade")}
            className={`px-1.5 py-1 rounded text-[10px] font-mono font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === "trade"
                ? "bg-primary-container text-white shadow-xs"
                : "text-muted hover:text-on-surface"
            }`}
          >
            <TrendingUp size={10} className={openTradeCount > 0 ? "text-secondary" : ""} />
            <span>Trade</span>
            {openTradeCount > 0 && (
              <span className="px-1 py-0.2 rounded-full bg-secondary/20 text-secondary border border-secondary/40 text-[9px] font-bold">
                {openTradeCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("dom")}
            className={`px-1.5 py-1 rounded text-[10px] font-mono font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === "dom"
                ? "bg-primary-container text-white shadow-xs"
                : "text-muted hover:text-on-surface"
            }`}
          >
            <Activity size={10} />
            <span>DOM</span>
          </button>
          <button
            onClick={() => setActiveTab("alerts")}
            className={`px-1.5 py-1 rounded text-[10px] font-mono font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === "alerts"
                ? "bg-primary-container text-white shadow-xs"
                : "text-muted hover:text-on-surface"
            }`}
          >
            <Bell size={10} className={activeAlertCount > 0 ? "text-gold" : ""} />
            <span>Alerts</span>
            {activeAlertCount > 0 && (
              <span className="px-1 py-0.2 rounded-full bg-gold/20 text-gold border border-gold/40 text-[9px] font-bold">
                {activeAlertCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("objects");
              window.dispatchEvent(new CustomEvent("mochex:request-drawings-sync"));
            }}
            className={`px-1.5 py-1 rounded text-[10px] font-mono font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === "objects"
                ? "bg-primary-container text-white shadow-xs"
                : "text-muted hover:text-on-surface"
            }`}
          >
            <Layers size={10} />
            <span>Objects</span>
            {activeIndicators.length + chartDrawings.length > 0 && (
              <span className="px-1 py-0.2 rounded-full bg-surface-container-high text-primary border border-primary/30 text-[9px] font-bold">
                {activeIndicators.length + chartDrawings.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("hot")}
            className={`px-1.5 py-1 rounded text-[10px] font-mono font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === "hot"
                ? "bg-primary-container text-white shadow-xs"
                : "text-muted hover:text-on-surface"
            }`}
          >
            <Flame size={10} />
            <span>Hot</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface-container transition-colors md:hidden"
        >
          <X size={16} />
        </button>
      </div>

      {activeTab === "trade" ? (
        <div className="flex-1 flex flex-col overflow-hidden font-mono text-xs">
          {/* Paper Account Equity Header */}
          <div className="px-3 py-2 border-b border-border bg-surface-container-low flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={13} className="text-secondary" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface">
                  Paper Trading · {selectedSymbol.replace("USDT", "/USDT")}
                </span>
              </div>
              <button
                onClick={() => {
                  const fresh = createInitialPaperAccount(100000);
                  savePaperAccount(fresh);
                  setTradeFeedback("Paper account reset to $100,000.00");
                }}
                title="Reset Paper Account to $100,000"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-border text-[9px] text-muted hover:text-on-surface cursor-pointer"
              >
                <RotateCcw size={10} />
                <span>Reset $100k</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-surface p-1.5 rounded border border-border/60 text-[10px]">
              <div>
                <div className="text-muted text-[9px] uppercase">Equity</div>
                <div className="font-bold text-on-surface">
                  ${equitySummary.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-muted text-[9px] uppercase">Unrealized</div>
                <div
                  className={`font-bold ${
                    equitySummary.unrealizedPnl >= 0 ? "text-secondary" : "text-tertiary"
                  }`}
                >
                  {equitySummary.unrealizedPnl >= 0 ? "+" : ""}$
                  {equitySummary.unrealizedPnl.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-muted text-[9px] uppercase">Free Margin</div>
                <div className="font-semibold text-on-surface">
                  ${equitySummary.freeMargin.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            {tradeFeedback && (
              <div className="px-2 py-1 rounded bg-primary/15 border border-primary/40 text-primary text-[10px] font-semibold flex items-center justify-between">
                <span className="truncate">{tradeFeedback}</span>
                <button
                  onClick={() => setTradeFeedback(null)}
                  className="text-muted hover:text-on-surface ml-1 cursor-pointer"
                >
                  <X size={11} />
                </button>
              </div>
            )}
          </div>

          {/* Order Execution Ticket Form */}
          <form
            onSubmit={handleSubmitPaperOrder}
            className="p-2.5 border-b border-border bg-surface-container-lowest flex flex-col gap-2"
          >
            {/* Side Switcher: BUY / LONG vs SELL / SHORT */}
            <div className="grid grid-cols-2 gap-1 bg-surface p-0.5 rounded border border-border">
              <button
                type="button"
                onClick={() => setOrderSide("long")}
                className={`py-1.5 rounded text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                  orderSide === "long"
                    ? "bg-[#00c087] text-[#06121c] shadow-xs"
                    : "text-muted hover:text-on-surface"
                }`}
              >
                Buy / Long
              </button>
              <button
                type="button"
                onClick={() => setOrderSide("short")}
                className={`py-1.5 rounded text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                  orderSide === "short"
                    ? "bg-[#ff3b30] text-white shadow-xs"
                    : "text-muted hover:text-on-surface"
                }`}
              >
                Sell / Short
              </button>
            </div>

            {/* Order Type & Leverage Row */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1 bg-surface p-0.5 rounded border border-border">
                <button
                  type="button"
                  onClick={() => setOrderType("market")}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                    orderType === "market"
                      ? "bg-primary-container text-white"
                      : "text-muted hover:text-on-surface"
                  }`}
                >
                  Market
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrderType("limit");
                    if (!orderLimitPrice) {
                      setOrderLimitPrice(
                        currentPrice >= 1 ? currentPrice.toFixed(2) : currentPrice.toFixed(4)
                      );
                    }
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                    orderType === "limit"
                      ? "bg-primary-container text-white"
                      : "text-muted hover:text-on-surface"
                  }`}
                >
                  Limit
                </button>
              </div>

              <div className="flex items-center gap-0.5 bg-surface p-0.5 rounded border border-border">
                {[1, 2, 5, 10, 20].map((lev) => (
                  <button
                    key={lev}
                    type="button"
                    onClick={() => setOrderLeverage(lev)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      orderLeverage === lev
                        ? "bg-gold/20 text-gold border border-gold/40"
                        : "text-muted hover:text-on-surface"
                    }`}
                  >
                    {lev}x
                  </button>
                ))}
              </div>
            </div>

            {/* Limit Price Input (Only if Limit) */}
            {orderType === "limit" && (
              <div className="relative flex items-center">
                <span className="absolute left-2 text-[10px] text-muted">Limit $</span>
                <input
                  type="number"
                  step="any"
                  value={orderLimitPrice}
                  onChange={(e) => setOrderLimitPrice(e.target.value)}
                  placeholder="Limit entry price..."
                  className="w-full bg-surface text-on-surface text-[11px] pl-14 pr-12 py-1 rounded border border-border focus:outline-hidden focus:border-primary text-right"
                />
                <button
                  type="button"
                  onClick={() =>
                    setOrderLimitPrice(
                      currentPrice >= 1 ? currentPrice.toFixed(2) : currentPrice.toFixed(4)
                    )
                  }
                  className="absolute right-1.5 text-[9px] px-1 py-0.5 rounded bg-surface-container-high text-muted hover:text-on-surface cursor-pointer"
                >
                  Last
                </button>
              </div>
            )}

            {/* Margin Collateral Input + Quick % Buttons */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>Margin (USDT)</span>
                <span>
                  Notional:{" "}
                  <strong className="text-on-surface">
                    ${((parseFloat(orderMarginUsdt) || 0) * orderLeverage).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="any"
                  value={orderMarginUsdt}
                  onChange={(e) => setOrderMarginUsdt(e.target.value)}
                  className="flex-1 bg-surface text-on-surface text-[11px] px-2 py-1 rounded border border-border focus:outline-hidden focus:border-primary"
                />
                {[0.1, 0.25, 0.5, 1].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() =>
                      setOrderMarginUsdt(
                        Math.max(10, Math.floor(equitySummary.freeMargin * pct)).toString()
                      )
                    }
                    className="px-1.5 py-1 rounded bg-surface border border-border text-[9px] text-muted hover:text-on-surface cursor-pointer"
                  >
                    {pct * 100}%
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Take Profit & Stop Loss Inputs */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <div className="text-[9px] text-secondary uppercase mb-0.5">Take Profit ($)</div>
                <input
                  type="number"
                  step="any"
                  value={orderTp}
                  onChange={(e) => setOrderTp(e.target.value)}
                  placeholder="Optional TP"
                  className="w-full bg-surface text-on-surface text-[11px] px-2 py-1 rounded border border-border focus:outline-hidden focus:border-secondary"
                />
              </div>
              <div>
                <div className="text-[9px] text-tertiary uppercase mb-0.5">Stop Loss ($)</div>
                <input
                  type="number"
                  step="any"
                  value={orderSl}
                  onChange={(e) => setOrderSl(e.target.value)}
                  placeholder="Optional SL"
                  className="w-full bg-surface text-on-surface text-[11px] px-2 py-1 rounded border border-border focus:outline-hidden focus:border-tertiary"
                />
              </div>
            </div>

            {/* Submit Order Button */}
            <button
              type="submit"
              className={`w-full py-1.5 rounded font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer shadow-sm ${
                orderSide === "long"
                  ? "bg-[#00c087] hover:bg-[#00d696] text-[#06121c]"
                  : "bg-[#ff3b30] hover:bg-[#ff5147] text-white"
              }`}
            >
              {orderType === "market"
                ? `${orderSide === "long" ? "Buy / Long" : "Sell / Short"} ${selectedSymbol.replace("USDT", "")} @ MKT`
                : `Place Limit ${orderSide.toUpperCase()} @ $${orderLimitPrice || currentPrice.toFixed(2)}`}
            </button>
          </form>

          {/* Positions / Working Orders / Closed History Sub-Tabs */}
          <div className="grid grid-cols-3 border-b border-border bg-surface text-[10px]">
            <button
              onClick={() => setTradeSubTab("positions")}
              className={`py-1.5 font-semibold border-b-2 transition-colors cursor-pointer ${
                tradeSubTab === "positions"
                  ? "border-primary text-primary bg-surface-container-low"
                  : "border-transparent text-muted hover:text-on-surface"
              }`}
            >
              Positions ({paperAccount.positions.length})
            </button>
            <button
              onClick={() => setTradeSubTab("orders")}
              className={`py-1.5 font-semibold border-b-2 transition-colors cursor-pointer ${
                tradeSubTab === "orders"
                  ? "border-primary text-primary bg-surface-container-low"
                  : "border-transparent text-muted hover:text-on-surface"
              }`}
            >
              Orders ({paperAccount.orders.length})
            </button>
            <button
              onClick={() => setTradeSubTab("history")}
              className={`py-1.5 font-semibold border-b-2 transition-colors cursor-pointer ${
                tradeSubTab === "history"
                  ? "border-primary text-primary bg-surface-container-low"
                  : "border-transparent text-muted hover:text-on-surface"
              }`}
            >
              History ({paperAccount.history.length})
            </button>
          </div>

          {/* Sub-Tab List Content */}
          <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-border/40">
            {tradeSubTab === "positions" ? (
              paperAccount.positions.length === 0 ? (
                <div className="p-4 text-center text-[11px] text-muted">
                  No open paper positions. Execute an order above or click{" "}
                  <strong className="text-secondary">Trade</strong> on any Long/Short Position chart drawing.
                </div>
              ) : (
                paperAccount.positions.map((pos) => {
                  const mark = markPricesMap[pos.symbol] ?? pos.entryPrice;
                  const pnl = calculatePositionUnrealizedPnl(pos, mark);
                  const isPosProfitable = pnl.unrealizedPnl >= 0;

                  return (
                    <div
                      key={pos.id}
                      className="px-3 py-2 flex flex-col gap-1 bg-surface-container-lowest hover:bg-surface-container-low transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                              pos.side === "long"
                                ? "bg-secondary/20 text-secondary border border-secondary/40"
                                : "bg-tertiary/20 text-tertiary border border-tertiary/40"
                            }`}
                          >
                            {pos.side} {pos.leverage}x
                          </span>
                          <span
                            onClick={() => onSelectSymbol(pos.symbol)}
                            className="font-bold text-on-surface hover:text-primary cursor-pointer"
                          >
                            {pos.symbol.replace("USDT", "/USDT")}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const closed = closePaperPosition(
                              paperAccountRef.current,
                              pos.id,
                              mark,
                              "manual",
                              Date.now()
                            );
                            savePaperAccount(closed.state);
                            if (closed.closedTrade) {
                              const sign = closed.closedTrade.realizedPnl >= 0 ? "+" : "";
                              setTradeFeedback(
                                `Closed ${pos.symbol.replace("USDT", "")} (${sign}$${closed.closedTrade.realizedPnl.toFixed(2)})`
                              );
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-surface-container-high hover:bg-tertiary/20 text-muted hover:text-tertiary border border-border text-[10px] font-semibold cursor-pointer transition-colors"
                        >
                          Close MKT
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-muted">
                        <span>
                          Entry:{" "}
                          <strong className="text-on-surface">
                            ${pos.entryPrice >= 1 ? pos.entryPrice.toFixed(2) : pos.entryPrice.toFixed(4)}
                          </strong>{" "}
                          · Mark:{" "}
                          <strong className="text-on-surface">
                            ${mark >= 1 ? mark.toFixed(2) : mark.toFixed(4)}
                          </strong>
                        </span>
                        <span
                          className={`font-bold ${
                            isPosProfitable ? "text-secondary" : "text-tertiary"
                          }`}
                        >
                          {isPosProfitable ? "+" : ""}${pnl.unrealizedPnl.toFixed(2)} (
                          {isPosProfitable ? "+" : ""}
                          {pnl.roePercent.toFixed(1)}%)
                        </span>
                      </div>

                      {(pos.takeProfit || pos.stopLoss) && (
                        <div className="flex items-center gap-2 text-[9px] text-muted">
                          {pos.takeProfit && (
                            <span className="text-secondary">
                              TP: ${pos.takeProfit >= 1 ? pos.takeProfit.toFixed(2) : pos.takeProfit.toFixed(4)}
                            </span>
                          )}
                          {pos.stopLoss && (
                            <span className="text-tertiary">
                              SL: ${pos.stopLoss >= 1 ? pos.stopLoss.toFixed(2) : pos.stopLoss.toFixed(4)}
                            </span>
                          )}
                          <span>· Margin: ${pos.marginUsed.toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )
            ) : tradeSubTab === "orders" ? (
              paperAccount.orders.length === 0 ? (
                <div className="p-4 text-center text-[11px] text-muted">
                  No working limit orders.
                </div>
              ) : (
                paperAccount.orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 bg-surface-container-lowest"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1 py-0.2 rounded text-[9px] font-bold uppercase ${
                            ord.side === "long"
                              ? "bg-secondary/20 text-secondary"
                              : "bg-tertiary/20 text-tertiary"
                          }`}
                        >
                          LIMIT {ord.side} {ord.leverage}x
                        </span>
                        <span className="font-bold text-on-surface">
                          {ord.symbol.replace("USDT", "/USDT")}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        Target: <strong className="text-on-surface">${ord.limitPrice.toFixed(2)}</strong> · Margin: ${ord.marginReserved.toFixed(0)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const next = cancelPaperOrder(paperAccountRef.current, ord.id);
                        savePaperAccount(next);
                      }}
                      className="px-2 py-0.5 rounded bg-surface-container-low hover:bg-tertiary/15 text-muted hover:text-tertiary border border-border text-[10px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ))
              )
            ) : paperAccount.history.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-muted">
                No closed paper trades yet.
              </div>
            ) : (
              paperAccount.history.map((trd) => {
                const isWin = trd.realizedPnl >= 0;
                return (
                  <div
                    key={trd.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 bg-surface-container-lowest text-[10px]"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1 py-0.2 rounded text-[9px] font-bold uppercase ${
                            trd.side === "long"
                              ? "bg-secondary/20 text-secondary"
                              : "bg-tertiary/20 text-tertiary"
                          }`}
                        >
                          {trd.side} {trd.leverage}x
                        </span>
                        <span className="font-bold text-on-surface">
                          {trd.symbol.replace("USDT", "/USDT")}
                        </span>
                        <span className="text-[9px] px-1 rounded bg-surface-container-high text-muted uppercase">
                          {trd.exitReason.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-muted mt-0.5">
                        ${trd.entryPrice.toFixed(2)} → ${trd.exitPrice.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${isWin ? "text-secondary" : "text-tertiary"}`}>
                        {isWin ? "+" : ""}${trd.realizedPnl.toFixed(2)}
                      </div>
                      <div className="text-[9px] text-muted">
                        {isWin ? "+" : ""}
                        {trd.realizedPnlPercent.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : activeTab === "dom" ? (
        <DepthOfMarketTape
          symbol={selectedSymbol}
          currentPrice={currentPrice}
          openOrders={paperAccount.orders}
          onExecutePaperOrder={(order) => {
            const mark = currentPriceRef.current || currentPrice;
            const res = placePaperOrder(paperAccountRef.current, order, mark, Date.now());
            savePaperAccount(res.state);
            setTradeFeedback(res.message);
            if (isSoundEnabledRef.current) {
              playInstitutionalAlertChime();
            }
          }}
          onCancelPaperOrder={(orderId) => {
            const next = cancelPaperOrder(paperAccountRef.current, orderId);
            savePaperAccount(next);
            setTradeFeedback("Order cancelled");
          }}
        />
      ) : activeTab === "objects" ? (
        <div className="flex-1 flex flex-col overflow-hidden font-mono">
          {/* Object Tree Header */}
          <div className="px-3 py-2 border-b border-border bg-surface-container-low flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Layers size={13} className="text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface">
                Object Tree · {selectedSymbol.replace("USDT", "/USDT")}
              </span>
            </div>
            <span className="text-[10px] text-muted">
              {activeIndicators.length + chartDrawings.length} layers
            </span>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-border/40">
            {/* Section 1: Active Technical Indicators */}
            <div className="bg-surface-container-lowest">
              <div className="px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider bg-surface flex items-center justify-between">
                <span>Active Indicators ({activeIndicators.length})</span>
                <span className="text-[9px] text-primary italic">fx</span>
              </div>
              {activeIndicators.length === 0 ? (
                <div className="px-3 py-2.5 text-[11px] text-muted">
                  No active indicators on chart.
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {activeIndicators.map((indName) => {
                    const isHidden = hiddenIndicators.includes(indName);
                    return (
                      <div
                        key={indName}
                        className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-surface-container-low transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isHidden ? "bg-muted" : "bg-primary"
                            }`}
                          />
                          <span
                            className={`text-xs font-semibold truncate ${
                              isHidden ? "line-through text-muted" : "text-on-surface"
                            }`}
                          >
                            {indName}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {indName.toLowerCase().includes("candle") ? (
                            <button
                              onClick={() => window.dispatchEvent(new CustomEvent("mochex:open-candle-structure-settings"))}
                              title="Candle Structure Settings"
                              className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer transition-colors"
                            >
                              <Settings2 size={11} />
                            </button>
                          ) : indName.toLowerCase().includes("structure") ? (
                            <button
                              onClick={() => window.dispatchEvent(new CustomEvent("mochex:open-market-structure-settings"))}
                              title="Structure Settings"
                              className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer transition-colors"
                            >
                              <Settings2 size={11} />
                            </button>
                          ) : indName.toLowerCase().includes("mtf ema") || indName.toLowerCase().includes("mtf-ema") ? (
                            <button
                              onClick={() => window.dispatchEvent(new CustomEvent("mochex:open-mtf-ema-settings"))}
                              title="MTF EMA Settings"
                              className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer transition-colors"
                            >
                              <Settings2 size={11} />
                            </button>
                          ) : indName.toLowerCase().includes("sandwich") || indName.toLowerCase().includes("rgrr") ? (
                            <button
                              onClick={() => window.dispatchEvent(new CustomEvent("mochex:open-sandwich-settings"))}
                              title="Sandwich Zones Settings"
                              className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer transition-colors"
                            >
                              <Settings2 size={11} />
                            </button>
                          ) : null}
                          {onToggleIndicatorVisibility && (
                            <button
                              onClick={() => onToggleIndicatorVisibility(indName)}
                              title={isHidden ? "Show Indicator" : "Hide Indicator"}
                              className={`p-1 rounded cursor-pointer transition-colors ${
                                isHidden
                                  ? "text-tertiary bg-tertiary/10"
                                  : "text-muted hover:text-on-surface hover:bg-surface"
                              }`}
                            >
                              {isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                          )}
                          {onToggleIndicator && (
                            <button
                              onClick={() => onToggleIndicator(indName)}
                              title="Remove Indicator"
                              className="p-1 rounded text-muted hover:text-tertiary hover:bg-tertiary/10 transition-colors cursor-pointer"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section 2: Chart Drawings (Displayed Top-to-Bottom Z-Order) */}
            <div className="bg-surface-container-lowest">
              <div className="px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider bg-surface flex items-center justify-between">
                <span>Drawing Layers ({chartDrawings.length})</span>
                <span className="text-[9px] text-outline">Top = Front Z-Order</span>
              </div>

              {chartDrawings.length === 0 ? (
                <div className="p-4 text-center text-[11px] text-muted">
                  No drawings on {selectedSymbol.replace("USDT", "/USDT")}. Select a tool from the left rail to draw on the canvas.
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {[...chartDrawings].reverse().map((d, revIdx) => {
                    const isSelected = d.id === selectedDrawingId;
                    const isEditing = d.id === editingDrawingId;
                    const isTopMost = revIdx === 0;
                    const isBottomMost = revIdx === chartDrawings.length - 1;

                    return (
                      <div
                        key={d.id}
                        onClick={() => dispatchObjectTreeAction("select", d.id)}
                        className={`px-2.5 py-2 flex flex-col gap-1.5 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-surface-container-high border-l-2 border-l-primary-container"
                            : "hover:bg-surface-container-low"
                        } ${d.isHidden ? "opacity-55" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-border shrink-0"
                              style={{ backgroundColor: d.color || "#2962ff" }}
                            />
                            {isEditing ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  dispatchObjectTreeAction("rename", d.id, {
                                    name: editingNameValue,
                                  });
                                  setEditingDrawingId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 flex-1"
                              >
                                <input
                                  type="text"
                                  value={editingNameValue}
                                  onChange={(e) => setEditingNameValue(e.target.value)}
                                  autoFocus
                                  placeholder="Layer name..."
                                  className="w-full bg-surface text-on-surface text-[11px] px-1.5 py-0.5 rounded border border-primary focus:outline-hidden"
                                />
                                <button
                                  type="submit"
                                  className="p-0.5 rounded bg-primary text-white cursor-pointer"
                                  title="Save Name"
                                >
                                  <Check size={11} />
                                </button>
                              </form>
                            ) : (
                              <span
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingDrawingId(d.id);
                                  setEditingNameValue(d.name || formatDrawingObjectLabel(d));
                                }}
                                className={`text-xs font-semibold truncate ${
                                  d.isHidden ? "line-through text-muted" : "text-on-surface"
                                }`}
                                title="Click to select · Double-click to rename"
                              >
                                {formatDrawingObjectLabel(d)}
                              </span>
                            )}
                          </div>

                          {/* Layer Action Controls */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-0.5 shrink-0"
                          >
                            {/* Rename button */}
                            <button
                              onClick={() => {
                                setEditingDrawingId(d.id);
                                setEditingNameValue(d.name || formatDrawingObjectLabel(d));
                              }}
                              title="Rename Layer"
                              className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer"
                            >
                              <Edit3 size={11} />
                            </button>

                            {/* Bring Forward (Move Up in Z-order) */}
                            <button
                              onClick={() =>
                                dispatchObjectTreeAction("reorder", d.id, {
                                  direction: "forward",
                                })
                              }
                              disabled={isTopMost}
                              title="Bring Forward"
                              className={`p-1 rounded ${
                                isTopMost
                                  ? "text-muted/25 cursor-not-allowed"
                                  : "text-muted hover:text-on-surface hover:bg-surface cursor-pointer"
                              }`}
                            >
                              <ChevronUp size={11} />
                            </button>

                            {/* Send Backward (Move Down in Z-order) */}
                            <button
                              onClick={() =>
                                dispatchObjectTreeAction("reorder", d.id, {
                                  direction: "backward",
                                })
                              }
                              disabled={isBottomMost}
                              title="Send Backward"
                              className={`p-1 rounded ${
                                isBottomMost
                                  ? "text-muted/25 cursor-not-allowed"
                                  : "text-muted hover:text-on-surface hover:bg-surface cursor-pointer"
                              }`}
                            >
                              <ChevronDown size={11} />
                            </button>

                            {/* Visibility Eye Toggle */}
                            <button
                              onClick={() => dispatchObjectTreeAction("toggle_hide", d.id)}
                              title={d.isHidden ? "Show Layer" : "Hide Layer"}
                              className={`p-1 rounded cursor-pointer ${
                                d.isHidden
                                  ? "text-tertiary bg-tertiary/10"
                                  : "text-muted hover:text-on-surface hover:bg-surface"
                              }`}
                            >
                              {d.isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>

                            {/* Lock Toggle */}
                            <button
                              onClick={() => dispatchObjectTreeAction("toggle_lock", d.id)}
                              title={d.isLocked ? "Unlock Layer" : "Lock Layer"}
                              className={`p-1 rounded cursor-pointer ${
                                d.isLocked
                                  ? "text-gold bg-gold/10"
                                  : "text-muted hover:text-on-surface hover:bg-surface"
                              }`}
                            >
                              {d.isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                            </button>

                            {/* Clone / Duplicate */}
                            <button
                              onClick={() => dispatchObjectTreeAction("clone", d.id)}
                              title="Clone / Duplicate Layer (Ctrl+D)"
                              className="p-1 rounded text-muted hover:text-primary hover:bg-surface cursor-pointer"
                            >
                              <Copy size={11} />
                            </button>

                            {/* Open 3-Tab Settings Modal */}
                            <button
                              onClick={() => dispatchObjectTreeAction("open_settings", d.id)}
                              title="Layer Settings"
                              className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer"
                            >
                              <Settings2 size={11} />
                            </button>

                            {/* Delete Layer */}
                            <button
                              onClick={() => dispatchObjectTreeAction("delete", d.id)}
                              disabled={d.isLocked}
                              title={d.isLocked ? "Unlock to Delete" : "Delete Layer"}
                              className={`p-1 rounded ${
                                d.isLocked
                                  ? "opacity-30 cursor-not-allowed"
                                  : "text-muted hover:text-tertiary hover:bg-tertiary/10 cursor-pointer"
                              }`}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "alerts" ? (
        <div className="flex-1 flex flex-col overflow-hidden font-mono">
          {/* Create Alert Form (Dual Mode: Price Level vs Strategy / Indicator - DEC-079) */}
          <form
            onSubmit={handleCreateManualAlert}
            className="p-2.5 border-b border-border bg-surface-container-low flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface">
                + New Alert ({selectedSymbol.replace("USDT", "/USDT")})
              </span>
              <button
                type="button"
                onClick={() => setIsSoundEnabled((prev) => !prev)}
                title={isSoundEnabled ? "Chime Sound Enabled" : "Chime Sound Muted"}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border cursor-pointer transition-colors ${
                  isSoundEnabled
                    ? "bg-gold/15 text-gold border-gold/30"
                    : "bg-surface text-muted border-border"
                }`}
              >
                {isSoundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
                <span>{isSoundEnabled ? "Chime On" : "Muted"}</span>
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded bg-surface border border-border">
              <button
                type="button"
                onClick={() => {
                  setAlertFormMode("price");
                  setNewAlertCondition("crossing");
                  setNewAlertFrequency("only_once");
                }}
                className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${
                  alertFormMode === "price"
                    ? "bg-primary-container text-white shadow-xs"
                    : "text-muted hover:text-on-surface"
                }`}
              >
                Price Level
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlertFormMode("strategy");
                  setNewAlertCondition("strategy_any_order");
                  setNewAlertFrequency("once_per_bar_close");
                }}
                className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${
                  alertFormMode === "strategy"
                    ? "bg-primary-container text-white shadow-xs"
                    : "text-muted hover:text-on-surface"
                }`}
              >
                Strategy / Indicator
              </button>
            </div>

            {alertFormMode === "price" ? (
              <div className="grid grid-cols-12 gap-1.5">
                <div className="col-span-5">
                  <select
                    value={newAlertCondition}
                    onChange={(e) => setNewAlertCondition(e.target.value as AlertCondition)}
                    className="w-full bg-surface text-on-surface text-[11px] px-1.5 py-1.5 rounded border border-border focus:outline-hidden focus:border-primary"
                  >
                    <option value="crossing">Crossing</option>
                    <option value="crossing_up">Cross Up</option>
                    <option value="crossing_down">Cross Down</option>
                  </select>
                </div>
                <div className="col-span-7 relative flex items-center">
                  <input
                    type="number"
                    step="any"
                    value={newAlertPrice}
                    onChange={(e) => setNewAlertPrice(e.target.value)}
                    placeholder="Target Price..."
                    className="w-full bg-surface text-on-surface text-[11px] pl-2 pr-12 py-1.5 rounded border border-border focus:outline-hidden focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setNewAlertPrice(
                        currentPrice >= 1 ? currentPrice.toFixed(2) : currentPrice.toFixed(4)
                      )
                    }
                    className="absolute right-1.5 text-[9px] px-1 py-0.5 rounded bg-surface-container-high text-muted hover:text-on-surface cursor-pointer"
                    title="Set to current mark price"
                  >
                    Last
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <select
                  value={newAlertCondition}
                  onChange={(e) => setNewAlertCondition(e.target.value as AlertCondition)}
                  className="w-full bg-surface text-on-surface text-[11px] px-1.5 py-1.5 rounded border border-border focus:outline-hidden focus:border-primary"
                >
                  <optgroup label="Strategy Order Signals">
                    <option value="strategy_any_order">Strategy: Any Order Execution</option>
                    <option value="strategy_entry_long">Strategy: Long Entry</option>
                    <option value="strategy_entry_short">Strategy: Short Entry</option>
                    <option value="strategy_close">Strategy: Close / Exit</option>
                  </optgroup>
                  <optgroup label="Indicator Conditions">
                    <option value="indicator_bullish_cross">Indicator: Bullish Cross (EMA 9 &gt; 21)</option>
                    <option value="indicator_bearish_cross">Indicator: Bearish Cross (EMA 9 &lt; 21)</option>
                    <option value="indicator_oversold">Indicator: RSI Oversold (≤ 30)</option>
                    <option value="indicator_overbought">Indicator: RSI Overbought (≥ 70)</option>
                    <option value="indicator_bb_squeeze">Indicator: Bollinger Band Squeeze (≤ 2.2%)</option>
                    <option value="script_condition">Script: alertcondition() Trigger</option>
                  </optgroup>
                </select>
                <input
                  type="text"
                  value={newAlertScriptName}
                  onChange={(e) => setNewAlertScriptName(e.target.value)}
                  placeholder="Script / Indicator Name (optional)..."
                  className="w-full bg-surface text-on-surface placeholder-muted text-[11px] px-2 py-1.5 rounded border border-border focus:outline-hidden focus:border-primary"
                />
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newAlertLabel}
                onChange={(e) => setNewAlertLabel(e.target.value)}
                placeholder="Alert note (optional)..."
                className="flex-1 bg-surface text-on-surface placeholder-muted text-[11px] px-2 py-1 rounded border border-border focus:outline-hidden focus:border-primary"
              />
              <select
                value={newAlertFrequency}
                onChange={(e) => setNewAlertFrequency(e.target.value as AlertFrequency)}
                className="bg-surface text-on-surface text-[10px] px-1.5 py-1 rounded border border-border shrink-0 cursor-pointer focus:outline-hidden"
              >
                {alertFormMode === "strategy" ? (
                  <>
                    <option value="once_per_bar_close">Bar Close</option>
                    <option value="every_time">Every Tick</option>
                    <option value="only_once">Once</option>
                  </>
                ) : (
                  <>
                    <option value="only_once">Once</option>
                    <option value="every_time">Every 60s</option>
                    <option value="once_per_bar_close">Bar Close</option>
                  </>
                )}
              </select>
              <button
                type="submit"
                className="px-2.5 py-1 rounded bg-primary-container hover:bg-primary text-white text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
              >
                <Plus size={12} />
                <span>Add</span>
              </button>
            </div>
          </form>

          {/* Active & Paused Alerts List */}
          <div className="px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider border-b border-border bg-surface-container-lowest flex items-center justify-between">
            <span>Configured Alerts ({alerts.length})</span>
            <span className="text-[9px] text-outline">Click 🔔 on drawings to link</span>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-border/40">
            {alerts.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-muted">
                No alerts configured yet. Add a price level or strategy condition above, or click the{" "}
                <strong className="text-gold">Bell +</strong> icon on drawings/scripts.
              </div>
            ) : (
              alerts.map((a) => {
                const formattedTarget =
                  a.targetPrice >= 1 ? a.targetPrice.toFixed(2) : a.targetPrice.toFixed(4);
                return (
                  <div
                    key={a.id}
                    className={`px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                      a.active ? "bg-surface-container-lowest" : "bg-surface-container-low/40 opacity-60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          onClick={() => onSelectSymbol(a.symbol)}
                          className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                        >
                          {a.symbol.replace("USDT", "/USDT")}
                        </span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-surface-container-high text-muted uppercase">
                          {a.sourceType.replace(/_/g, " ")}
                        </span>
                        {a.scriptName && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-primary-container/20 text-primary truncate max-w-[100px]">
                            {a.scriptName}
                          </span>
                        )}
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                            a.active
                              ? "bg-gold/15 text-gold border border-gold/30"
                              : "bg-surface text-muted border border-border"
                          }`}
                        >
                          {a.active ? "ACTIVE" : "PAUSED"}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-on-surface truncate mt-0.5">
                        {a.label}
                      </div>
                      <div className="text-[10px] text-muted flex items-center gap-2 mt-0.5">
                        <span>
                          {a.condition.replace(/_/g, " ").toUpperCase()}
                          {a.sourceType === "strategy_order" || a.sourceType === "indicator_condition"
                            ? ""
                            : ` @ $${formattedTarget}`}
                        </span>
                        <span>
                          ·{" "}
                          {a.frequency === "once_per_bar_close"
                            ? "Bar Close"
                            : a.frequency === "only_once"
                            ? "Once"
                            : "Every 60s"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleAlertActive(a.id)}
                        title={a.active ? "Pause Alert" : "Resume Alert"}
                        className="p-1 rounded bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border border-border cursor-pointer"
                      >
                        {a.active ? <Pause size={11} /> : <Play size={11} />}
                      </button>
                      <button
                        onClick={() => handleDeleteAlert(a.id)}
                        title="Delete Alert"
                        className="p-1 rounded bg-surface-container-low hover:bg-tertiary/15 text-muted hover:text-tertiary border border-border cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Triggered Alert Log Section */}
          <div className="h-36 border-t border-border bg-surface flex flex-col shrink-0">
            <div className="px-3 py-1 text-[10px] text-muted uppercase tracking-wider border-b border-border flex items-center justify-between">
              <span>Triggered Alert Log ({alertLogs.length})</span>
              {alertLogs.length > 0 && (
                <button
                  onClick={() => saveAlertLogs([])}
                  className="text-[9px] text-muted hover:text-tertiary cursor-pointer"
                >
                  Clear Log
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-border/30">
              {alertLogs.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-muted">
                  Waiting for live price crossings...
                </div>
              ) : (
                alertLogs.map((log) => (
                  <div key={log.id} className="px-3 py-1.5 text-[10px] flex items-center justify-between">
                    <div className="truncate pr-2">
                      <span className="text-gold font-bold mr-1">🔔 {log.symbol.replace("USDT", "")}</span>
                      <span className="text-on-surface">{log.label}</span>
                    </div>
                    <div className="text-right shrink-0 text-muted">
                      <div className="text-secondary font-semibold">
                        ${log.triggerPrice >= 1 ? log.triggerPrice.toFixed(2) : log.triggerPrice.toFixed(4)}
                      </div>
                      <div className="text-[9px]">
                        {new Date(log.triggeredAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Named Watchlist Profile Selector Ribbon (DEC-091) */}
          <div className="px-2.5 py-1.5 border-b border-border bg-surface-container-low flex items-center justify-between text-xs font-mono">
            <div className="relative">
              <button
                onClick={() => setIsListDropdownOpen(!isListDropdownOpen)}
                className="flex items-center gap-1.5 text-on-surface hover:text-primary font-semibold transition-colors cursor-pointer"
              >
                <List size={12} className="text-muted" />
                <span suppressHydrationWarning>{activeTab === "hot" ? "24h Volatility Leaders" : activeListName}</span>
                <ChevronDown size={11} className="text-muted" />
              </button>

              {isListDropdownOpen && activeTab !== "hot" && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-surface-container-low border border-border rounded-md shadow-2xl py-1 z-50">
                  <div className="px-2.5 py-1 border-b border-border text-[10px] font-semibold text-muted uppercase tracking-wider flex items-center justify-between">
                    <span>Token Groups / Profiles</span>
                    <button
                      onClick={() => setIsCreatingProfile(true)}
                      className="text-primary hover:underline flex items-center gap-0.5 text-[10px] cursor-pointer"
                    >
                      <Plus size={10} />
                      <span>New</span>
                    </button>
                  </div>

                  {/* Profile list */}
                  <div className="max-h-52 overflow-y-auto py-0.5">
                    {profiles.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-surface-container transition-colors cursor-pointer group ${
                          p.id === activeProfileId ? "text-primary font-bold bg-primary/10" : "text-on-surface"
                        }`}
                        onClick={() => handleSelectProfile(p.id)}
                      >
                        {editingProfileId === p.id ? (
                          <input
                            type="text"
                            value={editingProfileName}
                            onChange={(e) => setEditingProfileName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameProfile(p.id, editingProfileName);
                              if (e.key === "Escape") setEditingProfileId(null);
                            }}
                            onBlur={() => handleRenameProfile(p.id, editingProfileName)}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="bg-surface px-1.5 py-0.5 rounded border border-primary text-xs text-on-surface w-32 outline-hidden"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 truncate">
                            {p.id === activeProfileId && <Check size={12} className="text-primary shrink-0" />}
                            <span className="truncate">{p.name}</span>
                            <span className="text-[10px] text-muted font-normal shrink-0">({p.symbols.length})</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProfileId(p.id);
                              setEditingProfileName(p.name);
                            }}
                            title="Rename Profile"
                            className="p-1 hover:text-primary text-muted rounded cursor-pointer"
                          >
                            <Edit3 size={11} />
                          </button>
                          {profiles.length > 1 && (
                            <button
                              onClick={(e) => handleDeleteProfile(p.id, e)}
                              title="Delete Profile"
                              className="p-1 hover:text-tertiary text-muted rounded cursor-pointer"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Inline Create Form */}
                  {isCreatingProfile && (
                    <form onSubmit={handleCreateProfile} className="p-2 border-t border-border bg-surface-container-lowest">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="Profile name..."
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          autoFocus
                          className="flex-1 bg-surface-container-low px-2 py-1 rounded text-xs border border-border text-on-surface outline-hidden"
                        />
                        <button
                          type="submit"
                          disabled={!newProfileName.trim()}
                          className="px-2 py-1 rounded bg-primary text-white text-[10px] font-semibold hover:bg-primary-hover disabled:opacity-40 cursor-pointer"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingProfile(false);
                            setNewProfileName("");
                          }}
                          className="p-1 text-muted hover:text-on-surface cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            <span suppressHydrationWarning className="text-[10px] text-muted">{tickerList.length} pairs</span>
          </div>

          {/* Search Input + Add Pair Action */}
          <div className="p-2 border-b border-border bg-surface-container-lowest flex items-center gap-2">
            <div className="flex-1 relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pair in list..."
                className="w-full bg-surface-container-low text-on-surface placeholder-muted text-xs font-mono pl-7 pr-2 py-1.5 rounded border border-outline-variant/30 focus:outline-hidden focus:border-primary-container transition-colors"
              />
            </div>
            <button
              onClick={() => setIsAddPairOpen(true)}
              title="Add MEXC Spot Pair to Watchlist"
              className="p-1.5 rounded bg-surface-container-low hover:bg-surface-container text-muted hover:text-primary border border-outline-variant/30 transition-colors shrink-0"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Ticker Table Header */}
          <div className="grid grid-cols-12 px-3 py-1.5 text-[10px] font-mono text-muted uppercase tracking-wider border-b border-border bg-surface-container-lowest">
            <span className="col-span-5 text-left">Symbol / Vol</span>
            <span className="col-span-4 text-right">Last Price</span>
            <span className="col-span-3 text-right">24h Chg</span>
          </div>

          {/* High-Density Ticker Rows */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {tickerList.map((t) => {
              const isSelected = t.symbol === selectedSymbol;
              const isPositive = t.change >= 0;
              return (
                <div
                  key={t.symbol}
                  onClick={() => onSelectSymbol(t.symbol)}
                  className={`grid grid-cols-12 items-center px-3 py-2 cursor-pointer transition-colors border-b border-border/40 group ${
                    isSelected
                      ? "bg-surface-container-high border-l-2 border-l-primary-container"
                      : "hover:bg-surface-container-low"
                  }`}
                >
                  {/* Symbol & Volume */}
                  <div className="col-span-5 flex flex-col">
                    <span className="text-xs font-mono font-bold text-on-surface">
                      {t.symbol.replace("USDT", "")}
                      <span className="text-[10px] font-normal text-muted">/USDT</span>
                    </span>
                    <span className="text-[9px] font-mono text-muted">
                      Vol {t.volume >= 1000 ? `${(t.volume / 1000).toFixed(1)}K` : t.volume.toFixed(0)}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="col-span-4 text-right font-mono text-xs font-semibold text-on-surface">
                    {calculatePricePrecision(t.price).formatPrice(t.price)}
                  </div>

                  {/* Change Pill + Quick Remove */}
                  <div className="col-span-3 flex items-center justify-end gap-1">
                    <span
                      className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded text-right ${
                        isPositive
                          ? "bg-secondary/15 text-secondary border border-secondary/30"
                          : "bg-tertiary/15 text-tertiary border border-tertiary/30"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {t.change.toFixed(2)}%
                    </span>

                    <button
                      onClick={(e) => handleRemoveSymbol(t.symbol, e)}
                      title="Remove from watchlist"
                      className="hidden group-hover:block text-muted hover:text-tertiary transition-colors ml-1"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Mini Order Depth Ladder Component */}
      {(activeTab === "watchlist" || activeTab === "hot") && (
        <OrderDepthLadder symbol={selectedSymbol} currentPrice={currentPrice} />
      )}

      {/* Add Pair Search Modal */}
      <AddPairModal
        isOpen={isAddPairOpen}
        onClose={() => setIsAddPairOpen(false)}
        existingSymbols={activeSymbols}
        onAddSymbol={handleAddSymbol}
      />
    </aside>
  );
}
