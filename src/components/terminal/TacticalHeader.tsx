"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  CandlestickChart,
  ChevronDown,
  RotateCcw,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  PanelRight,
  Code2,
  Check,
  User,
  Shield,
  Sparkles,
  LayoutGrid,
  Columns2,
  Rows2,
  Square,
  Keyboard,
  Radar,
  Activity,
  Camera,
  LayoutTemplate,
  Star,
  Search,
} from "lucide-react";
import { AuthUser } from "@/lib/auth/use-auth";
import { LayoutDropdown, SavedLayoutItem } from "./LayoutDropdown";
import { GridLayoutMode, GridSyncConfig } from "@/lib/chart/multi-chart-grid";
import { IndicatorTemplate, getStoredTemplates } from "@/lib/indicators/templates";
import { SymbolSearchModal } from "./SymbolSearchModal";
import { isTypingTarget } from "@/lib/ui/keyboard-shortcuts";
import { TimeframeSelector } from "./TimeframeSelector";

interface TacticalHeaderProps {
  symbol: string;
  onSelectSymbol: (symbol: string) => void;
  resolution: string;
  onSelectResolution: (res: string) => void;
  markPrice?: number;
  change24h?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  isReplayActive: boolean;
  onToggleReplay: () => void;
  onOpenIndicators: (tab?: "catalog" | "templates") => void;
  activeIndicatorsCount: number;
  activeIndicators?: string[];
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isStudioOpen: boolean;
  onToggleStudio: () => void;
  isScreenerOpen?: boolean;
  onToggleScreener?: () => void;
  user?: AuthUser | null;
  onOpenAuthModal?: () => void;
  onLoadLayout?: (layout: SavedLayoutItem) => void;
  gridLayoutMode?: GridLayoutMode;
  onSelectGridLayout?: (mode: GridLayoutMode) => void;
  gridSync?: GridSyncConfig;
  onToggleGridSync?: (key: keyof GridSyncConfig) => void;
  onOpenShortcuts?: () => void;
  onApplyTemplate?: (indicators: string[]) => void;
  onTakeSnapshot?: () => void;
  isCapturingSnapshot?: boolean;
}



const POPULAR_PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "MXUSDT", "XRPUSDT", "DOGEUSDT"];

export function TacticalHeader({
  symbol,
  onSelectSymbol,
  resolution,
  onSelectResolution,
  markPrice = 68420.5,
  change24h = 3.42,
  high24h = 69120.0,
  low24h = 67200.0,
  volume24h = 42819.5,
  isReplayActive,
  onToggleReplay,
  onOpenIndicators,
  activeIndicatorsCount,
  activeIndicators = [],
  isSidebarOpen,
  onToggleSidebar,
  isStudioOpen,
  onToggleStudio,
  isScreenerOpen = false,
  onToggleScreener,
  user = null,
  onOpenAuthModal,
  onLoadLayout = () => {},
  gridLayoutMode = "1x1",
  onSelectGridLayout,
  gridSync = { syncSymbol: false, syncInterval: false, syncCrosshair: true },
  onToggleGridSync,
  onOpenShortcuts,
  onApplyTemplate,
  onTakeSnapshot,
  isCapturingSnapshot = false,
}: TacticalHeaderProps) {
  const [isSymbolDropdownOpen, setIsSymbolDropdownOpen] = useState(false);
  const [isSymbolSearchOpen, setIsSymbolSearchOpen] = useState(false);
  const [isGridDropdownOpen, setIsGridDropdownOpen] = useState(false);
  const [isTemplatesDropdownOpen, setIsTemplatesDropdownOpen] = useState(false);
  const [quickTemplates, setQuickTemplates] = useState<IndicatorTemplate[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const handleGlobalSearchKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target as Element)) return;
      if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setIsSymbolSearchOpen((prev) => !prev);
      }
    };
    const handleOpenSearchModal = () => setIsSymbolSearchOpen(true);

    window.addEventListener("keydown", handleGlobalSearchKey);
    window.addEventListener("mochex:open-symbol-search", handleOpenSearchModal);
    return () => {
      window.removeEventListener("keydown", handleGlobalSearchKey);
      window.removeEventListener("mochex:open-symbol-search", handleOpenSearchModal);
    };
  }, []);

  useEffect(() => {
    if (isTemplatesDropdownOpen) {
      setQuickTemplates(getStoredTemplates());
    }
  }, [isTemplatesDropdownOpen]);

  useEffect(() => {
    const onHistoryState = (e: Event) => {
      const detail = (e as CustomEvent<{ canUndo: boolean; canRedo: boolean }>).detail;
      if (detail) {
        setCanUndo(Boolean(detail.canUndo));
        setCanRedo(Boolean(detail.canRedo));
      }
    };
    window.addEventListener("mochex:history-state", onHistoryState);
    return () => window.removeEventListener("mochex:history-state", onHistoryState);
  }, []);

  const formattedSymbol = symbol.replace("USDT", "/USDT");
  const isPositive = change24h >= 0;

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  return (
    <header className="h-12 bg-surface border-b border-border px-3 flex items-center justify-between select-none z-30 shrink-0">
      {/* Left: Brand + Symbol + Live Tape Metrics */}
      <div className="flex items-center gap-3">
        {/* Brand Icon + Name */}
        <a
          href="/"
          title="Return to Mochex Charts Overview"
          className="flex items-center gap-2 group cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div className="w-7 h-7 rounded bg-primary-container flex items-center justify-center text-white shadow-sm shadow-primary-container/30 group-hover:scale-105 transition-transform">
            <CandlestickChart size={16} />
          </div>
          <span className="font-sans font-black text-sm tracking-wide text-on-surface">
            MOCHEX <span className="text-secondary font-bold">CHARTS</span>
          </span>
          <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-surface-container-high text-primary border border-outline-variant/40">
            PRO TERMINAL
          </span>
        </a>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Pair Selector & Symbol Search Modal Trigger (1,480+ MEXC Pairs) */}
        <div className="relative">
          <button
            onClick={() => setIsSymbolSearchOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface text-xs font-mono font-semibold transition-colors cursor-pointer group"
            title="Search 1,480+ MEXC Pairs (Ctrl+K or /)"
          >
            <span>{formattedSymbol}</span>
            <Search size={11} className="text-muted group-hover:text-primary transition-colors" />
          </button>
        </div>

        {/* Live Mark Price & 24h PnL Pill */}
        <div className="flex items-center gap-2 font-mono">
          <span className="text-sm font-bold text-on-surface">
            ${markPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
              isPositive
                ? "bg-secondary/15 text-secondary border border-secondary/30"
                : "bg-tertiary/15 text-tertiary border border-tertiary/30"
            }`}
          >
            {isPositive ? "+" : ""}
            {change24h.toFixed(2)}%
          </span>
        </div>

        {/* High / Low / Vol Tape (Visible on medium+ screens) */}
        <div className="hidden xl:flex items-center gap-3 text-[11px] font-mono text-muted pl-2 border-l border-border">
          <div>
            <span className="text-[9px] uppercase tracking-wider text-outline mr-1">24h H</span>
            <span className="text-on-surface">${high24h.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider text-outline mr-1">24h L</span>
            <span className="text-on-surface">${low24h.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider text-outline mr-1">24h Vol</span>
            <span className="text-on-surface">{volume24h.toLocaleString()} USDT</span>
          </div>
        </div>
      </div>

      {/* Middle: Resolution Ribbon + Indicators Trigger + Bar Replay + Undo/Redo */}
      <div className="hidden md:flex items-center gap-2">
        {/* TradingView-Style Timeframe Selector & Dropdown */}
        <TimeframeSelector resolution={resolution} onSelectResolution={onSelectResolution} />

        {/* Indicators fx Trigger */}
        <button
          onClick={() => onOpenIndicators("catalog")}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface text-xs font-mono transition-colors cursor-pointer"
        >
          <span className="text-primary font-bold italic">fx</span>
          <span>Indicators</span>
          {activeIndicatorsCount > 0 && (
            <span className="px-1 py-0.2 rounded-full bg-primary-container text-white text-[9px] font-bold">
              {activeIndicatorsCount}
            </span>
          )}
        </button>

        {/* Templates Quick Dropdown (DEC-081) */}
        <div className="relative">
          <button
            onClick={() => setIsTemplatesDropdownOpen((prev) => !prev)}
            title="Institutional Indicator Templates & Stacks"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono transition-colors cursor-pointer ${
              isTemplatesDropdownOpen
                ? "bg-primary-container/20 text-primary border-primary/40 font-bold"
                : "bg-surface-container-low hover:bg-surface-container border-outline-variant/30 text-muted hover:text-on-surface"
            }`}
          >
            <LayoutTemplate size={13} className="text-primary" />
            <span className="hidden xl:inline">Templates</span>
            <ChevronDown size={11} className="text-muted" />
          </button>

          {isTemplatesDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsTemplatesDropdownOpen(false)}
              />
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-lg bg-[#161a25] border border-outline-variant/40 shadow-2xl z-50 p-2 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between px-2 py-1 border-b border-outline-variant/20">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">
                    Indicator Stacks
                  </span>
                  <button
                    onClick={() => {
                      setIsTemplatesDropdownOpen(false);
                      onOpenIndicators("templates");
                    }}
                    className="text-[10px] font-mono text-primary hover:underline cursor-pointer"
                  >
                    Manage
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto no-scrollbar space-y-1">
                  {quickTemplates.map((tpl) => {
                    const isAllActive =
                      tpl.indicators.length > 0 &&
                      tpl.indicators.every((i) => activeIndicators.includes(i));
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => {
                          if (onApplyTemplate) {
                            onApplyTemplate(tpl.indicators);
                          } else {
                            window.dispatchEvent(
                              new CustomEvent("mochex:apply-indicator-template", {
                                detail: { indicators: tpl.indicators },
                              })
                            );
                          }
                          setIsTemplatesDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between hover:bg-surface-container transition-colors cursor-pointer ${
                          isAllActive
                            ? "bg-primary/10 text-primary font-bold border border-primary/30"
                            : "text-on-surface text-xs font-mono"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          {tpl.isStarred && (
                            <Star size={11} className="text-gold fill-gold shrink-0" />
                          )}
                          <span className="truncate text-xs">{tpl.name}</span>
                        </div>
                        {isAllActive && <Check size={12} className="text-secondary shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-outline-variant/20 pt-1.5 px-1">
                  <button
                    onClick={() => {
                      setIsTemplatesDropdownOpen(false);
                      onOpenIndicators("templates");
                    }}
                    className="w-full text-center py-1 rounded bg-surface-container-low hover:bg-surface-container text-xs font-mono text-primary transition-colors cursor-pointer"
                  >
                    + Save or Edit Templates
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bar Replay Trigger */}
        <button
          onClick={onToggleReplay}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${
            isReplayActive
              ? "bg-gold/15 text-gold border-gold/40 shadow-xs"
              : "bg-surface-container-low hover:bg-surface-container border-outline-variant/30 text-muted hover:text-on-surface"
          }`}
        >
          <RotateCcw size={12} className={isReplayActive ? "animate-spin" : ""} />
          <span>{isReplayActive ? "Replaying 1x" : "Replay"}</span>
        </button>

        {/* Drawing Undo / Redo Buttons */}
        <div className="flex items-center bg-surface-container-low rounded border border-outline-variant/30 p-0.5">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("mochex:undo"))}
            disabled={!canUndo}
            title="Undo Drawing (Ctrl+Z)"
            className={`p-1 rounded transition-colors ${
              canUndo
                ? "text-on-surface hover:bg-surface-container-high cursor-pointer"
                : "text-muted/35 cursor-not-allowed"
            }`}
          >
            <Undo2 size={13} />
          </button>
          <div className="w-px h-3.5 bg-border mx-0.5" />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("mochex:redo"))}
            disabled={!canRedo}
            title="Redo Drawing (Ctrl+Y / Ctrl+Shift+Z)"
            className={`p-1 rounded transition-colors ${
              canRedo
                ? "text-on-surface hover:bg-surface-container-high cursor-pointer"
                : "text-muted/35 cursor-not-allowed"
            }`}
          >
            <Redo2 size={13} />
          </button>
        </div>
      </div>

      {/* Right: Screener + Studio Toggle + Layout Manager Dropdown + User Profile */}
      <div className="flex items-center gap-1.5">
        {/* Institutional POI Radar Page Link */}
        <Link
          href="/radar"
          title="Open Institutional POI Radar & Smart Watchlist"
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#00c087]/10 hover:bg-[#00c087]/20 text-[#00c087] border border-[#00c087]/30 text-[11px] font-mono font-bold transition-colors cursor-pointer"
        >
          <Radar size={13} className="animate-pulse" />
          <span className="hidden sm:inline">POI Radar</span>
        </Link>

        {/* Crypto Technical Screener Dock Toggle */}
        {onToggleScreener && (
          <button
            onClick={onToggleScreener}
            title="Toggle Crypto Technical Screener & Heatmap (Alt+S)"
            className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-mono transition-colors cursor-pointer ${
              isScreenerOpen
                ? "bg-primary-container/20 text-primary border-primary/40 font-bold"
                : "bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border-outline-variant/30"
            }`}
          >
            <Radar size={14} />
            <span className="hidden lg:inline">Screener</span>
          </button>
        )}

        {/* DOM & Aggressor Tape Sidebar Trigger (DEC-080) */}
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("mochex:open-dom"));
          }}
          title="Open Depth of Market (DOM) Heatmap & Live Aggressor Tape"
          className="flex items-center gap-1 px-2 py-1 rounded bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border border-outline-variant/30 text-[11px] font-mono transition-colors cursor-pointer"
        >
          <Activity size={14} className="text-secondary" />
          <span className="hidden lg:inline">DOM / Tape</span>
        </button>

        {/* Script Studio Dock Toggle */}
        <button
          onClick={onToggleStudio}
          title="Toggle Indicator Script Studio"
          className={`p-1.5 rounded border transition-colors ${
            isStudioOpen
              ? "bg-primary-container/20 text-primary border-primary/40"
              : "bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border-outline-variant/30"
          }`}
        >
          <Code2 size={15} />
        </button>

        {/* Multi-Chart Split-Grid Layout Switcher & Sync Popover */}
        {onSelectGridLayout && (
          <div className="relative">
            <button
              onClick={() => setIsGridDropdownOpen((prev) => !prev)}
              title={`Chart Grid Layout (${gridLayoutMode})`}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-mono transition-colors cursor-pointer ${
                gridLayoutMode !== "1x1" || isGridDropdownOpen
                  ? "bg-primary-container/20 text-primary border-primary/40"
                  : "bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border-outline-variant/30"
              }`}
            >
              <LayoutGrid size={14} />
              <span className="hidden md:inline font-bold">{gridLayoutMode}</span>
            </button>

            {isGridDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsGridDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-60 rounded-lg bg-[#161a25] border border-outline-variant/40 shadow-2xl z-50 p-2.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-semibold">
                      Split-Screen Grid Layout
                    </span>
                    <span className="text-[9px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {gridLayoutMode}
                    </span>
                  </div>

                  {/* 4 Layout Preset Buttons */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { mode: "1x1", label: "1x1", desc: "Single Chart" },
                        { mode: "2x1", label: "2x1", desc: "Vertical Split" },
                        { mode: "1x2", label: "1x2", desc: "Horizontal Split" },
                        { mode: "2x2", label: "2x2", desc: "Quad Grid" },
                      ] as const
                    ).map((preset) => {
                      const active = gridLayoutMode === preset.mode;
                      return (
                        <button
                          key={preset.mode}
                          onClick={() => {
                            onSelectGridLayout(preset.mode);
                          }}
                          title={preset.desc}
                          className={`flex flex-col items-center justify-center gap-1 py-2 rounded border text-[10px] font-mono transition-colors cursor-pointer ${
                            active
                              ? "bg-primary/20 border-primary text-on-surface font-bold"
                              : "bg-surface-container-low hover:bg-surface-container border-outline-variant/30 text-muted hover:text-on-surface"
                          }`}
                        >
                          {/* Mini visual schematic */}
                          <div className="w-5 h-3.5 border border-current rounded-[2px] p-[1px] grid gap-[1px] overflow-hidden"
                            style={{
                              gridTemplateColumns:
                                preset.mode === "2x1" || preset.mode === "2x2" ? "1fr 1fr" : "1fr",
                              gridTemplateRows:
                                preset.mode === "1x2" || preset.mode === "2x2" ? "1fr 1fr" : "1fr",
                            }}
                          >
                            <div className="bg-current/50 rounded-[1px]" />
                            {(preset.mode === "2x1" || preset.mode === "1x2" || preset.mode === "2x2") && (
                              <div className="bg-current/50 rounded-[1px]" />
                            )}
                            {preset.mode === "2x2" && (
                              <>
                                <div className="bg-current/50 rounded-[1px]" />
                                <div className="bg-current/50 rounded-[1px]" />
                              </>
                            )}
                          </div>
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Synchronization Toggles */}
                  {gridSync && onToggleGridSync && (
                    <div className="border-t border-outline-variant/25 pt-2 flex flex-col gap-1.5">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-muted font-semibold">
                        Sync Across Panes
                      </span>
                      {(
                        [
                          {
                            key: "syncSymbol",
                            label: "Sync Symbol",
                            hint: "Broadcast pair changes to all panes",
                          },
                          {
                            key: "syncInterval",
                            label: "Sync Interval",
                            hint: "Broadcast timeframe changes to all panes",
                          },
                          {
                            key: "syncCrosshair",
                            label: "Sync Crosshair",
                            hint: "Mirror time cursor across split panes",
                          },
                        ] as const
                      ).map((item) => {
                        const enabled = gridSync[item.key];
                        return (
                          <button
                            key={item.key}
                            onClick={() => onToggleGridSync(item.key)}
                            className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-container text-left transition-colors cursor-pointer"
                            title={item.hint}
                          >
                            <div className="flex flex-col">
                              <span className="text-[11px] font-medium text-on-surface">
                                {item.label}
                              </span>
                              <span className="text-[9px] text-muted">{item.hint}</span>
                            </div>
                            <span
                              className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                                enabled ? "bg-primary justify-end" : "bg-surface-container-highest justify-start"
                              }`}
                            >
                              <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="border-t border-outline-variant/20 pt-1.5 flex items-center justify-between text-[9px] font-mono text-muted">
                    <span>Click any pane to focus</span>
                    <span>Alt+Enter Maximize</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Multi-Layout Manager Dropdown */}
        <div className="hidden sm:block">
          <LayoutDropdown
            currentSymbol={symbol}
            currentResolution={resolution}
            currentIndicators={activeIndicators}
            user={user}
            onLoadLayout={onLoadLayout}
            onOpenAuthModal={onOpenAuthModal || (() => {})}
          />
        </div>

        {/* Keyboard Shortcuts Cheatsheet Trigger (?) */}
        {onOpenShortcuts && (
          <button
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts (?)"
            className="p-1.5 rounded bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border border-outline-variant/30 transition-colors cursor-pointer"
          >
            <Keyboard size={15} />
          </button>
        )}

        {/* High-Resolution Chart Snapshot Button (DEC-081) */}
        {onTakeSnapshot && (
          <button
            onClick={onTakeSnapshot}
            disabled={isCapturingSnapshot}
            title="Capture High-Resolution Chart Snapshot (PNG)"
            className="p-1.5 rounded bg-surface-container-low hover:bg-surface-container text-muted hover:text-primary border border-outline-variant/30 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Camera size={15} className={isCapturingSnapshot ? "animate-pulse text-primary" : ""} />
          </button>
        )}

        {/* Fullscreen Toggle */}
        <button
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen"
          className="p-1.5 rounded bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border border-outline-variant/30 transition-colors"
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        {/* Right Sidebar Toggle */}
        <button
          onClick={onToggleSidebar}
          title="Toggle Watchlist & Depth"
          className={`p-1.5 rounded border transition-colors ${
            isSidebarOpen
              ? "bg-surface-container-high text-on-surface border-border"
              : "bg-surface-container-low text-muted hover:text-on-surface border-outline-variant/30"
          }`}
        >
          <PanelRight size={15} />
        </button>

        <div className="h-4 w-px bg-border mx-0.5" />

        {/* User Profile / Auth Pill Button */}
        <button
          onClick={onOpenAuthModal}
          className="flex items-center gap-1.5 p-1 rounded hover:bg-surface-container transition-colors pl-1 cursor-pointer"
          title={user?.username ? `${user.username} (${user.role || "TRADER"})` : "Trader Account"}
        >
          <div className="relative">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-container to-blue-700 flex items-center justify-center text-[10px] font-bold text-white shadow-xs">
              {typeof user?.username === "string" && user.username.length > 0
                ? user.username.slice(0, 2).toUpperCase()
                : "TR"}
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface ${
                user ? "bg-secondary" : "bg-cyan"
              }`}
            />
          </div>

          <div className="hidden lg:flex flex-col text-left">
            <span className="text-[11px] font-mono font-bold leading-none text-on-surface">
              {user?.username || "Trader"}
            </span>
            <span className="text-[9px] font-mono text-muted leading-tight">
              {user?.role || "TRADER"}
            </span>
          </div>
        </button>
      </div>

      {/* TradingView-Style Symbol Search Modal (1,480+ MEXC Pairs) */}
      <SymbolSearchModal
        isOpen={isSymbolSearchOpen}
        onClose={() => setIsSymbolSearchOpen(false)}
        selectedSymbol={symbol}
        onSelectSymbol={(newSym) => {
          onSelectSymbol(newSym);
          setIsSymbolSearchOpen(false);
        }}
      />
    </header>
  );
}
