"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { TacticalHeader } from "@/components/terminal/TacticalHeader";
import { DrawingRail, DrawingToolType } from "@/components/terminal/DrawingRail";
import { RightSidebar } from "@/components/terminal/RightSidebar";
import { ScriptStudio } from "@/components/terminal/ScriptStudio";
import { MarketScreenerDrawer } from "@/components/terminal/MarketScreenerDrawer";
import { IndicatorsModal } from "@/components/terminal/IndicatorsModal";
import { ShortcutsCheatsheetModal } from "@/components/terminal/ShortcutsCheatsheetModal";
import { ChartSnapshotModal } from "@/components/chart/ChartSnapshotModal";
import { captureChartSnapshot, ChartSnapshotResult } from "@/lib/chart/chart-snapshot";
import { ReplaySimulationPill } from "@/components/terminal/ReplaySimulationPill";
import { TradingViewContainer } from "@/components/chart/TradingViewContainer";
import { MobileTacticalDrawer } from "@/components/mobile/MobileTacticalDrawer";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { AuthModal } from "@/components/auth/AuthModal";
import { replayEngine } from "@/lib/replay/replay-engine";
import { CandlestickBar } from "@/lib/mexc/types";
import { BacktestPerformance, BacktestTrade } from "@/lib/strategy/types";
import { indicatorSandbox } from "@/lib/indicators/sandbox";
import { STRATEGY_PRESETS } from "@/lib/strategy/presets";
import { useAuth } from "@/lib/auth/use-auth";
import { SavedLayoutItem } from "@/components/terminal/LayoutDropdown";
import {
  createInitialMultiChartState,
  getVisiblePanes,
  getActivePane,
  setGridLayoutMode,
  updateActivePaneSymbol,
  updateActivePaneResolution,
  toggleGridSyncOption,
  toggleMaximizePane,
  GridLayoutMode,
  GridSyncConfig,
  MultiChartWorkspaceState,
} from "@/lib/chart/multi-chart-grid";
import { isTypingTarget } from "@/lib/ui/keyboard-shortcuts";
import {
  DEFAULT_SPLIT_SIZES,
  SplitSizesByLayout,
  buildGridTemplate,
  computeSplitFraction,
  parseSplitSizes,
} from "@/lib/ui/resizable-layout";

function formatResolutionBadge(res: string): string {
  if (res === "1D" || res === "1W") return res;
  const mins = Number(res);
  if (mins >= 60) return `${mins / 60}H`;
  return `${res}m`;
}

export default function WorkstationPage() {
  // Authentication session
  const { user, login, register, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Multi-Chart Split-Screen Workspace State & Resizable Split Fractions (DEC-075 & DEC-077)
  const [gridState, setGridState] = useState<MultiChartWorkspaceState>(() =>
    createInitialMultiChartState("BTCUSDT", "15")
  );
  const [splitSizes, setSplitSizes] = useState<SplitSizesByLayout>(() => ({
    ...DEFAULT_SPLIT_SIZES,
  }));
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Workspace state with localStorage persistence
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [resolution, setResolution] = useState("15");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isScreenerOpen, setIsScreenerOpen] = useState(false);
  const [isIndicatorsModalOpen, setIsIndicatorsModalOpen] = useState(false);
  const [indicatorsModalTab, setIndicatorsModalTab] = useState<"catalog" | "templates">("catalog");
  const [snapshotResult, setSnapshotResult] = useState<ChartSnapshotResult | null>(null);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  const [isReplayActive, setIsReplayActive] = useState(false);
  const [strategyResult, setStrategyResult] = useState<BacktestPerformance | null>(null);
  const [activeStrategyName, setActiveStrategyName] = useState<string>(STRATEGY_PRESETS[0].name);
  const [focusedTrade, setFocusedTrade] = useState<BacktestTrade | null>(null);
  const [customIndicatorData, setCustomIndicatorData] = useState<{
    name: string;
    data: Array<{ time: number; value: number }>;
    color?: string;
  } | null>(null);
  const [customIndicatorBoxes, setCustomIndicatorBoxes] = useState<any[] | null>(null);

  // Active tools & indicators
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingToolType>("crosshair");
  const [isMagnetActive, setIsMagnetActive] = useState(true);
  const [isDrawingsLocked, setIsDrawingsLocked] = useState(false);
  const [isDrawingsHidden, setIsDrawingsHidden] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<string[]>([
    "EMA Ribbon Momentum Multi-Timeframe",
  ]);
  const [hiddenIndicators, setHiddenIndicators] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mochex:hidden_indicators");
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [favoriteTools, setFavoriteTools] = useState<DrawingToolType[]>([
    "trendline",
    "horizontal_line",
    "rectangle",
    "fibonacci",
  ]);
  const [showFavoritesBar, setShowFavoritesBar] = useState(true);

  // Market metrics tape
  const [marketStats, setMarketStats] = useState({
    price: 68420.5,
    change: 3.42,
    high: 69120.0,
    low: 67200.0,
    volume: 42819.5,
  });

  // Cached bars for replay and indicator sandbox
  const [cachedBars, setCachedBars] = useState<CandlestickBar[]>([]);

  const handlePriceUpdate = useCallback(
    (stats: { price: number; change: number; high: number; low: number; volume: number }) => {
      setMarketStats(stats);
    },
    []
  );

  const handleBarsLoaded = useCallback((bars: CandlestickBar[]) => {
    setCachedBars(bars);
  }, []);

  // Auto-run default strategy backtest when "Strategy Equity Curve & Underwater Drawdown" is toggled on
  useEffect(() => {
    const hasStrategyOverlay = activeIndicators.includes(
      "Strategy Equity Curve & Underwater Drawdown"
    );
    if (hasStrategyOverlay && cachedBars.length > 0 && !strategyResult) {
      indicatorSandbox
        .execute({
          scriptId: "auto-strategy-overlay",
          code: STRATEGY_PRESETS[0].code,
          bars: cachedBars,
          inputs: { period: 20, initialCapital: 10000, feeRate: 0.0005 },
        })
        .then((res) => {
          if (res.success && res.strategyResult) {
            setStrategyResult(res.strategyResult);
          }
        })
        .catch(() => {});
    }
  }, [activeIndicators, cachedBars, strategyResult]);

  // Mobile navigation state
  const [mobileScreen, setMobileScreen] = useState<"chart" | "watchlist" | "depth" | "draw" | "studio">("chart");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedSymbol = localStorage.getItem("mochex:symbol");
      const savedRes = localStorage.getItem("mochex:resolution");
      const savedSidebar = localStorage.getItem("mochex:sidebar_open");
      const savedStudio = localStorage.getItem("mochex:studio_open");
      const savedScreener = localStorage.getItem("mochex:screener_open");
      const savedIndicators = localStorage.getItem("mochex:active_indicators");
      const savedFavs = localStorage.getItem("mochex:favorite_drawing_tools");
      const savedShowFavs = localStorage.getItem("mochex:show_favorites_bar");
      const savedGrid = localStorage.getItem("mochex:multi_chart_grid");
      const savedSplitSizes = localStorage.getItem("mochex:split_sizes");

      if (savedSplitSizes) {
        setSplitSizes(parseSplitSizes(savedSplitSizes));
      }

      if (savedGrid) {
        const parsedGrid = JSON.parse(savedGrid) as MultiChartWorkspaceState;
        if (parsedGrid && Array.isArray(parsedGrid.panes) && parsedGrid.panes.length === 4) {
          setGridState(parsedGrid);
          const activePane = getActivePane(parsedGrid);
          setSymbol(activePane.symbol);
          setResolution(activePane.resolution);
        }
      } else {
        const initSym = savedSymbol || "BTCUSDT";
        const initRes = savedRes || "15";
        setSymbol(initSym);
        setResolution(initRes);
        setGridState(createInitialMultiChartState(initSym, initRes));
      }

      if (savedSidebar !== null) setIsSidebarOpen(savedSidebar === "true");
      // Script Studio always defaults to closed on fresh page load (DEC-086)
      setIsStudioOpen(false);
      try {
        localStorage.setItem("mochex:studio_open", "false");
      } catch {}
      if (savedScreener !== null) setIsScreenerOpen(savedScreener === "true");
      if (savedIndicators) setActiveIndicators(JSON.parse(savedIndicators));
      if (savedFavs) setFavoriteTools(JSON.parse(savedFavs));
      if (savedShowFavs !== null) setShowFavoritesBar(savedShowFavs === "true");
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Persist gridState changes to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("mochex:multi_chart_grid", JSON.stringify(gridState));
    } catch {}
  }, [gridState]);

  // Persist splitSizes changes to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("mochex:split_sizes", JSON.stringify(splitSizes));
    } catch {}
  }, [splitSizes]);

  // Alt+Enter shortcut to Maximize / Restore active split pane, Alt+S for Screener, & '?' for Shortcuts Cheatsheet (DEC-075, DEC-077, DEC-078)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        setGridState((prev) => {
          if (prev.layoutMode === "1x1") return prev;
          return toggleMaximizePane(prev, prev.activePaneId);
        });
        return;
      }
      const isKeyR = e.code === "KeyR" || e.key?.toLowerCase() === "r";
      const isResetShortcut =
        (isKeyR && (e.altKey || (!e.ctrlKey && !e.metaKey && !e.shiftKey))) ||
        (e.altKey && (e.code === "Digit0" || e.key === "0"));

      if (isResetShortcut) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("mochex:reset-view", {
            detail: { paneId: gridState.activePaneId },
          })
        );
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        setIsScreenerOpen((prev) => {
          const next = !prev;
          if (next) setIsStudioOpen(false);
          try {
            localStorage.setItem("mochex:screener_open", String(next));
          } catch {}
          return next;
        });
        return;
      }
      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key === "?") {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape") {
        setIsShortcutsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleOpenSidebarEvent = () => {
      setIsSidebarOpen(true);
      try {
        localStorage.setItem("mochex:sidebar_open", "true");
      } catch {}
    };
    window.addEventListener("mochex:open-object-tree", handleOpenSidebarEvent);
    window.addEventListener("mochex:execute-paper-order", handleOpenSidebarEvent);
    window.addEventListener("mochex:open-paper-trade", handleOpenSidebarEvent);
    window.addEventListener("mochex:open-dom", handleOpenSidebarEvent);
    const handleApplyTemplateEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ indicators: string[] }>).detail;
      if (detail?.indicators) {
        setActiveIndicators(detail.indicators);
        try {
          localStorage.setItem("mochex:active_indicators", JSON.stringify(detail.indicators));
        } catch {}
      }
    };
    window.addEventListener("mochex:apply-indicator-template", handleApplyTemplateEvent);
    return () => {
      window.removeEventListener("mochex:open-object-tree", handleOpenSidebarEvent);
      window.removeEventListener("mochex:execute-paper-order", handleOpenSidebarEvent);
      window.removeEventListener("mochex:open-paper-trade", handleOpenSidebarEvent);
      window.removeEventListener("mochex:open-dom", handleOpenSidebarEvent);
      window.removeEventListener("mochex:apply-indicator-template", handleApplyTemplateEvent);
    };
  }, []);

  // Save changes to localStorage and update active pane (or all panes if sync enabled)
  const handleSelectSymbol = (sym: string) => {
    setSymbol(sym);
    setGridState((prev) => updateActivePaneSymbol(prev, sym));
    try {
      localStorage.setItem("mochex:symbol", sym);
    } catch {}
  };

  const handleSelectResolution = (res: string) => {
    setResolution(res);
    setGridState((prev) => updateActivePaneResolution(prev, res));
    try {
      localStorage.setItem("mochex:resolution", res);
    } catch {}
  };

  const handleSelectGridLayout = (mode: GridLayoutMode) => {
    setGridState((prev) => {
      const next = setGridLayoutMode(prev, mode);
      const active = getActivePane(next);
      setSymbol(active.symbol);
      setResolution(active.resolution);
      return next;
    });
  };

  const handleToggleGridSync = (key: keyof GridSyncConfig) => {
    setGridState((prev) => toggleGridSyncOption(prev, key));
  };

  const handleFocusPane = (paneId: string) => {
    setGridState((prev) => {
      if (prev.activePaneId === paneId) return prev;
      const target = prev.panes.find((p) => p.id === paneId);
      if (target) {
        setSymbol(target.symbol);
        setResolution(target.resolution);
      }
      return {
        ...prev,
        activePaneId: paneId,
      };
    });
  };

  const handleToggleMaximizePane = (paneId: string) => {
    setGridState((prev) => toggleMaximizePane(prev, paneId));
  };

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mochex:sidebar_open", String(next));
      } catch {}
      return next;
    });
  };

  const handleToggleStudio = () => {
    setIsStudioOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsScreenerOpen(false);
        try {
          localStorage.setItem("mochex:screener_open", "false");
        } catch {}
      }
      try {
        localStorage.setItem("mochex:studio_open", String(next));
      } catch {}
      return next;
    });
  };

  const handleToggleScreener = () => {
    setIsScreenerOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsStudioOpen(false);
        try {
          localStorage.setItem("mochex:studio_open", "false");
        } catch {}
      }
      try {
        localStorage.setItem("mochex:screener_open", String(next));
      } catch {}
      return next;
    });
  };

  const handleToggleReplay = () => {
    if (isReplayActive) {
      replayEngine.exitReplay();
      setIsReplayActive(false);
    } else {
      replayEngine.startSelecting();
      setIsReplayActive(true);
    }
  };

  const handleClearCustomIndicator = (nameToClear?: string) => {
    setCustomIndicatorData(null);
    setCustomIndicatorBoxes(null);
    setActiveIndicators((prev) => {
      const target = nameToClear || customIndicatorData?.name;
      const next = target ? prev.filter((i) => i !== target) : prev;
      try {
        localStorage.setItem("mochex:active_indicators", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleRemoveActiveScript = (e: any) => {
      handleClearCustomIndicator(e.detail?.name);
    };
    window.addEventListener("mochex:remove-active-script", handleRemoveActiveScript);
    return () => window.removeEventListener("mochex:remove-active-script", handleRemoveActiveScript);
  }, [customIndicatorData]);

  const handleApplyIndicator = (name: string) => {
    if (!name) return;
    setActiveIndicators((prev) => {
      const isRemoving = prev.includes(name);
      const next = isRemoving ? prev.filter((i) => i !== name) : [...prev, name];
      try {
        localStorage.setItem("mochex:active_indicators", JSON.stringify(next));
      } catch {}
      if (isRemoving && customIndicatorData?.name === name) {
        setCustomIndicatorData(null);
        setCustomIndicatorBoxes(null);
      }
      return next;
    });
  };

  const handleToggleIndicatorVisibility = (name: string) => {
    setHiddenIndicators((prev) => {
      const next = prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name];
      try {
        localStorage.setItem("mochex:hidden_indicators", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleOpenIndicators = (tab: "catalog" | "templates" = "catalog") => {
    setIndicatorsModalTab(tab);
    setIsIndicatorsModalOpen(true);
  };

  const handleApplyTemplate = (indicators: string[]) => {
    setActiveIndicators(indicators);
    try {
      localStorage.setItem("mochex:active_indicators", JSON.stringify(indicators));
    } catch {}
  };

  const handleTakeSnapshot = async () => {
    try {
      setIsCapturingSnapshot(true);
      const activeEl =
        document.querySelector<HTMLElement>("#active-chart-container") ||
        document.querySelector<HTMLElement>("[data-active-pane='true']") ||
        gridContainerRef.current;
      if (!activeEl) return;
      const result = await captureChartSnapshot(activeEl, {
        symbol,
        resolution,
        markPrice: marketStats.price,
      });
      setSnapshotResult(result);
    } catch (err) {
      console.error("Failed to capture chart snapshot:", err);
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  const handleClearDrawings = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mochex:clear-drawings"));
    }
  };

  const handleClearIndicators = () => {
    setActiveIndicators([]);
    setCustomIndicatorData(null);
    try {
      localStorage.setItem("mochex:active_indicators", JSON.stringify([]));
    } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mochex:clear-custom-indicators"));
    }
  };

  const handleClearAll = () => {
    handleClearDrawings();
    handleClearIndicators();
  };

  const handleToggleFavoriteTool = (tool: DrawingToolType) => {
    setFavoriteTools((prev) => {
      const exists = prev.includes(tool);
      const next = exists ? prev.filter((t) => t !== tool) : [...prev, tool];
      try {
        localStorage.setItem("mochex:favorite_drawing_tools", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleToggleFavoritesBar = () => {
    setShowFavoritesBar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mochex:show_favorites_bar", String(next));
      } catch {}
      return next;
    });
  };

  const handleLoadLayout = (layout: SavedLayoutItem) => {
    if (layout.symbol) handleSelectSymbol(layout.symbol);
    if (layout.resolution) handleSelectResolution(layout.resolution);
    if (layout.content?.indicators && Array.isArray(layout.content.indicators)) {
      setActiveIndicators(layout.content.indicators);
    }
  };

  // Handle Mobile Bottom Nav Clicks
  const handleSelectMobileScreen = (screen: "chart" | "watchlist" | "depth" | "draw" | "studio") => {
    setMobileScreen(screen);
    if (screen === "watchlist" || screen === "draw") {
      setIsMobileDrawerOpen(true);
    } else if (screen === "studio") {
      setIsStudioOpen(true);
      setIsMobileDrawerOpen(false);
    } else {
      setIsMobileDrawerOpen(false);
    }
  };

  const visiblePanes = getVisiblePanes(gridState);
  const isSplitGrid = gridState.layoutMode !== "1x1";
  const currentSplit = splitSizes[gridState.layoutMode] || { col: 0.5, row: 0.5 };
  const gridTemplate = buildGridTemplate(
    gridState.layoutMode,
    currentSplit,
    Boolean(gridState.maximizedPaneId)
  );

  const handleStartSplitDrag = (axis: "col" | "row" | "both") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = gridContainerRef.current;
    if (!container) return;
    const mode = gridState.layoutMode;

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setSplitSizes((prev) => {
        const cur = prev[mode] || { col: 0.5, row: 0.5 };
        return {
          ...prev,
          [mode]: {
            col:
              axis === "col" || axis === "both"
                ? computeSplitFraction(ev.clientX, rect.left, rect.width)
                : cur.col,
            row:
              axis === "row" || axis === "both"
                ? computeSplitFraction(ev.clientY, rect.top, rect.height)
                : cur.row,
          },
        };
      });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleResetSplitAxis = (axis: "col" | "row" | "both") => (e: React.MouseEvent) => {
    e.stopPropagation();
    const mode = gridState.layoutMode;
    setSplitSizes((prev) => {
      const cur = prev[mode] || { col: 0.5, row: 0.5 };
      return {
        ...prev,
        [mode]: {
          col: axis === "col" || axis === "both" ? 0.5 : cur.col,
          row: axis === "row" || axis === "both" ? 0.5 : cur.row,
        },
      };
    });
  };

  return (
    <main className="h-screen w-screen flex flex-col bg-background select-none overflow-hidden font-sans">
      {/* 1. Desktop Tactical Header */}
      <TacticalHeader
        symbol={symbol}
        onSelectSymbol={handleSelectSymbol}
        resolution={resolution}
        onSelectResolution={handleSelectResolution}
        markPrice={marketStats.price}
        change24h={marketStats.change}
        high24h={marketStats.high}
        low24h={marketStats.low}
        volume24h={marketStats.volume}
        isReplayActive={isReplayActive}
        onToggleReplay={handleToggleReplay}
        onOpenIndicators={handleOpenIndicators}
        activeIndicatorsCount={activeIndicators.length}
        activeIndicators={activeIndicators}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        isStudioOpen={isStudioOpen}
        onToggleStudio={handleToggleStudio}
        isScreenerOpen={isScreenerOpen}
        onToggleScreener={handleToggleScreener}
        user={user}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLoadLayout={handleLoadLayout}
        gridLayoutMode={gridState.layoutMode}
        onSelectGridLayout={handleSelectGridLayout}
        gridSync={gridState.sync}
        onToggleGridSync={handleToggleGridSync}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        onApplyTemplate={handleApplyTemplate}
        onTakeSnapshot={handleTakeSnapshot}
        isCapturingSnapshot={isCapturingSnapshot}
      />

      {/* 2. Main Terminal Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Drawing Rail (Desktop) */}
        <div className="hidden md:flex shrink-0">
          <DrawingRail
            activeTool={activeDrawingTool}
            onSelectTool={setActiveDrawingTool}
            isMagnetActive={isMagnetActive}
            onToggleMagnet={() => setIsMagnetActive((prev) => !prev)}
            isLocked={isDrawingsLocked}
            onToggleLock={() => setIsDrawingsLocked((prev) => !prev)}
            isHidden={isDrawingsHidden}
            onToggleHide={() => setIsDrawingsHidden((prev) => !prev)}
            onClearDrawings={handleClearDrawings}
            onClearIndicators={handleClearIndicators}
            onClearAll={handleClearAll}
            favoriteTools={favoriteTools}
            onToggleFavorite={handleToggleFavoriteTool}
            showFavoritesBar={showFavoritesBar}
            onToggleFavoritesBar={handleToggleFavoritesBar}
          />
        </div>

        {/* Center Workspace (Multi-Chart Split-Screen Grid + Replay Simulation Pill) */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <div
            ref={gridContainerRef}
            style={{
              gridTemplateColumns: gridTemplate.columns,
              gridTemplateRows: gridTemplate.rows,
            }}
            className="flex-1 relative w-full h-full grid gap-[2px] bg-border/60"
          >
            {visiblePanes.map((pane, idx) => {
              const isPaneActive = pane.id === gridState.activePaneId;
              const isPaneMaximized = gridState.maximizedPaneId === pane.id;
              return (
                <div
                  key={pane.id}
                  onMouseDown={() => handleFocusPane(pane.id)}
                  className={`relative w-full h-full overflow-hidden bg-background transition-shadow ${
                    isSplitGrid
                      ? isPaneActive
                        ? "ring-1 ring-inset ring-[#2962ff]"
                        : "opacity-95 hover:opacity-100"
                      : ""
                  }`}
                >
                  {/* Per-Pane Header Badge & Maximize/Restore Control (Visible on Split Grids) */}
                  {isSplitGrid && (
                    <div
                      className={`absolute top-2 right-16 z-30 flex items-center gap-1.5 px-2 py-0.5 rounded border backdrop-blur-md text-[10px] font-mono shadow-md transition-colors ${
                        isPaneActive
                          ? "bg-[#161a25]/95 border-[#2962ff]/70 text-white"
                          : "bg-[#12161f]/85 border-outline-variant/40 text-muted hover:text-on-surface"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isPaneActive ? "bg-[#2962ff] shadow-[0_0_6px_#2962ff]" : "bg-muted/50"
                        }`}
                      />
                      <span className="font-bold tracking-tight">
                        {pane.symbol.replace(/USDT$/, "")}/USDT
                      </span>
                      <span className="text-primary font-semibold">
                        {formatResolutionBadge(pane.resolution)}
                      </span>
                      {gridState.sync.syncCrosshair && (
                        <span
                          className="text-[8px] px-1 rounded bg-cyan/15 text-cyan uppercase"
                          title="Crosshair Sync Active"
                        >
                          SYNC
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleMaximizePane(pane.id);
                        }}
                        title={
                          isPaneMaximized
                            ? "Restore Split Grid (Alt+Enter)"
                            : `Maximize Pane #${idx + 1} (Alt+Enter)`
                        }
                        className="ml-0.5 p-0.5 rounded hover:bg-surface-container-high text-muted hover:text-white transition-colors cursor-pointer"
                      >
                        {isPaneMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                      </button>
                    </div>
                  )}

                  <TradingViewContainer
                    paneId={pane.id}
                    isActivePane={isPaneActive}
                    symbol={pane.symbol}
                    resolution={pane.resolution}
                    syncCrosshair={
                      gridState.sync.syncCrosshair &&
                      isSplitGrid &&
                      !gridState.maximizedPaneId
                    }
                    activeDrawingTool={isPaneActive ? activeDrawingTool : "crosshair"}
                    onSelectDrawingTool={setActiveDrawingTool}
                    isMagnetActive={isMagnetActive}
                    isDrawingsLocked={isDrawingsLocked}
                    isDrawingsHidden={isDrawingsHidden}
                    activeIndicators={activeIndicators}
                    hiddenIndicators={hiddenIndicators}
                    onToggleIndicator={handleApplyIndicator}
                    onToggleIndicatorVisibility={handleToggleIndicatorVisibility}
                    trades={isPaneActive ? strategyResult?.trades || [] : []}
                    strategyResult={isPaneActive ? strategyResult : null}
                    strategyName={activeStrategyName}
                    focusedTrade={isPaneActive ? focusedTrade : null}
                    onClearStrategy={() => {
                      setStrategyResult(null);
                      setFocusedTrade(null);
                      setActiveIndicators((prev) =>
                        prev.filter((i) => i !== "Strategy Equity Curve & Underwater Drawdown")
                      );
                    }}
                    onBarsLoaded={isPaneActive ? handleBarsLoaded : undefined}
                    onPriceUpdate={isPaneActive ? handlePriceUpdate : undefined}
                    favoriteTools={favoriteTools}
                    onToggleFavorite={handleToggleFavoriteTool}
                    showFavoritesBar={showFavoritesBar && isPaneActive}
                    onToggleFavoritesBar={handleToggleFavoritesBar}
                    customIndicatorData={isPaneActive ? customIndicatorData : null}
                    customScriptBoxes={isPaneActive ? customIndicatorBoxes : null}
                    onClearCustomIndicator={() => {
                      setCustomIndicatorData(null);
                      setCustomIndicatorBoxes(null);
                      if (customIndicatorData?.name) {
                        setActiveIndicators((prev) => prev.filter((i) => i !== customIndicatorData.name));
                      }
                    }}
                  />
                </div>
              );
            })}

            {/* Draggable Split-Screen Resize Dividers (DEC-077) */}
            {isSplitGrid && !gridState.maximizedPaneId && (
              <>
                {(gridState.layoutMode === "2x1" || gridState.layoutMode === "2x2") && (
                  <div
                    onMouseDown={handleStartSplitDrag("col")}
                    onDoubleClick={handleResetSplitAxis("col")}
                    style={{ left: `calc(${currentSplit.col * 100}% - 3px)` }}
                    title="Drag to resize columns · Double-click to reset 50/50"
                    className="hidden md:flex absolute top-0 bottom-0 w-1.5 z-30 cursor-col-resize items-center justify-center group hover:bg-[#2962ff]/35 transition-colors"
                  >
                    <div className="w-[2px] h-10 rounded-full bg-transparent group-hover:bg-[#2962ff]" />
                  </div>
                )}

                {(gridState.layoutMode === "1x2" || gridState.layoutMode === "2x2") && (
                  <div
                    onMouseDown={handleStartSplitDrag("row")}
                    onDoubleClick={handleResetSplitAxis("row")}
                    style={{ top: `calc(${currentSplit.row * 100}% - 3px)` }}
                    title="Drag to resize rows · Double-click to reset 50/50"
                    className="flex absolute left-0 right-0 h-1.5 z-30 cursor-row-resize items-center justify-center group hover:bg-[#2962ff]/35 transition-colors"
                  >
                    <div className="h-[2px] w-10 rounded-full bg-transparent group-hover:bg-[#2962ff]" />
                  </div>
                )}

                {gridState.layoutMode === "2x2" && (
                  <div
                    onMouseDown={handleStartSplitDrag("both")}
                    onDoubleClick={handleResetSplitAxis("both")}
                    style={{
                      left: `calc(${currentSplit.col * 100}% - 6px)`,
                      top: `calc(${currentSplit.row * 100}% - 6px)`,
                    }}
                    title="Drag to resize all 4 panes · Double-click to reset 50/50"
                    className="hidden md:flex absolute w-3 h-3 rounded-full z-40 cursor-move items-center justify-center bg-[#161a25] border border-outline-variant/60 hover:border-[#2962ff] hover:bg-[#2962ff] transition-colors shadow-md"
                  />
                )}
              </>
            )}

            {/* In-chart Floating Simulation Control Pill */}
            {isReplayActive && (
              <ReplaySimulationPill onClose={() => setIsReplayActive(false)} />
            )}
          </div>

          {/* Bottom Crypto Technical Screener & 2D Market Heatmap Drawer (DEC-078) */}
          <MarketScreenerDrawer
            isOpen={isScreenerOpen}
            onClose={() => {
              setIsScreenerOpen(false);
              try {
                localStorage.setItem("mochex:screener_open", "false");
              } catch {}
            }}
            selectedSymbol={symbol}
            activeResolution={resolution}
            onSelectSymbol={handleSelectSymbol}
            onSelectResolution={handleSelectResolution}
            activePaneId={gridState.activePaneId}
            isSplitGrid={gridState.layoutMode !== "1x1"}
            syncSymbol={gridState.sync.syncSymbol}
          />

          {/* Bottom Script Studio (Collapsible Split Panel) */}
          <ScriptStudio
            isOpen={isStudioOpen}
            onClose={() => {
              setIsStudioOpen(false);
              try {
                localStorage.setItem("mochex:studio_open", "false");
              } catch {}
            }}
            sampleBars={cachedBars}
            activeIndicators={activeIndicators}
            onRemoveFromChart={() => handleClearCustomIndicator()}
            onStrategyResult={(res, name) => {
              setStrategyResult(res);
              if (name) setActiveStrategyName(name);
              setActiveIndicators((prev) =>
                prev.includes("Strategy Equity Curve & Underwater Drawdown")
                  ? prev
                  : [...prev, "Strategy Equity Curve & Underwater Drawdown"]
              );
            }}
            onSelectTrade={(trade) => setFocusedTrade(trade)}
            onApplyIndicator={(name, code, data, boxes) => {
              handleApplyIndicator(name);
              if (data && data.length > 0) {
                setCustomIndicatorData({ name, data, color: "#00d8ff" });
              } else if (boxes && boxes.length > 0) {
                setCustomIndicatorData({ name, data: [], color: "#00d8ff" });
              } else {
                setCustomIndicatorData(null);
              }
              if (boxes && boxes.length > 0) {
                setCustomIndicatorBoxes(boxes);
              } else {
                setCustomIndicatorBoxes(null);
              }
              // Keep studio dock open so user can inspect or iterate
            }}
          />
        </div>

        {/* Right High-Density Sidebar (Desktop) */}
        <div className="hidden md:flex shrink-0">
          <RightSidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            selectedSymbol={symbol}
            onSelectSymbol={handleSelectSymbol}
            currentPrice={marketStats.price}
            user={user}
            activeIndicators={activeIndicators}
            hiddenIndicators={hiddenIndicators}
            onToggleIndicator={handleApplyIndicator}
            onToggleIndicatorVisibility={handleToggleIndicatorVisibility}
          />
        </div>
      </div>

      {/* 3. Indicators & Strategies Catalog Modal (fx Trigger) */}
      <IndicatorsModal
        isOpen={isIndicatorsModalOpen}
        onClose={() => setIsIndicatorsModalOpen(false)}
        onApplyIndicator={handleApplyIndicator}
        onApplyTemplate={handleApplyTemplate}
        activeIndicators={activeIndicators}
        initialTab={indicatorsModalTab}
        sampleBars={cachedBars}
        onApplyCustomScript={({ name, code, data, boxes }) => {
          if (data && data.length > 0) {
            setCustomIndicatorData({ name, data, color: "#00d8ff" });
          } else if (boxes && boxes.length > 0) {
            setCustomIndicatorData({ name, data: [], color: "#00d8ff" });
          } else {
            setCustomIndicatorData(null);
          }
          if (boxes && boxes.length > 0) {
            setCustomIndicatorBoxes(boxes);
          } else {
            setCustomIndicatorBoxes(null);
          }
        }}
        onEditInStudio={(item) => {
          setIsStudioOpen(true);
          if (item) {
            window.dispatchEvent(
              new CustomEvent("mochex:open-script-studio", {
                detail: { script: item },
              })
            );
          }
        }}
      />

      {/* 4. Mobile Adaptations (< 768px viewports) */}
      <MobileTacticalDrawer
        isOpen={isMobileDrawerOpen}
        onToggle={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
        selectedSymbol={symbol}
        onSelectSymbol={handleSelectSymbol}
        activeDrawingTool={activeDrawingTool}
        onSelectDrawingTool={setActiveDrawingTool}
        onClearDrawings={handleClearDrawings}
      />

      <MobileBottomNav
        activeScreen={mobileScreen}
        onSelectScreen={handleSelectMobileScreen}
      />

      {/* 5. Cloud Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        user={user}
        onLogin={login}
        onRegister={register}
        onLogout={logout}
      />

      {/* 6. TradingView Keyboard Shortcuts Cheatsheet Modal (?) */}
      <ShortcutsCheatsheetModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      {/* 7. High-Resolution Chart Snapshot Modal (DEC-081) */}
      <ChartSnapshotModal
        isOpen={Boolean(snapshotResult)}
        onClose={() => setSnapshotResult(null)}
        snapshot={snapshotResult}
      />
    </main>
  );
}
