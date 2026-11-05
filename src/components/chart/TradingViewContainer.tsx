"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { CandlestickBar } from "@/lib/mexc/types";
import { mexcClient } from "@/lib/mexc/client";
import { mexcWsManager } from "@/lib/mexc/websocket";
import { replayEngine, ReplayState } from "@/lib/replay/replay-engine";
import { Bar } from "@/types/tradingview";
import { ta } from "@/lib/indicators/ta-math";
import { Activity, ShieldCheck, Layers, Settings, X, Trash2, Lock, Unlock, Settings2, BellPlus, Copy, Eye, EyeOff, BarChart2, Play, RefreshCw, RotateCcw, GripVertical } from "lucide-react";
import { DrawingToolType } from "../terminal/DrawingRail";
import { BacktestPerformance, BacktestTrade } from "@/lib/strategy/types";
import { PriceAlert, createAlertsFromDrawing } from "@/lib/alerts/alerts-engine";
import { calculateVisibleVolumeProfile, calculateFixedRangeVolumeProfile } from "@/lib/indicators/volume-profile";
import { matchChartShortcut, isTypingTarget } from "@/lib/ui/keyboard-shortcuts";
import {
  PaperAccountState,
  createInitialPaperAccount,
  createOrderInputFromDrawing,
  calculatePositionUnrealizedPnl,
} from "@/lib/trading/paper-trading-engine";
import { computeUnmitigatedFvgs, FvgZone } from "@/lib/indicators/fvg-engine";
import {
  computeMarketStructure,
  MarketStructureSettings,
  getStoredMarketStructureSettings,
  saveMarketStructureSettings,
} from "@/lib/indicators/market-structure";
import { MarketStructureSettingsModal } from "./MarketStructureSettingsModal";
import {
  computeCandleMarketStructure,
  CandleStructureSettings,
  getStoredCandleStructureSettings,
  saveCandleStructureSettings,
} from "@/lib/indicators/candle-structure";
import { CandleStructureSettingsModal } from "./CandleStructureSettingsModal";
import {
  ChartDrawing,
  calculateFibLevels,
  calculateTrendFibLevels,
  calculateGannBoxLevels,
  calculatePositionMetrics,
  getPositionHandles,
  clampPositionEntryPrice,
  clampPositionTargetPrice,
  clampPositionStopPrice,
  quantizePrice,
  calculateDateRangeMetrics,
  calculateRulerMetrics,
  getRectangleHandles,
  isPointNearCircle,
  findNearestCandlePoint,
  isPointNearSegment,
  getResolutionMs,
  isPointNearRectangle,
  isPointNearPath,
  extrapolateCoordinateToTime,
  extrapolateTimeToCoordinate,
  pushDrawingHistory,
  performDrawingUndo,
  performDrawingRedo,
  cloneDrawingObject,
  reorderDrawingLayer,
  calculateShiftAngleSnap,
  calculateShiftSquareSnap,
  calculateShiftAxisLock,
  DEFAULT_FIB_LEVELS,
} from "@/lib/chart/drawing-math";
import { DrawingSettingsModal } from "./DrawingSettingsModal";
import { calculatePricePrecision } from "@/lib/chart/price-precision";
import { FavoritesToolbar } from "../terminal/FavoritesToolbar";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type BarData,
  type HistogramData,
  type LineData,
  type LogicalRange,
} from "lightweight-charts";
import {
  toUtcTimestamp,
  formatCandlestickData,
  formatVolumeData,
  buildEmaLineData,
  buildTradeMarkers,
  mergeAndDeduplicateBars,
  buildBollingerBandsData,
  buildRsiData,
  buildMacdData,
  buildStrategyEquitySeriesData,
} from "@/lib/chart/lightweight-adapter";

interface TradingViewContainerProps {
  paneId?: string;
  syncCrosshair?: boolean;
  /** When false (non-focused split pane), Alt+ chart shortcuts are ignored (DEC-077). */
  isActivePane?: boolean;
  symbol: string;
  resolution: string;
  activeDrawingTool?: DrawingToolType;
  onSelectDrawingTool?: (tool: DrawingToolType) => void;
  isMagnetActive?: boolean;
  isDrawingsLocked?: boolean;
  isDrawingsHidden?: boolean;
  activeIndicators?: string[];
  hiddenIndicators?: string[];
  onToggleIndicator?: (name: string) => void;
  onToggleIndicatorVisibility?: (name: string) => void;
  trades?: BacktestTrade[];
  strategyResult?: BacktestPerformance | null;
  strategyName?: string;
  focusedTrade?: BacktestTrade | null;
  onClearStrategy?: () => void;
  onBarsLoaded?: (bars: CandlestickBar[]) => void;
  onPriceUpdate?: (stats: {
    price: number;
    change: number;
    high: number;
    low: number;
    volume: number;
  }) => void;
  favoriteTools?: DrawingToolType[];
  onToggleFavorite?: (tool: DrawingToolType) => void;
  showFavoritesBar?: boolean;
  onToggleFavoritesBar?: () => void;
  customIndicatorData?: {
    name: string;
    data: Array<{ time: number; value: number }>;
    color?: string;
  } | null;
  onClearCustomIndicator?: () => void;
  customScriptBoxes?: any[] | null;
}

declare global {
  interface Window {
    TradingView?: any;
  }
}

interface HoveredStats {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  ema20?: number;
  ema50?: number;
  ema100?: number;
  ema200?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  strategyEquity?: number;
  buyAndHoldEquity?: number;
  strategyDrawdown?: number;
}

export function TradingViewContainer({
  paneId = "pane-0",
  syncCrosshair = true,
  isActivePane = true,
  symbol,
  resolution,
  activeDrawingTool = "none",
  onSelectDrawingTool,
  isMagnetActive = true,
  isDrawingsLocked = false,
  isDrawingsHidden = false,
  activeIndicators = ["EMA Ribbon Momentum Multi-Timeframe"],
  hiddenIndicators = [],
  onToggleIndicator,
  onToggleIndicatorVisibility,
  trades = [],
  strategyResult = null,
  strategyName = "Pine Strategy",
  focusedTrade = null,
  onClearStrategy,
  onBarsLoaded,
  onPriceUpdate,
  favoriteTools = [],
  onToggleFavorite,
  showFavoritesBar = false,
  onToggleFavoritesBar,
  customIndicatorData = null,
  onClearCustomIndicator,
  customScriptBoxes = null,
}: TradingViewContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartMountRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);

  // Lightweight Charts engine refs
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema100SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdLineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const strategyEquitySeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const strategyBuyHoldSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const strategyDrawdownSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const customIndicatorSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // Sub-pane & Volume Profile configurable parameters (DEC-037, DEC-038, DEC-071)
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiOverbought, setRsiOverbought] = useState(70);
  const [rsiOversold, setRsiOversold] = useState(30);

  const [macdFast, setMacdFast] = useState(12);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);

  const [vpvrRows, setVpvrRows] = useState(24);
  const [vpvrVaPercent, setVpvrVaPercent] = useState(70);

  // Strategy Equity & Underwater Drawdown Overlay toggles (DEC-074)
  const [showStrategyPane, setShowStrategyPane] = useState(true);
  const [showBuyHoldBenchmark, setShowBuyHoldBenchmark] = useState(true);
  const [showUnderwaterDrawdown, setShowUnderwaterDrawdown] = useState(true);
  const [showTradeConnectors, setShowTradeConnectors] = useState(true);

  // Multi-Chart Crosshair Synchronization state (DEC-075)
  const [syncedCrosshairTime, setSyncedCrosshairTime] = useState<number | null>(null);
  const syncCrosshairRef = useRef(syncCrosshair);
  syncCrosshairRef.current = syncCrosshair;
  const paneIdRef = useRef(paneId);
  paneIdRef.current = paneId;

  // Keyboard shortcut support (DEC-077)
  const lastHoverPointRef = useRef<{ x: number; y: number } | null>(null);
  const [isPriceScaleInverted, setIsPriceScaleInverted] = useState(false);
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);

  // Quick settings tuning modal state
  const [activeSettingsModal, setActiveSettingsModal] = useState<"rsi" | "macd" | "vpvr" | null>(null);

  // Synchronous state refs for callbacks
  const barsRef = useRef<CandlestickBar[]>([]);
  const isFetchingOlderBars = useRef(false);
  const hasMoreHistory = useRef(true);
  const isInitialLoadDone = useRef(false);
  const lastBackfillTime = useRef(0);

  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const resolutionRef = useRef(resolution);
  resolutionRef.current = resolution;

  const onBarsLoadedRef = useRef(onBarsLoaded);
  onBarsLoadedRef.current = onBarsLoaded;

  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  // Component React states
  const [hasLibrary, setHasLibrary] = useState(false);
  const [bars, setBars] = useState<CandlestickBar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [canLoadMoreHistory, setCanLoadMoreHistory] = useState(true);
  const [activeQuickRange, setActiveQuickRange] = useState<string | null>(null);
  const [quickRangePos, setQuickRangePos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingQuickRange, setIsDraggingQuickRange] = useState(false);
  const quickRangeDragRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const quickRangeBarRef = useRef<HTMLDivElement>(null);

  // Load persisted Quick-Range bar position (DEC-117)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mochex:quick_range_pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setQuickRangePos(parsed);
        }
      }
    } catch {}
  }, []);

  const handleMouseDownQuickRangeGrip = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentEl = quickRangeBarRef.current;
    const parentRect = currentEl?.parentElement?.getBoundingClientRect();
    const elRect = currentEl?.getBoundingClientRect();

    const currentX = quickRangePos?.x ?? (elRect && parentRect ? elRect.left - parentRect.left : 64);
    const currentY = quickRangePos?.y ?? (elRect && parentRect ? elRect.top - parentRect.top : (parentRect ? parentRect.height - 38 : 600));

    setIsDraggingQuickRange(true);
    quickRangeDragRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: currentX,
      startY: currentY,
    };
  };

  useEffect(() => {
    if (!isDraggingQuickRange) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!quickRangeDragRef.current) return;
      const dx = e.clientX - quickRangeDragRef.current.mouseX;
      const dy = e.clientY - quickRangeDragRef.current.mouseY;
      const parentRect = quickRangeBarRef.current?.parentElement?.getBoundingClientRect();
      const maxW = parentRect ? parentRect.width - 150 : window.innerWidth - 150;
      const maxH = parentRect ? parentRect.height - 35 : window.innerHeight - 35;

      const newX = Math.max(8, Math.min(maxW, quickRangeDragRef.current.startX + dx));
      const newY = Math.max(8, Math.min(maxH, quickRangeDragRef.current.startY + dy));

      setQuickRangePos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDraggingQuickRange(false);
      quickRangeDragRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingQuickRange]);

  useEffect(() => {
    if (quickRangePos) {
      try {
        localStorage.setItem("mochex:quick_range_pos", JSON.stringify(quickRangePos));
      } catch {}
    }
  }, [quickRangePos]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [hoveredStats, setHoveredStats] = useState<HoveredStats | null>(null);
  const [replayState, setReplayState] = useState<ReplayState>("IDLE");
  const [feedMode, setFeedMode] = useState<"ws" | "polling">("polling");
  const lastWsTickTimeRef = useRef<number>(0);
  const [isCustomIndicatorHidden, setIsCustomIndicatorHidden] = useState(false);

  // Dynamic Price Precision & Tick Step (DEC-097)
  const pricePrecision = useMemo(() => {
    const refPrice = currentPrice || (bars.length > 0 ? bars[bars.length - 1].close : 0);
    return calculatePricePrecision(refPrice, bars);
  }, [currentPrice, bars]);

  // Geometric drawing tools state (DEC-040 to DEC-049)
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [inFlightDrawing, setInFlightDrawing] = useState<ChartDrawing | null>(null);
  const [inFlightPathPoints, setInFlightPathPoints] = useState<Array<{ time: number; price: number }>>([]);
  const [inFlightTrendFibPoints, setInFlightTrendFibPoints] = useState<Array<{ time: number; price: number }>>([]);
  const [inFlightBrushPoints, setInFlightBrushPoints] = useState<Array<{ time: number; price: number }>>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [drawingStep, setDrawingStep] = useState<0 | 1>(0);
  const [draggedHandle, setDraggedHandle] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
    startTime: number;
    endTime: number;
    startPrice: number;
    endPrice: number;
    targetPrice?: number;
    stopPrice?: number;
    points?: Array<{ time: number; price: number }>;
    wasStartEarlier?: boolean;
    wasStartHigher?: boolean;
  } | null>(null);
  const dragStartPosRef = useRef<typeof dragStartPos>(null);
  dragStartPosRef.current = dragStartPos;
  const [snappedPoint, setSnappedPoint] = useState<{
    time: number;
    price: number;
    x: number;
    y: number;
  } | null>(null);
  const [isHoveringDrawing, setIsHoveringDrawing] = useState(false);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const isDrawingMode = activeDrawingTool !== "none" && activeDrawingTool !== "crosshair";

  // Market Structure & Substructure Settings State
  const [marketStructureSettings, setMarketStructureSettings] = useState<MarketStructureSettings>(() => getStoredMarketStructureSettings());
  const [isMarketStructureModalOpen, setIsMarketStructureModalOpen] = useState(false);

  useEffect(() => {
    const handleOpenSettings = () => setIsMarketStructureModalOpen(true);
    window.addEventListener("mochex:open-market-structure-settings", handleOpenSettings);
    return () => window.removeEventListener("mochex:open-market-structure-settings", handleOpenSettings);
  }, []);

  // Candlestick-Based Market Structure Settings State
  const [candleStructureSettings, setCandleStructureSettings] = useState<CandleStructureSettings>(() => getStoredCandleStructureSettings());
  const [isCandleStructureModalOpen, setIsCandleStructureModalOpen] = useState(false);

  useEffect(() => {
    const handleOpenCandleSettings = () => setIsCandleStructureModalOpen(true);
    window.addEventListener("mochex:open-candle-structure-settings", handleOpenCandleSettings);
    return () => window.removeEventListener("mochex:open-candle-structure-settings", handleOpenCandleSettings);
  }, []);

  // Undo / Redo History Engine Refs (DEC-068)
  const drawingsRef = useRef<ChartDrawing[]>([]);
  const undoStackRef = useRef<ChartDrawing[][]>([]);
  const redoStackRef = useRef<ChartDrawing[][]>([]);
  const preDragDrawingsRef = useRef<ChartDrawing[] | null>(null);
  const preModalDrawingsRef = useRef<ChartDrawing[] | null>(null);
  const draggedHandleRef = useRef<string | null>(null);
  const isSettingsModalOpenRef = useRef(false);

  // 1. Check for proprietary TradingView library drop-in
  useEffect(() => {
    if (typeof window !== "undefined" && window.TradingView) {
      setHasLibrary(true);
    }
  }, []);

  // 2. Initialize Lightweight-Charts Instance on Mount
  useEffect(() => {
    if (hasLibrary || !chartMountRef.current) return;

    // Stitch Tactical Dark Palette Layout
    const chart = createChart(chartMountRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a141f" },
        textColor: "#8d90a2",
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        panes: {
          enableResize: true,
          separatorColor: "#17202b",
          separatorHoverColor: "#2962ff",
        },
      },
      grid: {
        vertLines: { color: "#131c27" },
        horzLines: { color: "#131c27" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(141, 144, 162, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2962ff",
        },
        horzLine: {
          color: "rgba(141, 144, 162, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2962ff",
        },
      },
      rightPriceScale: {
        borderColor: "#17202b",
        visible: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.18,
        },
      },
      timeScale: {
        borderColor: "#17202b",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      localization: {
        priceFormatter: (p: number) => {
          const info = calculatePricePrecision(p, barsRef.current);
          return info.formatPrice(p);
        },
      },
      autoSize: true,
    });

    chartRef.current = chart;

    const initialPrec = calculatePricePrecision(
      barsRef.current[barsRef.current.length - 1]?.close || 0,
      barsRef.current
    );
    const initialPriceFormat = {
      type: "price" as const,
      precision: initialPrec.precision,
      minMove: initialPrec.minMove,
    };

    // 2.1 Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00c087",
      downColor: "#ff3b30",
      borderVisible: true,
      borderUpColor: "#00c087",
      borderDownColor: "#ff3b30",
      wickUpColor: "#00c087",
      wickDownColor: "#ff3b30",
      priceFormat: initialPriceFormat,
    });
    candleSeriesRef.current = candleSeries;

    // 2.2 Volume Histogram Series (Independent Price Scale)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeriesRef.current = volumeSeries;

    // Unified Series Topology: Volume Sub-Pane Scale Margins (margins 80% top / 0% bottom)
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // 2.3 4 EMA Ribbon Suite (20 White, 50 Blue, 100 Yellow, 200 Orange)
    const ema20Series = chart.addSeries(LineSeries, {
      color: "#ffffff",
      lineWidth: 1,
      priceScaleId: "right",
      title: "EMA 20",
      priceFormat: initialPriceFormat,
    });
    ema20SeriesRef.current = ema20Series;

    const ema50Series = chart.addSeries(LineSeries, {
      color: "#2962ff",
      lineWidth: 2,
      priceScaleId: "right",
      title: "EMA 50",
      priceFormat: initialPriceFormat,
    });
    ema50SeriesRef.current = ema50Series;

    const ema100Series = chart.addSeries(LineSeries, {
      color: "#f5ac37",
      lineWidth: 3,
      priceScaleId: "right",
      title: "EMA 100",
      priceFormat: initialPriceFormat,
    });
    ema100SeriesRef.current = ema100Series;

    const ema200Series = chart.addSeries(LineSeries, {
      color: "#ff7043",
      lineWidth: 4,
      priceScaleId: "right",
      title: "EMA 200",
      priceFormat: initialPriceFormat,
    });
    ema200SeriesRef.current = ema200Series;

    // 2.3b Bollinger Bands Overlays
    const bbUpperSeries = chart.addSeries(LineSeries, {
      color: "rgba(41, 98, 255, 0.75)",
      lineWidth: 1,
      priceScaleId: "right",
      title: "BB Upper",
      visible: false,
      priceFormat: initialPriceFormat,
    });
    bbUpperSeriesRef.current = bbUpperSeries;

    const bbMiddleSeries = chart.addSeries(LineSeries, {
      color: "rgba(245, 172, 55, 0.75)",
      lineWidth: 1,
      priceScaleId: "right",
      title: "BB Basis",
      visible: false,
      priceFormat: initialPriceFormat,
    });
    bbMiddleSeriesRef.current = bbMiddleSeries;

    const bbLowerSeries = chart.addSeries(LineSeries, {
      color: "rgba(41, 98, 255, 0.75)",
      lineWidth: 1,
      priceScaleId: "right",
      title: "BB Lower",
      visible: false,
      priceFormat: initialPriceFormat,
    });
    bbLowerSeriesRef.current = bbLowerSeries;

    // 2.4 Trade Markers Plugin (Native Lightweight-Charts Markers)
    const markersPlugin = createSeriesMarkers(candleSeries, []);
    markersPluginRef.current = markersPlugin;

    // 2.5 Crosshair Hover Telemetry Synchronization (DEC-034, DEC-074 & DEC-075)
    chart.subscribeCrosshairMove((param) => {
      lastHoverPointRef.current = param.point ? { x: param.point.x, y: param.point.y } : null;
      if (!param.time || !param.point) {
        setHoveredStats(null);
        if (syncCrosshairRef.current && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("mochex:crosshair-sync", {
              detail: { sourcePaneId: paneIdRef.current, timeMs: null },
            })
          );
        }
        return;
      }

      if (syncCrosshairRef.current && typeof window !== "undefined") {
        const timeSec = Number(param.time);
        const timeMs = timeSec > 1e11 ? timeSec : timeSec * 1000;
        window.dispatchEvent(
          new CustomEvent("mochex:crosshair-sync", {
            detail: { sourcePaneId: paneIdRef.current, timeMs },
          })
        );
      }

      const candleData = param.seriesData.get(candleSeries) as BarData<Time> | undefined;
      const volData = param.seriesData.get(volumeSeries) as HistogramData<Time> | undefined;
      const ema20Data = param.seriesData.get(ema20Series) as LineData<Time> | undefined;
      const ema50Data = param.seriesData.get(ema50Series) as LineData<Time> | undefined;
      const ema100Data = param.seriesData.get(ema100Series) as LineData<Time> | undefined;
      const ema200Data = param.seriesData.get(ema200Series) as LineData<Time> | undefined;
      const bbUpperData = param.seriesData.get(bbUpperSeries) as LineData<Time> | undefined;
      const bbMiddleData = param.seriesData.get(bbMiddleSeries) as LineData<Time> | undefined;
      const bbLowerData = param.seriesData.get(bbLowerSeries) as LineData<Time> | undefined;
      const rsiData = rsiSeriesRef.current
        ? (param.seriesData.get(rsiSeriesRef.current) as LineData<Time> | undefined)
        : undefined;
      const macdLineData = macdLineSeriesRef.current
        ? (param.seriesData.get(macdLineSeriesRef.current) as LineData<Time> | undefined)
        : undefined;
      const macdSigData = macdSignalSeriesRef.current
        ? (param.seriesData.get(macdSignalSeriesRef.current) as LineData<Time> | undefined)
        : undefined;
      const macdHistData = macdHistSeriesRef.current
        ? (param.seriesData.get(macdHistSeriesRef.current) as HistogramData<Time> | undefined)
        : undefined;
      const stratEqData = strategyEquitySeriesRef.current
        ? (param.seriesData.get(strategyEquitySeriesRef.current) as LineData<Time> | undefined)
        : undefined;
      const stratBhData = strategyBuyHoldSeriesRef.current
        ? (param.seriesData.get(strategyBuyHoldSeriesRef.current) as LineData<Time> | undefined)
        : undefined;
      const stratDdData = strategyDrawdownSeriesRef.current
        ? (param.seriesData.get(strategyDrawdownSeriesRef.current) as HistogramData<Time> | undefined)
        : undefined;

      if (candleData && "open" in candleData) {
        setHoveredStats({
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value,
          ema20: ema20Data?.value,
          ema50: ema50Data?.value,
          ema100: ema100Data?.value,
          ema200: ema200Data?.value,
          bbUpper: bbUpperData?.value,
          bbMiddle: bbMiddleData?.value,
          bbLower: bbLowerData?.value,
          rsi: rsiData?.value,
          macd: macdLineData?.value,
          macdSignal: macdSigData?.value,
          macdHist: macdHistData?.value,
          strategyEquity: stratEqData?.value,
          buyAndHoldEquity: stratBhData?.value,
          strategyDrawdown: stratDdData?.value,
        });
      } else {
        setHoveredStats(null);
      }
    });

    // 2.6 Infinite Scroll Pagination on Left Boundary Panning (DEC-033 & DEC-076)
    const onLogicalRangeChange = async (newRange: LogicalRange | null) => {
      if (!newRange) return;
      const now = Date.now();
      // Only trigger when initial data load is complete and cooldown has passed
      if (!isInitialLoadDone.current) return;
      if (now - lastBackfillTime.current < 600) return;

      if (
        newRange.from < 25 &&
        !isFetchingOlderBars.current &&
        hasMoreHistory.current &&
        barsRef.current.length < 10000
      ) {
        const currentBars = barsRef.current;
        if (currentBars.length < 20) return;
        const oldestBar = currentBars[0];

        lastBackfillTime.current = now;
        isFetchingOlderBars.current = true;
        setIsLoadingOlder(true);
        try {
          const olderBars = await mexcClient.getKlines({
            symbol: symbolRef.current,
            resolution: resolutionRef.current,
            limit: 500,
            endTime: oldestBar.time - 1,
          });

          if (!olderBars || olderBars.length < 2) {
            hasMoreHistory.current = false;
            setCanLoadMoreHistory(false);
            return;
          }

          const merged = mergeAndDeduplicateBars(olderBars, currentBars);
          const addedCount = merged.length - currentBars.length;

          if (addedCount > 0) {
            barsRef.current = merged;
            setBars(merged);
            onBarsLoadedRef.current?.(merged);
            if (replayEngine.getState() === "IDLE") {
              replayEngine.loadHistory(merged as Bar[]);
            }

            // Re-populate series with merged dataset
            candleSeries.setData(formatCandlestickData(merged));
            volumeSeries.setData(formatVolumeData(merged));
            ema20Series.setData(buildEmaLineData(merged, 20));
            ema50Series.setData(buildEmaLineData(merged, 50));
            ema100Series.setData(buildEmaLineData(merged, 100));
            ema200Series.setData(buildEmaLineData(merged, 200));
            const bbData = buildBollingerBandsData(merged, 20, 2);
            bbUpperSeries.setData(bbData.upper);
            bbMiddleSeries.setData(bbData.middle);
            bbLowerSeries.setData(bbData.lower);

            if (rsiSeriesRef.current) {
              rsiSeriesRef.current.setData(buildRsiData(merged, rsiPeriod));
            }
            if (macdLineSeriesRef.current && macdSignalSeriesRef.current && macdHistSeriesRef.current) {
              const macdData = buildMacdData(merged, macdFast, macdSlow, macdSignal);
              macdLineSeriesRef.current.setData(macdData.macd);
              macdSignalSeriesRef.current.setData(macdData.signal);
              macdHistSeriesRef.current.setData(macdData.histogram);
            }

            // Maintain viewport offset seamlessly without jump
            const curRange = chart.timeScale().getVisibleLogicalRange();
            if (curRange) {
              chart.timeScale().setVisibleLogicalRange({
                from: curRange.from + addedCount,
                to: curRange.to + addedCount,
              });
            }
          } else {
            hasMoreHistory.current = false;
            setCanLoadMoreHistory(false);
          }
        } catch (err) {
          console.error("Failed to backfill historical bars:", err);
        } finally {
          isFetchingOlderBars.current = false;
          setIsLoadingOlder(false);
        }
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRangeChange);

    // 2.7 Responsive Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !chartRef.current) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chartRef.current.resize(width, height);
      }
    });
    resizeObserver.observe(chartMountRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onLogicalRangeChange);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema50SeriesRef.current = null;
      ema100SeriesRef.current = null;
      ema200SeriesRef.current = null;
      bbUpperSeriesRef.current = null;
      bbMiddleSeriesRef.current = null;
      bbLowerSeriesRef.current = null;
      rsiSeriesRef.current = null;
      macdLineSeriesRef.current = null;
      macdSignalSeriesRef.current = null;
      macdHistSeriesRef.current = null;
      customIndicatorSeriesRef.current = null;
      markersPluginRef.current = null;
    };
  }, [hasLibrary]);

  // 2.8 Manual & Quick-Range Deep History Backfill (DEC-076)
  const fetchMoreOlderCandles = useCallback(
    async (batchTarget = 1000, preserveViewport = true): Promise<CandlestickBar[]> => {
      if (
        isFetchingOlderBars.current ||
        !hasMoreHistory.current ||
        barsRef.current.length === 0 ||
        barsRef.current.length >= 10000
      ) {
        return barsRef.current;
      }

      const currentBars = barsRef.current;
      const oldestBar = currentBars[0];
      isFetchingOlderBars.current = true;
      setIsLoadingOlder(true);
      lastBackfillTime.current = Date.now();

      try {
        const olderBars = await mexcClient.getDeepKlines({
          symbol: symbolRef.current,
          resolution: resolutionRef.current,
          targetCount: batchTarget,
          endTime: oldestBar.time - 1,
        });

        if (!olderBars || olderBars.length < 2) {
          hasMoreHistory.current = false;
          setCanLoadMoreHistory(false);
          return currentBars;
        }

        const merged = mergeAndDeduplicateBars(olderBars, currentBars);
        const addedCount = merged.length - currentBars.length;

        if (addedCount > 0) {
          barsRef.current = merged;
          setBars(merged);
          onBarsLoadedRef.current?.(merged);
          if (replayEngine.getState() === "IDLE") {
            replayEngine.loadHistory(merged as Bar[]);
          }

          const prevRange = chartRef.current?.timeScale().getVisibleLogicalRange();

          candleSeriesRef.current?.setData(formatCandlestickData(merged));
          volumeSeriesRef.current?.setData(formatVolumeData(merged));
          ema20SeriesRef.current?.setData(buildEmaLineData(merged, 20));
          ema50SeriesRef.current?.setData(buildEmaLineData(merged, 50));
          ema100SeriesRef.current?.setData(buildEmaLineData(merged, 100));
          ema200SeriesRef.current?.setData(buildEmaLineData(merged, 200));
          const bbData = buildBollingerBandsData(merged, 20, 2);
          bbUpperSeriesRef.current?.setData(bbData.upper);
          bbMiddleSeriesRef.current?.setData(bbData.middle);
          bbLowerSeriesRef.current?.setData(bbData.lower);

          if (rsiSeriesRef.current) {
            rsiSeriesRef.current.setData(buildRsiData(merged, rsiPeriod));
          }
          if (
            macdLineSeriesRef.current &&
            macdSignalSeriesRef.current &&
            macdHistSeriesRef.current
          ) {
            const macdData = buildMacdData(merged, macdFast, macdSlow, macdSignal);
            macdLineSeriesRef.current.setData(macdData.macd);
            macdSignalSeriesRef.current.setData(macdData.signal);
            macdHistSeriesRef.current.setData(macdData.histogram);
          }

          if (preserveViewport && prevRange && chartRef.current) {
            chartRef.current.timeScale().setVisibleLogicalRange({
              from: prevRange.from + addedCount,
              to: prevRange.to + addedCount,
            });
          }
          return merged;
        } else {
          hasMoreHistory.current = false;
          setCanLoadMoreHistory(false);
          return currentBars;
        }
      } catch (err) {
        console.error("Failed to fetch older history:", err);
        return currentBars;
      } finally {
        isFetchingOlderBars.current = false;
        setIsLoadingOlder(false);
      }
    },
    [rsiPeriod, macdFast, macdSlow, macdSignal]
  );

  const handleSelectQuickRange = useCallback(
    async (rangeKey: "1D" | "1W" | "1M" | "3M" | "ALL") => {
      if (!chartRef.current || barsRef.current.length === 0) return;
      setActiveQuickRange(rangeKey);

      if (rangeKey === "ALL") {
        chartRef.current.timeScale().fitContent();
        return;
      }

      const spanMsMap: Record<"1D" | "1W" | "1M" | "3M", number> = {
        "1D": 24 * 60 * 60 * 1000,
        "1W": 7 * 24 * 60 * 60 * 1000,
        "1M": 30 * 24 * 60 * 60 * 1000,
        "3M": 90 * 24 * 60 * 60 * 1000,
      };

      const spanMs = spanMsMap[rangeKey];
      let activeBars = barsRef.current;
      const latestTime = activeBars[activeBars.length - 1].time;
      const targetStartMs = latestTime - spanMs;

      // If target range reaches further back than currently loaded candles, backfill first
      if (targetStartMs < activeBars[0].time && hasMoreHistory.current) {
        const resMs = Math.max(60000, getResolutionMs(resolutionRef.current));
        const missingBarsNeeded = Math.min(
          2000,
          Math.ceil((activeBars[0].time - targetStartMs) / resMs) + 100
        );
        activeBars = await fetchMoreOlderCandles(missingBarsNeeded, false);
      }

      if (!chartRef.current || activeBars.length === 0) return;
      const clampedStartMs = Math.max(activeBars[0].time, targetStartMs);
      try {
        chartRef.current.timeScale().setVisibleRange({
          from: toUtcTimestamp(clampedStartMs),
          to: toUtcTimestamp(activeBars[activeBars.length - 1].time),
        });
      } catch {
        chartRef.current.timeScale().fitContent();
      }
    },
    [fetchMoreOlderCandles]
  );

  // 3. Load 1,500 historical klines (3 stitched 500-bar batches) and attach real-time MEXC feed (DEC-076)
  useEffect(() => {
    let isCancelled = false;
    hasMoreHistory.current = true;
    setCanLoadMoreHistory(true);
    setActiveQuickRange(null);
    isInitialLoadDone.current = false;
    setIsLoading(true);

    // Extracted Series Populate Helper (DEC-073, DEC-115)
    const applyBarsToChartSeries = (targetBars: CandlestickBar[]) => {
      barsRef.current = targetBars;
      setBars(targetBars);
      if (
        candleSeriesRef.current &&
        volumeSeriesRef.current &&
        ema20SeriesRef.current &&
        ema50SeriesRef.current
      ) {
        candleSeriesRef.current.setData(formatCandlestickData(targetBars));
        volumeSeriesRef.current.setData(formatVolumeData(targetBars));
        ema20SeriesRef.current.setData(buildEmaLineData(targetBars, 20));
        ema50SeriesRef.current.setData(buildEmaLineData(targetBars, 50));
        ema100SeriesRef.current?.setData(buildEmaLineData(targetBars, 100));
        ema200SeriesRef.current?.setData(buildEmaLineData(targetBars, 200));
        const bbData = buildBollingerBandsData(targetBars, 20, 2);
        bbUpperSeriesRef.current?.setData(bbData.upper);
        bbMiddleSeriesRef.current?.setData(bbData.middle);
        bbLowerSeriesRef.current?.setData(bbData.lower);

        if (rsiSeriesRef.current) {
          rsiSeriesRef.current.setData(buildRsiData(targetBars, rsiPeriod));
        }
        if (
          macdLineSeriesRef.current &&
          macdSignalSeriesRef.current &&
          macdHistSeriesRef.current
        ) {
          const macdData = buildMacdData(targetBars, macdFast, macdSlow, macdSignal);
          macdLineSeriesRef.current.setData(macdData.macd);
          macdSignalSeriesRef.current.setData(macdData.signal);
          macdHistSeriesRef.current.setData(macdData.histogram);
        }
      }
    };

    const loadData = async () => {
      try {
        const isReplayActive = replayEngine.getState() !== "IDLE";
        const activeReplayTimestamp = isReplayActive
          ? replayEngine.getCurrentBar()?.time ?? replayEngine.getCutoffTime()
          : null;

        // Dynamic fetch depth if Replay is active in historical period (DEC-115)
        let targetCount = 1500;
        if (isReplayActive && activeReplayTimestamp) {
          const resMs = Math.max(60000, getResolutionMs(resolution));
          const timeDiffMs = Math.max(0, Date.now() - activeReplayTimestamp);
          const estimatedBarsNeeded = Math.ceil(timeDiffMs / resMs) + 300;
          targetCount = Math.max(1500, Math.min(estimatedBarsNeeded, 10000));
        }

        const fetchedBars = await mexcClient.getDeepKlines({
          symbol,
          resolution,
          targetCount,
        });

        if (!isCancelled) {
          const sorted = [...fetchedBars].sort((a, b) => a.time - b.time);

          if (isReplayActive && activeReplayTimestamp) {
            // DEC-115: Preserve replay session across timeframe changes
            replayEngine.loadHistory(sorted as Bar[], activeReplayTimestamp);
            const visibleBars = replayEngine.getVisibleBars() as CandlestickBar[];
            applyBarsToChartSeries(visibleBars);
            onBarsLoadedRef.current?.(visibleBars);

            // Center chart view around historical replay moment with 75 bars context & 25 bars margin
            if (chartRef.current && visibleBars.length > 0) {
              try {
                const resSec = Math.max(60, Math.floor(getResolutionMs(resolution) / 1000));
                const cutoffSec = Number(toUtcTimestamp(activeReplayTimestamp));
                const fromSec = Math.max(
                  Number(toUtcTimestamp(visibleBars[0].time)),
                  cutoffSec - 75 * resSec
                );
                const toSec = cutoffSec + 25 * resSec;
                chartRef.current.timeScale().setVisibleRange({
                  from: fromSec as any,
                  to: toSec as any,
                });
              } catch {
                chartRef.current.timeScale().fitContent();
              }
            }

            const currentReplayBar = replayEngine.getCurrentBar();
            if (currentReplayBar) {
              const currentClose = currentReplayBar.close;
              const firstBar = visibleBars[0] || currentReplayBar;
              const change =
                firstBar.open > 0
                  ? ((currentClose - firstBar.open) / firstBar.open) * 100
                  : 0;
              const high = Math.max(...visibleBars.map((b) => b.high));
              const low = Math.min(...visibleBars.map((b) => b.low));
              const volume = visibleBars.reduce((acc, b) => acc + b.volume, 0);

              setCurrentPrice(currentClose);
              onPriceUpdateRef.current?.({
                price: currentClose,
                change,
                high,
                low,
                volume,
              });
            }

            setTimeout(() => {
              isInitialLoadDone.current = true;
            }, 600);
          } else {
            replayEngine.loadHistory(sorted as Bar[]);
            applyBarsToChartSeries(sorted);
            onBarsLoadedRef.current?.(sorted);
            chartRef.current?.timeScale().scrollToRealTime();

            if (sorted.length > 0) {
              const lastBar = sorted[sorted.length - 1];
              const firstBar = sorted[Math.max(0, sorted.length - 96)];
              const change =
                firstBar.open > 0
                  ? ((lastBar.close - firstBar.open) / firstBar.open) * 100
                  : 0;
              const recentWindow = sorted.slice(-96);
              const high = Math.max(...recentWindow.map((b) => b.high));
              const low = Math.min(...recentWindow.map((b) => b.low));
              const volume = recentWindow.reduce((acc, b) => acc + b.volume, 0);

              setCurrentPrice(lastBar.close);
              onPriceUpdateRef.current?.({
                price: lastBar.close,
                change,
                high,
                low,
                volume,
              });
            }

            setTimeout(() => {
              isInitialLoadDone.current = true;
            }, 600);
          }

          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to load bars:", err);
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadData();

    // Extracted Live Candle & Indicator Tick Pipeline (DEC-093)
    const applyLiveBarUpdate = (newBar: CandlestickBar) => {
      if (replayEngine.getState() !== "IDLE") return; // Replay overrides live feed

      setCurrentPrice(newBar.close);

      // Fast-path GPU series update (60 FPS without React re-render bottleneck)
      const barTime = toUtcTimestamp(newBar.time);
      candleSeriesRef.current?.update({
        time: barTime,
        open: newBar.open,
        high: newBar.high,
        low: newBar.low,
        close: newBar.close,
      });

      volumeSeriesRef.current?.update({
        time: barTime,
        value: newBar.volume,
        color:
          newBar.close >= newBar.open
            ? "rgba(0, 192, 135, 0.35)"
            : "rgba(255, 59, 48, 0.35)",
      });

      // Update state & calculate dynamic EMA tick
      const current = barsRef.current;
      if (current.length === 0) {
        barsRef.current = [newBar];
        setBars([newBar]);
      } else {
        const last = current[current.length - 1];
        let updated: CandlestickBar[];
        if (last.time === newBar.time) {
          updated = [...current];
          updated[updated.length - 1] = newBar;
        } else {
          updated = [...current, newBar];
        }
        barsRef.current = updated;
        setBars(updated);

        // Update latest EMA & Bollinger point
        const closes = updated.map((b) => b.close);
        if (closes.length >= 20) {
          const ema20Vals = ta.ema(closes, 20);
          const latestEma20 = ema20Vals[ema20Vals.length - 1];
          if (!isNaN(latestEma20)) {
            ema20SeriesRef.current?.update({ time: barTime, value: latestEma20 });
          }
          const bbVals = ta.bollingerbands(closes, 20, 2);
          const latestBb = bbVals[bbVals.length - 1];
          if (latestBb) {
            if (latestBb.upper !== undefined) {
              bbUpperSeriesRef.current?.update({ time: barTime, value: latestBb.upper });
            }
            if (latestBb.middle !== undefined) {
              bbMiddleSeriesRef.current?.update({ time: barTime, value: latestBb.middle });
            }
            if (latestBb.lower !== undefined) {
              bbLowerSeriesRef.current?.update({ time: barTime, value: latestBb.lower });
            }
          }
        }
        if (closes.length >= 50) {
          const ema50Vals = ta.ema(closes, 50);
          const latestEma50 = ema50Vals[ema50Vals.length - 1];
          if (!isNaN(latestEma50)) {
            ema50SeriesRef.current?.update({ time: barTime, value: latestEma50 });
          }
        }
        if (closes.length >= 100) {
          const ema100Vals = ta.ema(closes, 100);
          const latestEma100 = ema100Vals[ema100Vals.length - 1];
          if (!isNaN(latestEma100)) {
            ema100SeriesRef.current?.update({ time: barTime, value: latestEma100 });
          }
        }
        if (closes.length >= 200) {
          const ema200Vals = ta.ema(closes, 200);
          const latestEma200 = ema200Vals[ema200Vals.length - 1];
          if (!isNaN(latestEma200)) {
            ema200SeriesRef.current?.update({ time: barTime, value: latestEma200 });
          }
        }

        // Update latest RSI point
        if (closes.length >= rsiPeriod + 1 && rsiSeriesRef.current) {
          const rsiList = ta.rsi(closes, rsiPeriod);
          const lastRsi = rsiList[rsiList.length - 1];
          if (!isNaN(lastRsi)) {
            rsiSeriesRef.current.update({ time: barTime, value: lastRsi });
          }
        }

        // Update latest MACD point
        if (
          closes.length >= macdSlow + macdSignal &&
          macdLineSeriesRef.current &&
          macdSignalSeriesRef.current &&
          macdHistSeriesRef.current
        ) {
          const macdList = ta.macd(closes, macdFast, macdSlow, macdSignal);
          const lastMacd = macdList[macdList.length - 1];
          if (
            lastMacd &&
            lastMacd.macd !== undefined &&
            lastMacd.signal !== undefined &&
            lastMacd.histogram !== undefined
          ) {
            macdLineSeriesRef.current.update({ time: barTime, value: lastMacd.macd });
            macdSignalSeriesRef.current.update({ time: barTime, value: lastMacd.signal });
            macdHistSeriesRef.current.update({
              time: barTime,
              value: lastMacd.histogram,
              color:
                lastMacd.histogram >= 0
                  ? "rgba(0, 192, 135, 0.65)"
                  : "rgba(255, 59, 48, 0.65)",
            });
          }
        }

        // Keep parent price telemetry updated with latest window stats
        const firstBar = updated[Math.max(0, updated.length - 96)];
        const change =
          firstBar.open > 0 ? ((newBar.close - firstBar.open) / firstBar.open) * 100 : 0;
        const recentWindow = updated.slice(-96);
        const high = Math.max(...recentWindow.map((b) => b.high));
        const low = Math.min(...recentWindow.map((b) => b.low));
        const volume = recentWindow.reduce((acc, b) => acc + b.volume, 0);

        onPriceUpdateRef.current?.({
          price: newBar.close,
          change,
          high,
          low,
          volume,
        });
      }
    };

    // 1. Subscribe to live WebSocket updates (Fast-path sub-second stream)
    mexcWsManager.connect();
    const intervalStr = mexcClient.toMexcInterval(resolution);
    const channel = mexcWsManager.subscribeKline(symbol, intervalStr, (newBar) => {
      lastWsTickTimeRef.current = Date.now();
      setFeedMode("ws");
      applyLiveBarUpdate(newBar);
    });

    // 2. Resilient REST Polling Fallback (DEC-093)
    // Ticks every 2.5s; executes whenever WebSocket is blocked, disconnected, or silent >4s.
    const pollIntervalId = setInterval(async () => {
      if (isCancelled || replayEngine.getState() !== "IDLE") return;
      if (Date.now() - lastWsTickTimeRef.current < 4000) {
        return;
      }
      setFeedMode("polling");

      try {
        const latestBars = await mexcClient.getKlines({
          symbol,
          resolution,
          limit: 2,
        });
        if (!isCancelled && latestBars && latestBars.length > 0) {
          const latestBar = latestBars[latestBars.length - 1];
          applyLiveBarUpdate(latestBar);
        }
      } catch {}
    }, 2500);

    // Replay Engine Listener (DEC-073) uses hoisted applyBarsToChartSeries

    const unsubscribeReplay = replayEngine.subscribe({
      onStateChange: (newState) => {
        setReplayState(newState);
        if (newState === "IDLE" || newState === "SELECTING") {
          const fullBars = replayEngine.getAllBars() as CandlestickBar[];
          if (fullBars.length > 0) {
            applyBarsToChartSeries(fullBars);
            const last = fullBars[fullBars.length - 1];
            setCurrentPrice(last.close);
            onPriceUpdateRef.current?.({
              price: last.close,
              change:
                fullBars[0].open > 0
                  ? ((last.close - fullBars[0].open) / fullBars[0].open) * 100
                  : 0,
              high: Math.max(...fullBars.map((b) => b.high)),
              low: Math.min(...fullBars.map((b) => b.low)),
              volume: fullBars.reduce((acc, b) => acc + b.volume, 0),
            });
          }
        }
      },
      onTick: (replayBar, _cursorIdx, _totalBars, isForwardStep) => {
        setCurrentPrice(replayBar.close);
        const visibleBars = replayEngine.getVisibleBars() as CandlestickBar[];
        applyBarsToChartSeries(visibleBars);
        if (visibleBars.length > 0) {
          onPriceUpdateRef.current?.({
            price: replayBar.close,
            change:
              visibleBars[0].open > 0
                ? ((replayBar.close - visibleBars[0].open) / visibleBars[0].open) * 100
                : 0,
            high: Math.max(...visibleBars.map((b) => b.high)),
            low: Math.min(...visibleBars.map((b) => b.low)),
            volume: visibleBars.reduce((acc, b) => acc + b.volume, 0),
          });
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("mochex:replay-tick", {
              detail: {
                symbol: symbolRef.current,
                bar: replayBar,
                isForwardStep: Boolean(isForwardStep),
              },
            })
          );
        }
      },
    });

    return () => {
      isCancelled = true;
      clearInterval(pollIntervalId);
      mexcWsManager.unsubscribeKline(channel);
      unsubscribeReplay();
    };
  }, [symbol, resolution]);

  // 4. Trade Markers Synchronization (DEC-032)
  useEffect(() => {
    if (!markersPluginRef.current) return;
    const markers = buildTradeMarkers(trades, barsRef.current);
    markersPluginRef.current.setMarkers(markers);
  }, [trades, bars]);

  // 4b. Click-to-Focus Trade Inspection on Main Chart (DEC-074)
  useEffect(() => {
    if (!focusedTrade || !chartRef.current) return;
    try {
      const fromSec = Number(toUtcTimestamp(focusedTrade.entryTime));
      const toSec = Number(toUtcTimestamp(focusedTrade.exitTime));
      const resSec = Math.max(60, Math.floor(getResolutionMs(resolution) / 1000));
      const spanSec = Math.max(resSec * 6, toSec - fromSec);
      const padSec = Math.max(resSec * 12, Math.floor(spanSec * 1.4));
      chartRef.current.timeScale().setVisibleRange({
        from: (fromSec - padSec) as Time,
        to: (toSec + padSec) as Time,
      });
    } catch {
      // Ignore if visible range is outside loaded bars
    }
  }, [focusedTrade, resolution]);

  // 5. Indicator & Sub-Pane Lifecycle Management (DEC-035 to DEC-039, DEC-074)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // 5.1 Main Pane 0 Overlays (EMA & Bollinger)
    const isEmaHidden =
      hiddenIndicators.includes("EMA Ribbon Momentum Multi-Timeframe") ||
      hiddenIndicators.some((ind) => ind.toLowerCase().includes("ema"));

    const hasRibbonOrEma =
      (activeIndicators.includes("EMA Ribbon Momentum Multi-Timeframe") ||
        activeIndicators.some((ind) => ind.toLowerCase().includes("ema"))) &&
      !isEmaHidden;

    const isBollingerHidden =
      hiddenIndicators.includes("Bollinger Bands Squeeze Breakout") ||
      hiddenIndicators.some((ind) => ind.toLowerCase().includes("bollinger"));

    const hasBollinger =
      (activeIndicators.includes("Bollinger Bands Squeeze Breakout") ||
        activeIndicators.some((ind) => ind.toLowerCase().includes("bollinger"))) &&
      !isBollingerHidden;

    ema20SeriesRef.current?.applyOptions({ visible: hasRibbonOrEma });
    ema50SeriesRef.current?.applyOptions({ visible: hasRibbonOrEma });
    ema100SeriesRef.current?.applyOptions({ visible: hasRibbonOrEma });
    ema200SeriesRef.current?.applyOptions({ visible: hasRibbonOrEma });
    bbUpperSeriesRef.current?.applyOptions({ visible: hasBollinger });
    bbMiddleSeriesRef.current?.applyOptions({ visible: hasBollinger });
    bbLowerSeriesRef.current?.applyOptions({ visible: hasBollinger });

    // 5.2 Dynamic Sub-Pane Allocations
    const isRsiHidden =
      hiddenIndicators.includes("RSI Divergence Engine Pro") ||
      hiddenIndicators.some((ind) => ind.toLowerCase().includes("rsi"));

    const hasRsi =
      (activeIndicators.includes("RSI Divergence Engine Pro") ||
        activeIndicators.some((ind) => ind.toLowerCase().includes("rsi"))) &&
      !isRsiHidden;

    const isMacdHidden =
      hiddenIndicators.includes("Zero-Lag MACD Histogram") ||
      hiddenIndicators.some((ind) => ind.toLowerCase().includes("macd"));

    const hasMacd =
      (activeIndicators.includes("Zero-Lag MACD Histogram") ||
        activeIndicators.some((ind) => ind.toLowerCase().includes("macd"))) &&
      !isMacdHidden;

    const hasStrategySubPane = Boolean(
      strategyResult &&
        strategyResult.equityCurve &&
        strategyResult.equityCurve.length > 0 &&
        showStrategyPane
    );

    // Tear down any existing sub-pane series to ensure deterministic pane order & clean disposal
    if (rsiSeriesRef.current) {
      try {
        chart.removeSeries(rsiSeriesRef.current);
      } catch {}
      rsiSeriesRef.current = null;
    }
    if (macdLineSeriesRef.current) {
      try {
        chart.removeSeries(macdLineSeriesRef.current);
      } catch {}
      macdLineSeriesRef.current = null;
    }
    if (macdSignalSeriesRef.current) {
      try {
        chart.removeSeries(macdSignalSeriesRef.current);
      } catch {}
      macdSignalSeriesRef.current = null;
    }
    if (macdHistSeriesRef.current) {
      try {
        chart.removeSeries(macdHistSeriesRef.current);
      } catch {}
      macdHistSeriesRef.current = null;
    }
    if (strategyEquitySeriesRef.current) {
      try {
        chart.removeSeries(strategyEquitySeriesRef.current);
      } catch {}
      strategyEquitySeriesRef.current = null;
    }
    if (strategyBuyHoldSeriesRef.current) {
      try {
        chart.removeSeries(strategyBuyHoldSeriesRef.current);
      } catch {}
      strategyBuyHoldSeriesRef.current = null;
    }
    if (strategyDrawdownSeriesRef.current) {
      try {
        chart.removeSeries(strategyDrawdownSeriesRef.current);
      } catch {}
      strategyDrawdownSeriesRef.current = null;
    }

    let nextPaneIndex = 1;

    // Allocate RSI Sub-Pane
    if (hasRsi) {
      const rsiPaneIndex = nextPaneIndex++;
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: "#9353d3",
          lineWidth: 2,
          priceScaleId: "right",
          title: `RSI ${rsiPeriod}`,
          autoscaleInfoProvider: () => ({
            priceRange: {
              minValue: 0,
              maxValue: 100,
            },
          }),
        },
        rsiPaneIndex
      );

      rsiSeries.createPriceLine({
        price: rsiOverbought,
        color: "rgba(255, 59, 48, 0.45)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${rsiOverbought}`,
      });
      rsiSeries.createPriceLine({
        price: 50,
        color: "rgba(67, 70, 86, 0.6)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
      });
      rsiSeries.createPriceLine({
        price: rsiOversold,
        color: "rgba(0, 192, 135, 0.45)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${rsiOversold}`,
      });

      rsiSeriesRef.current = rsiSeries;

      // Populate current data
      if (barsRef.current.length > 0) {
        rsiSeries.setData(buildRsiData(barsRef.current, rsiPeriod));
      }

      // Configure fixed 130px height
      const panes = chart.panes();
      if (panes[rsiPaneIndex]) {
        panes[rsiPaneIndex].setHeight(130);
      }
    }

    // Allocate MACD Sub-Pane
    if (hasMacd) {
      const macdPaneIndex = nextPaneIndex++;

      const macdHistSeries = chart.addSeries(
        HistogramSeries,
        {
          priceScaleId: "right",
          title: "Histogram",
        },
        macdPaneIndex
      );

      const macdLineSeries = chart.addSeries(
        LineSeries,
        {
          color: "#2962ff",
          lineWidth: 2,
          priceScaleId: "right",
          title: "MACD",
        },
        macdPaneIndex
      );

      const macdSignalSeries = chart.addSeries(
        LineSeries,
        {
          color: "#f5ac37",
          lineWidth: 1,
          priceScaleId: "right",
          title: "Signal",
        },
        macdPaneIndex
      );

      macdLineSeries.createPriceLine({
        price: 0,
        color: "rgba(67, 70, 86, 0.6)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "0",
      });

      macdHistSeriesRef.current = macdHistSeries;
      macdLineSeriesRef.current = macdLineSeries;
      macdSignalSeriesRef.current = macdSignalSeries;

      // Populate current data
      if (barsRef.current.length > 0) {
        const macdData = buildMacdData(barsRef.current, macdFast, macdSlow, macdSignal);
        macdHistSeries.setData(macdData.histogram);
        macdLineSeries.setData(macdData.macd);
        macdSignalSeries.setData(macdData.signal);
      }

      // Configure fixed 130px height
      const panes = chart.panes();
      if (panes[macdPaneIndex]) {
        panes[macdPaneIndex].setHeight(130);
      }
    }

    // Allocate Strategy Equity Curve & Underwater Drawdown Sub-Pane (DEC-074)
    if (hasStrategySubPane && strategyResult) {
      const strategyPaneIndex = nextPaneIndex++;

      // 1. Underwater Drawdown Histogram (Independent Scale in Bottom Half of Sub-Pane)
      const ddSeries = chart.addSeries(
        HistogramSeries,
        {
          priceScaleId: "strategy_dd",
          title: "DD%",
          visible: showUnderwaterDrawdown,
          priceFormat: {
            type: "custom",
            formatter: (val: number) => `${val.toFixed(1)}%`,
          },
        },
        strategyPaneIndex
      );
      ddSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.52,
          bottom: 0.02,
        },
        visible: false,
      });

      // 2. Buy & Hold Benchmark Curve
      const bhSeries = chart.addSeries(
        LineSeries,
        {
          color: "rgba(245, 172, 55, 0.85)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceScaleId: "right",
          title: "Buy & Hold",
          visible: showBuyHoldBenchmark,
        },
        strategyPaneIndex
      );

      // 3. Strategy Equity Curve
      const isPositive = strategyResult.netProfit >= 0;
      const eqSeries = chart.addSeries(
        LineSeries,
        {
          color: isPositive ? "#00c087" : "#ff3b30",
          lineWidth: 2,
          priceScaleId: "right",
          title: "Equity",
        },
        strategyPaneIndex
      );

      eqSeries.createPriceLine({
        price: strategyResult.initialCapital,
        color: "rgba(141, 144, 162, 0.45)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `Base $${strategyResult.initialCapital.toLocaleString()}`,
      });

      strategyDrawdownSeriesRef.current = ddSeries;
      strategyBuyHoldSeriesRef.current = bhSeries;
      strategyEquitySeriesRef.current = eqSeries;

      const built = buildStrategyEquitySeriesData(
        strategyResult.equityCurve,
        barsRef.current,
        strategyResult.initialCapital
      );
      ddSeries.setData(built.underwaterDrawdownHistogram);
      bhSeries.setData(built.buyAndHoldLine);
      eqSeries.setData(built.equityLine);

      const panes = chart.panes();
      if (panes[strategyPaneIndex]) {
        panes[strategyPaneIndex].setHeight(140);
      }
    }
  }, [
    activeIndicators,
    hiddenIndicators,
    rsiPeriod,
    rsiOverbought,
    rsiOversold,
    macdFast,
    macdSlow,
    macdSignal,
    strategyResult,
    showStrategyPane,
    showBuyHoldBenchmark,
    showUnderwaterDrawdown,
    bars,
  ]);

  // Dynamic Custom Script Indicator Overlay Series
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (customIndicatorSeriesRef.current) {
      try {
        chart.removeSeries(customIndicatorSeriesRef.current);
      } catch {}
      customIndicatorSeriesRef.current = null;
    }

    if (customIndicatorData && customIndicatorData.data && customIndicatorData.data.length > 0) {
      try {
        const series = chart.addSeries(LineSeries, {
          color: customIndicatorData.color || "#00d8ff",
          lineWidth: 2,
          priceScaleId: "right",
          title: customIndicatorData.name,
          priceFormat: {
            type: "price",
            precision: pricePrecision.precision,
            minMove: pricePrecision.minMove,
          },
        });

        const formatted = customIndicatorData.data
          .filter((d) => d && d.time !== undefined && typeof d.value === "number" && !isNaN(d.value))
          .map((d) => ({
            time: (d.time > 1e11 ? Math.floor(d.time / 1000) : d.time) as Time,
            value: Number(d.value),
          }))
          .sort((a, b) => Number(a.time) - Number(b.time));

        const deduplicated: Array<{ time: Time; value: number }> = [];
        for (const pt of formatted) {
          if (deduplicated.length === 0 || deduplicated[deduplicated.length - 1].time !== pt.time) {
            deduplicated.push(pt);
          } else {
            deduplicated[deduplicated.length - 1].value = pt.value;
          }
        }

        if (deduplicated.length > 0) {
          series.setData(deduplicated);
          customIndicatorSeriesRef.current = series;
        }
      } catch (err) {
        console.error("Failed to render custom indicator series", err);
      }
    }
    setIsCustomIndicatorHidden(false);
  }, [customIndicatorData, pricePrecision]);

  // Synchronize custom indicator series visibility when toggled via HUD or Objects tab (DEC-095/DEC-096)
  useEffect(() => {
    if (customIndicatorSeriesRef.current) {
      try {
        const isCustomNamedHidden = customIndicatorData?.name
          ? hiddenIndicators.includes(customIndicatorData.name)
          : false;
        customIndicatorSeriesRef.current.applyOptions({
          visible: !isCustomIndicatorHidden && !isCustomNamedHidden,
        });
      } catch {}
    }
  }, [isCustomIndicatorHidden, hiddenIndicators, customIndicatorData]);

  // Synchronize dynamic price precision across series, price scales & crosshairs (DEC-097)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    try {
      chart.applyOptions({
        localization: {
          priceFormatter: pricePrecision.formatPrice,
        },
      });
    } catch {}

    const formatOpt = {
      priceFormat: {
        type: "price" as const,
        precision: pricePrecision.precision,
        minMove: pricePrecision.minMove,
      },
    };

    candleSeriesRef.current?.applyOptions(formatOpt);
    ema20SeriesRef.current?.applyOptions(formatOpt);
    ema50SeriesRef.current?.applyOptions(formatOpt);
    ema100SeriesRef.current?.applyOptions(formatOpt);
    ema200SeriesRef.current?.applyOptions(formatOpt);
    bbUpperSeriesRef.current?.applyOptions(formatOpt);
    bbMiddleSeriesRef.current?.applyOptions(formatOpt);
    bbLowerSeriesRef.current?.applyOptions(formatOpt);
    customIndicatorSeriesRef.current?.applyOptions(formatOpt);
  }, [pricePrecision]);

  // 6. Geometric Drawing Engine (DEC-040 to DEC-044)
  const DRAWING_COLORS = [
    "#2962ff",
    "#00c087",
    "#ff3b30",
    "#f5ac37",
    "#9353d3",
    "#00d8ff",
    "#ffffff",
  ];

  // Dynamic Bar Spacing & Extrapolation (DEC-045)
  const getBarSpacingPx = useCallback((): number => {
    if (chartRef.current) {
      try {
        const options = (chartRef.current.timeScale() as any).options?.();
        if (options && typeof options.barSpacing === "number" && options.barSpacing > 0) {
          return options.barSpacing;
        }
      } catch {}
    }
    if (barsRef.current.length >= 2) {
      const lastBar = barsRef.current[barsRef.current.length - 1];
      const prevBar = barsRef.current[barsRef.current.length - 2];
      const x1 = chartRef.current?.timeScale().timeToCoordinate(toUtcTimestamp(prevBar.time));
      const x2 = chartRef.current?.timeScale().timeToCoordinate(toUtcTimestamp(lastBar.time));
      if (x1 !== null && x2 !== null && Number(x2) > Number(x1)) {
        return Number(x2) - Number(x1);
      }
    }
    return 8;
  }, []);

  // Coordinate Projection Helpers (DEC-040 & DEC-045)
  const timeToCoordinate = useCallback(
    (timeMs: number): number | null => {
      if (!chartRef.current) return null;
      const utcSec = toUtcTimestamp(timeMs);
      const coord = chartRef.current.timeScale().timeToCoordinate(utcSec);
      if (coord !== null) return Number(coord);

      // Continuous extrapolation for future whitespace or past history (DEC-045)
      if (barsRef.current.length > 0) {
        const lastBar = barsRef.current[barsRef.current.length - 1];
        const lastX = chartRef.current.timeScale().timeToCoordinate(toUtcTimestamp(lastBar.time));
        const intervalMs = getResolutionMs(resolutionRef.current);
        const barSpacing = getBarSpacingPx();
        if (lastX !== null && barSpacing > 0 && intervalMs > 0) {
          return extrapolateTimeToCoordinate(timeMs, lastBar.time, Number(lastX), barSpacing, intervalMs);
        }
      }
      return null;
    },
    [getBarSpacingPx]
  );

  const coordinateToTime = useCallback(
    (x: number): number | null => {
      if (!chartRef.current) return null;
      const t = chartRef.current.timeScale().coordinateToTime(x);
      if (t !== null && typeof t === "number") {
        return t * 1000;
      }
      // Continuous extrapolation for future whitespace or past history (DEC-045)
      if (barsRef.current.length > 0) {
        const lastBar = barsRef.current[barsRef.current.length - 1];
        const lastX = chartRef.current.timeScale().timeToCoordinate(toUtcTimestamp(lastBar.time));
        const intervalMs = getResolutionMs(resolutionRef.current);
        const barSpacing = getBarSpacingPx();
        if (lastX !== null && barSpacing > 0 && intervalMs > 0) {
          return extrapolateCoordinateToTime(x, lastBar.time, Number(lastX), barSpacing, intervalMs);
        }
        return lastBar.time;
      }
      return null;
    },
    [getBarSpacingPx]
  );

  const priceToCoordinate = useCallback((price: number): number | null => {
    if (!candleSeriesRef.current) return null;
    const coord = candleSeriesRef.current.priceToCoordinate(price);
    return coord !== null ? Number(coord) : null;
  }, []);

  const coordinateToPrice = useCallback((y: number): number | null => {
    if (!candleSeriesRef.current) return null;
    const p = candleSeriesRef.current.coordinateToPrice(y);
    return p !== null ? Number(p) : null;
  }, []);

  const getSafeScreenX = useCallback(
    (timeMs: number): number | null => {
      return timeToCoordinate(timeMs);
    },
    [timeToCoordinate]
  );

  const getSafeScreenY = useCallback(
    (price: number): number | null => {
      const coord = priceToCoordinate(price);
      return coord !== null ? coord : null;
    },
    [priceToCoordinate]
  );

  // Notify header of current Undo/Redo stack availability (DEC-068)
  const notifyHistoryState = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("mochex:history-state", {
        detail: {
          canUndo: undoStackRef.current.length > 0,
          canRedo: redoStackRef.current.length > 0,
        },
      })
    );
  }, []);

  const commitHistoryBaseline = useCallback(
    (baseline: ChartDrawing[], next: ChartDrawing[]) => {
      const updated = pushDrawingHistory(
        {
          undoStack: undoStackRef.current,
          redoStack: redoStackRef.current,
          current: baseline,
        },
        next,
        50
      );
      undoStackRef.current = updated.undoStack;
      redoStackRef.current = updated.redoStack;
      notifyHistoryState();
    },
    [notifyHistoryState]
  );

  // Symbol-Scoped Persistence (DEC-044, DEC-068)
  useEffect(() => {
    if (!symbol) return;
    const storageKey = `mochex:drawings:${symbol}`;
    let loaded: ChartDrawing[] = [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out any legacy script-generated boxes (DEC-095)
          loaded = parsed.filter(
            (d: any) =>
              !(
                typeof d.id === "string" &&
                (d.id.startsWith("box_") || d.id.startsWith("custom-box-")) &&
                (d.name?.includes("Zone") || d.name?.includes("Script Box") || d.name?.includes("Order Block"))
              )
          );
          if (loaded.length !== parsed.length) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(loaded));
            } catch {}
          }
        }
      }
    } catch {}
    drawingsRef.current = loaded;
    undoStackRef.current = [];
    redoStackRef.current = [];
    preDragDrawingsRef.current = null;
    preModalDrawingsRef.current = null;
    setDrawings(loaded);
    setSelectedDrawingId(null);
    setInFlightDrawing(null);
    setDrawingStep(0);
    notifyHistoryState();
  }, [symbol, notifyHistoryState]);

  const saveDrawings = useCallback(
    (newDrawings: ChartDrawing[]) => {
      if (!draggedHandleRef.current && !isSettingsModalOpenRef.current) {
        commitHistoryBaseline(drawingsRef.current, newDrawings);
      }
      drawingsRef.current = newDrawings;
      setDrawings(newDrawings);
      if (!symbolRef.current) return;
      try {
        localStorage.setItem(`mochex:drawings:${symbolRef.current}`, JSON.stringify(newDrawings));
      } catch {}
    },
    [commitHistoryBaseline]
  );

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const nextState = performDrawingUndo({
      undoStack: undoStackRef.current,
      redoStack: redoStackRef.current,
      current: drawingsRef.current,
    });
    undoStackRef.current = nextState.undoStack;
    redoStackRef.current = nextState.redoStack;
    drawingsRef.current = nextState.current;
    setDrawings(nextState.current);
    setSelectedDrawingId((prev) =>
      prev && nextState.current.some((d) => d.id === prev) ? prev : null
    );
    if (symbolRef.current) {
      try {
        localStorage.setItem(
          `mochex:drawings:${symbolRef.current}`,
          JSON.stringify(nextState.current)
        );
      } catch {}
    }
    notifyHistoryState();
  }, [notifyHistoryState]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const nextState = performDrawingRedo({
      undoStack: undoStackRef.current,
      redoStack: redoStackRef.current,
      current: drawingsRef.current,
    });
    undoStackRef.current = nextState.undoStack;
    redoStackRef.current = nextState.redoStack;
    drawingsRef.current = nextState.current;
    setDrawings(nextState.current);
    if (symbolRef.current) {
      try {
        localStorage.setItem(
          `mochex:drawings:${symbolRef.current}`,
          JSON.stringify(nextState.current)
        );
      } catch {}
    }
    notifyHistoryState();
  }, [notifyHistoryState]);

  useEffect(() => {
    isSettingsModalOpenRef.current = isSettingsModalOpen;
    if (isSettingsModalOpen) {
      preModalDrawingsRef.current = drawingsRef.current;
    } else if (preModalDrawingsRef.current !== null) {
      commitHistoryBaseline(preModalDrawingsRef.current, drawingsRef.current);
      preModalDrawingsRef.current = null;
    }
  }, [isSettingsModalOpen, commitHistoryBaseline]);

  const [activeAlerts, setActiveAlerts] = useState<PriceAlert[]>([]);
  const [paperAccount, setPaperAccount] = useState<PaperAccountState>(() =>
    createInitialPaperAccount(100000)
  );

  useEffect(() => {
    const loadAlerts = () => {
      try {
        const raw = localStorage.getItem("mochex:price_alerts");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setActiveAlerts(parsed);
        } else {
          setActiveAlerts([]);
        }
      } catch {}
    };
    const loadPaperAccount = () => {
      try {
        const raw = localStorage.getItem("mochex:paper_account");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.balance === "number") {
            setPaperAccount(parsed);
          }
        }
      } catch {}
    };
    loadAlerts();
    loadPaperAccount();
    window.addEventListener("mochex:alerts-updated", loadAlerts);
    window.addEventListener("mochex:paper-trading-updated", loadPaperAccount);
    return () => {
      window.removeEventListener("mochex:alerts-updated", loadAlerts);
      window.removeEventListener("mochex:paper-trading-updated", loadPaperAccount);
    };
  }, []);

  // Broadcast drawings state to Object Tree whenever drawings or selection changes (DEC-070)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("mochex:drawings-sync", {
        detail: {
          symbol,
          drawings,
          selectedDrawingId,
        },
      })
    );
  }, [symbol, drawings, selectedDrawingId]);

  useEffect(() => {
    const handleRequestSync = () => {
      window.dispatchEvent(
        new CustomEvent("mochex:drawings-sync", {
          detail: {
            symbol: symbolRef.current,
            drawings: drawingsRef.current,
            selectedDrawingId,
          },
        })
      );
    };

    const handleObjectTreeAction = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          action:
            | "select"
            | "toggle_hide"
            | "toggle_lock"
            | "clone"
            | "reorder"
            | "rename"
            | "open_settings"
            | "delete";
          drawingId: string;
          direction?: "forward" | "backward";
          name?: string;
        }>
      ).detail;
      if (!detail || !detail.drawingId) return;

      const currentList = drawingsRef.current;
      const target = currentList.find((d) => d.id === detail.drawingId);

      if (detail.action === "select") {
        setSelectedDrawingId(detail.drawingId);
      } else if (detail.action === "toggle_hide" && target) {
        const nextHidden = !target.isHidden;
        saveDrawings(
          currentList.map((d) =>
            d.id === detail.drawingId ? { ...d, isHidden: nextHidden } : d
          )
        );
        if (nextHidden && selectedDrawingId === detail.drawingId) {
          setSelectedDrawingId(null);
        }
      } else if (detail.action === "toggle_lock" && target) {
        saveDrawings(
          currentList.map((d) =>
            d.id === detail.drawingId ? { ...d, isLocked: !d.isLocked } : d
          )
        );
      } else if (detail.action === "clone" && target) {
        const cloned = cloneDrawingObject(
          target,
          getResolutionMs(resolution) * 3
        );
        saveDrawings([...currentList, cloned]);
        setSelectedDrawingId(cloned.id);
      } else if (detail.action === "reorder" && detail.direction) {
        const reordered = reorderDrawingLayer(
          currentList,
          detail.drawingId,
          detail.direction
        );
        saveDrawings(reordered);
      } else if (detail.action === "rename" && target) {
        saveDrawings(
          currentList.map((d) =>
            d.id === detail.drawingId ? { ...d, name: detail.name } : d
          )
        );
      } else if (detail.action === "open_settings" && target) {
        setSelectedDrawingId(detail.drawingId);
        setIsSettingsModalOpen(true);
      } else if (detail.action === "delete" && target && !target.isLocked) {
        saveDrawings(currentList.filter((d) => d.id !== detail.drawingId));
        if (selectedDrawingId === detail.drawingId) {
          setSelectedDrawingId(null);
        }
      }
    };

    window.addEventListener("mochex:request-drawings-sync", handleRequestSync);
    window.addEventListener("mochex:object-tree-action", handleObjectTreeAction);
    return () => {
      window.removeEventListener("mochex:request-drawings-sync", handleRequestSync);
      window.removeEventListener("mochex:object-tree-action", handleObjectTreeAction);
    };
  }, [resolution, selectedDrawingId, saveDrawings]);

  useEffect(() => {
    window.addEventListener("mochex:undo", handleUndo);
    window.addEventListener("mochex:redo", handleRedo);
    return () => {
      window.removeEventListener("mochex:undo", handleUndo);
      window.removeEventListener("mochex:redo", handleRedo);
    };
  }, [handleUndo, handleRedo]);

  // Specialized Geometric Renderers (DEC-041, DEC-046, DEC-047)
  const renderTrendline = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      drawing: ChartDrawing,
      canvasWidth: number
    ) => {
      const color = drawing.color || "#2962ff";
      const lw = drawing.lineWidth || 2;
      const style = drawing.lineStyle || "solid";

      let startX = x1;
      let startY = y1;
      let endX = x2;
      let endY = y2;

      // Extend lines if configured (DEC-045)
      const dx = x2 - x1;
      const dy = y2 - y1;
      if (Math.abs(dx) > 0.001) {
        const slope = dy / dx;
        if (drawing.extendRight) {
          endX = canvasWidth;
          endY = y1 + slope * (canvasWidth - x1);
        }
        if (drawing.extendLeft) {
          startX = 0;
          startY = y1 - slope * x1;
        }
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      if (style === "dashed") ctx.setLineDash([4, 4]);
      else if (style === "dotted") ctx.setLineDash([2, 2]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Optional text note
      if (drawing.text) {
        ctx.font = `${drawing.fontSize || 11}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(drawing.text, x1 + 6, y1 - 6);
      }

      // Metrics badge if enabled
      if (drawing.showMetrics === true) {
        const deltaPrice = drawing.endPrice - drawing.startPrice;
        const deltaPercent =
          drawing.startPrice > 0 ? ((deltaPrice / drawing.startPrice) * 100).toFixed(2) : "0.00";
        const minTime = Math.min(drawing.startTime, drawing.endTime);
        const maxTime = Math.max(drawing.startTime, drawing.endTime);
        const barCount = Math.max(
          1,
          barsRef.current.filter((b) => b.time >= minTime && b.time <= maxTime).length
        );
        const badgeText = `${deltaPrice >= 0 ? "+" : ""}${deltaPrice.toFixed(2)} (${deltaPrice >= 0 ? "+" : ""}${deltaPercent}%) · ${barCount}b`;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        ctx.font = "10px monospace";
        const textWidth = ctx.measureText(badgeText).width;
        const padX = 6;
        const padY = 3;

        ctx.fillStyle = "rgba(10, 20, 31, 0.85)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(midX - textWidth / 2 - padX, midY - 9 - padY, textWidth + padX * 2, 16 + padY * 2, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = deltaPrice >= 0 ? "#00c087" : "#ff3b30";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, midX, midY);
      }
    },
    []
  );

  const renderRectangle = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      drawing: ChartDrawing,
      canvasWidth: number
    ) => {
      const leftX = Math.min(x1, x2);
      const rightX = drawing.extendRight ? canvasWidth : Math.max(x1, x2);
      const topY = Math.min(y1, y2);
      const bottomY = Math.max(y1, y2);
      const width = rightX - leftX;
      const height = bottomY - topY;

      const color = drawing.color || "#2962ff";
      const fillCol = drawing.fillColor || color;
      const fillOp = drawing.fillOpacity !== undefined ? drawing.fillOpacity : 0.15;
      const lw = drawing.lineWidth || 2;
      const style = drawing.lineStyle || "solid";

      // Fill
      ctx.save();
      ctx.fillStyle = fillCol;
      ctx.globalAlpha = fillOp;
      ctx.fillRect(leftX, topY, width, height);
      ctx.restore();

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      if (style === "dashed") ctx.setLineDash([4, 4]);
      else if (style === "dotted") ctx.setLineDash([2, 2]);
      else ctx.setLineDash([]);
      ctx.strokeRect(leftX, topY, width, height);
      ctx.setLineDash([]);

      // Optional 50% Equilibrium Line (DEC-060)
      if (drawing.showMidLine) {
        const midY = (topY + bottomY) / 2;
        const midColor = drawing.midLineColor || color;
        const midStyle = drawing.midLineStyle || "dashed";
        ctx.save();
        ctx.strokeStyle = midColor;
        ctx.lineWidth = lw;
        if (midStyle === "dashed") ctx.setLineDash([4, 4]);
        else if (midStyle === "dotted") ctx.setLineDash([2, 2]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(leftX, midY);
        ctx.lineTo(rightX, midY);
        ctx.stroke();
        ctx.restore();
      }

      // Optional text note with 9-position alignment (DEC-061)
      if (drawing.text) {
        ctx.save();
        ctx.font = `${drawing.fontSize || 11}px monospace`;
        ctx.fillStyle = color;

        const hAlign = drawing.textAlign || "left";
        const vAlign = drawing.textVAlign || "top";

        let tx = leftX + 8;
        if (hAlign === "center") {
          tx = leftX + width / 2;
          ctx.textAlign = "center";
        } else if (hAlign === "right") {
          tx = rightX - 8;
          ctx.textAlign = "right";
        } else {
          ctx.textAlign = "left";
        }

        let ty = topY + 8;
        if (vAlign === "middle") {
          ty = topY + height / 2;
          ctx.textBaseline = "middle";
        } else if (vAlign === "bottom") {
          ty = bottomY - 8;
          ctx.textBaseline = "bottom";
        } else {
          ctx.textBaseline = "top";
        }

        ctx.fillText(drawing.text, tx, ty);
        ctx.restore();
      }
    },
    []
  );

  const renderHorizontalLine = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      y: number,
      drawing: ChartDrawing,
      canvasWidth: number
    ) => {
      const color = drawing.color || "#2962ff";
      const lw = drawing.lineWidth || 2;
      const style = drawing.lineStyle || "solid";

      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      if (style === "dashed") ctx.setLineDash([4, 4]);
      else if (style === "dotted") ctx.setLineDash([2, 2]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Scale price badge on right margin (TradingView style)
      const badgeText = `$${pricePrecision.formatPrice(drawing.startPrice)}`;
      ctx.font = "10px monospace";
      const textW = ctx.measureText(badgeText).width;
      ctx.fillStyle = color;
      ctx.fillRect(canvasWidth - textW - 12, y - 9, textW + 12, 18);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, canvasWidth - (textW + 12) / 2, y);

      if (drawing.text) {
        ctx.font = `${drawing.fontSize || 11}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(drawing.text, 12, y - 4);
      }
    },
    []
  );

  const renderVerticalLine = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      drawing: ChartDrawing,
      canvasHeight: number
    ) => {
      const color = drawing.color || "#2962ff";
      const lw = drawing.lineWidth || 2;
      const style = drawing.lineStyle || "solid";

      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      if (style === "dashed") ctx.setLineDash([4, 4]);
      else if (style === "dotted") ctx.setLineDash([2, 2]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Scale date/time badge on bottom margin (TradingView style)
      const dStr = new Date(drawing.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      ctx.font = "10px monospace";
      const textW = ctx.measureText(dStr).width;
      ctx.fillStyle = color;
      ctx.fillRect(x - (textW + 10) / 2, canvasHeight - 20, textW + 10, 18);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(dStr, x, canvasHeight - 11);

      if (drawing.text) {
        ctx.font = `${drawing.fontSize || 11}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(drawing.text, x + 4, 12);
      }
    },
    []
  );

  const renderPositionBox = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      drawing: ChartDrawing,
      isLong: boolean
    ) => {
      const targetPrice =
        drawing.targetPrice !== undefined
          ? drawing.targetPrice
          : isLong
          ? drawing.startPrice * 1.02
          : drawing.startPrice * 0.98;
      const stopPrice =
        drawing.stopPrice !== undefined
          ? drawing.stopPrice
          : isLong
          ? drawing.startPrice * 0.99
          : drawing.startPrice * 1.01;

      const metrics = calculatePositionMetrics(
        drawing.startPrice,
        targetPrice,
        stopPrice,
        isLong,
        drawing.accountSize || 10000,
        drawing.riskPercent || 1.0,
        drawing.riskAmount
      );
      const yEntry = getSafeScreenY(metrics.entryPrice);
      const yTarget = getSafeScreenY(metrics.targetPrice);
      const yStop = getSafeScreenY(metrics.stopPrice);

      if (yEntry === null || yTarget === null || yStop === null) return;

      const leftX = Math.min(x1, x2);
      const boxWidth = Math.max(80, Math.abs(x2 - x1));
      const rightX = leftX + boxWidth;

      const profitColor = drawing.profitColor || "#089981";
      const profitOpacity = (drawing.profitOpacity !== undefined ? drawing.profitOpacity : 20) / 100;
      const stopColor = drawing.stopColor || "#f23636";
      const stopOpacity = (drawing.stopOpacity !== undefined ? drawing.stopOpacity : 20) / 100;
      const showLabels = drawing.showLabels !== false;

      // Helper to convert hex to rgba
      const toRgba = (hexOrRgba: string, alpha: number) => {
        if (hexOrRgba.startsWith("rgba")) return hexOrRgba;
        let c = hexOrRgba.replace("#", "");
        if (c.length === 3) c = c.split("").map((x) => x + x).join("");
        const num = parseInt(c, 16);
        if (isNaN(num)) return `rgba(8, 153, 129, ${alpha})`;
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
      };

      // 1. Profit Zone
      const profitTop = Math.min(yEntry, yTarget);
      const profitHeight = Math.abs(yTarget - yEntry);
      ctx.fillStyle = toRgba(profitColor, profitOpacity);
      ctx.fillRect(leftX, profitTop, boxWidth, profitHeight);
      ctx.strokeStyle = profitColor;
      ctx.lineWidth = drawing.lineWidth || 1.5;
      ctx.strokeRect(leftX, profitTop, boxWidth, profitHeight);

      // 2. Stop Loss Zone
      const stopTop = Math.min(yEntry, yStop);
      const stopHeight = Math.abs(yStop - yEntry);
      ctx.fillStyle = toRgba(stopColor, stopOpacity);
      ctx.fillRect(leftX, stopTop, boxWidth, stopHeight);
      ctx.strokeStyle = stopColor;
      ctx.lineWidth = drawing.lineWidth || 1.5;
      ctx.strokeRect(leftX, stopTop, boxWidth, stopHeight);

      // 3. Entry Boundary Line
      ctx.strokeStyle = drawing.color || "#ffffff";
      ctx.lineWidth = drawing.lineWidth || 1.5;
      ctx.beginPath();
      ctx.moveTo(leftX, yEntry);
      ctx.lineTo(rightX, yEntry);
      ctx.stroke();

      if (showLabels) {
        // 4. Centered Floating TP Card (inside Profit zone)
        if (profitHeight >= 28 && boxWidth >= 90) {
          const cardW = Math.min(boxWidth - 12, 190);
          const cardH = 34;
          const cardX = leftX + (boxWidth - cardW) / 2;
          const cardY = profitTop + Math.max(4, (profitHeight - cardH) / 2);

          ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
          ctx.strokeStyle = profitColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, cardW, cardH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Line 1: Target pts & %
          ctx.font = "bold 10px monospace";
          ctx.fillStyle = profitColor;
          ctx.fillText(
            `Target: +${metrics.targetDiff.toFixed(2)} (+${Math.abs(metrics.targetPercent).toFixed(2)}%)`,
            cardX + cardW / 2,
            cardY + 10
          );

          // Line 2: TP price & estimated profit
          ctx.font = "9px monospace";
          ctx.fillStyle = "#cbd5e1";
          ctx.fillText(
            `TP: $${metrics.targetPrice.toFixed(2)} | Profit: +$${metrics.estimatedProfit.toFixed(2)}`,
            cardX + cardW / 2,
            cardY + 23
          );
        }

        // 5. Centered Floating SL Card (inside Stop Loss zone)
        if (stopHeight >= 28 && boxWidth >= 90) {
          const cardW = Math.min(boxWidth - 12, 190);
          const cardH = 34;
          const cardX = leftX + (boxWidth - cardW) / 2;
          const cardY = stopTop + Math.max(4, (stopHeight - cardH) / 2);

          ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
          ctx.strokeStyle = stopColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, cardW, cardH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Line 1: Stop pts & %
          ctx.font = "bold 10px monospace";
          ctx.fillStyle = stopColor;
          ctx.fillText(
            `Stop: -${metrics.stopDiff.toFixed(2)} (-${Math.abs(metrics.stopPercent).toFixed(2)}%)`,
            cardX + cardW / 2,
            cardY + 10
          );

          // Line 2: SL price & estimated loss
          ctx.font = "9px monospace";
          ctx.fillStyle = "#cbd5e1";
          ctx.fillText(
            `SL: $${metrics.stopPrice.toFixed(2)} | Loss: -$${metrics.estimatedLoss.toFixed(2)}`,
            cardX + cardW / 2,
            cardY + 23
          );
        }

        // 6. Centered Entry Line Badge
        const entryText = `Entry: $${metrics.entryPrice.toFixed(2)} | R:R ${metrics.riskRewardRatio.toFixed(2)}`;
        ctx.font = "bold 9px monospace";
        const entryBadgeW = Math.min(boxWidth - 8, ctx.measureText(entryText).width + 12);
        const entryBadgeH = 18;
        const entryBadgeX = leftX + (boxWidth - entryBadgeW) / 2;
        const entryBadgeY = yEntry - entryBadgeH / 2;

        ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(entryBadgeX, entryBadgeY, entryBadgeW, entryBadgeH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(entryText, leftX + boxWidth / 2, yEntry);

        // 7. Right-Edge Price Level Tags (projecting from rightX)
        const renderRightTag = (y: number, text: string, bgColor: string) => {
          ctx.font = "bold 9px monospace";
          const tw = ctx.measureText(text).width;
          const tagW = tw + 8;
          const tagH = 16;
          const tagX = rightX + 2;
          const tagY = y - tagH / 2;

          ctx.fillStyle = bgColor;
          ctx.beginPath();
          ctx.roundRect(tagX, tagY, tagW, tagH, [0, 3, 3, 0]);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(text, tagX + 4, y);
        };

        renderRightTag(yTarget, `TP: $${pricePrecision.formatPrice(metrics.targetPrice)}`, profitColor);
        renderRightTag(yEntry, `Entry: $${pricePrecision.formatPrice(metrics.entryPrice)}`, "#2962ff");
        renderRightTag(yStop, `SL: $${pricePrecision.formatPrice(metrics.stopPrice)}`, stopColor);
      }
    },
    [getSafeScreenY]
  );

  const renderDateRange = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      x2: number,
      drawing: ChartDrawing,
      canvasHeight: number
    ) => {
      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2);
      const width = rightX - leftX;

      const metrics = calculateDateRangeMetrics(
        drawing.startTime,
        drawing.endTime,
        barsRef.current
      );

      // Translucent highlighted band
      ctx.fillStyle = drawing.fillColor || "rgba(41, 98, 255, 0.08)";
      ctx.fillRect(leftX, 0, width, canvasHeight);

      ctx.strokeStyle = drawing.color || "#2962ff";
      ctx.lineWidth = drawing.lineWidth || 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(leftX, 0);
      ctx.lineTo(leftX, canvasHeight);
      ctx.moveTo(rightX, 0);
      ctx.lineTo(rightX, canvasHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Telemetry badge
      const badgeText = `${metrics.barCount} bars · ${metrics.formattedDuration}`;
      ctx.font = "10px monospace";
      const textW = ctx.measureText(badgeText).width + 16;
      const midX = leftX + width / 2;
      const midY = canvasHeight / 2;

      ctx.fillStyle = "rgba(10, 20, 31, 0.9)";
      ctx.strokeStyle = drawing.color || "#2962ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(midX - textW / 2, midY - 11, textW, 22, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#00d8ff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, midX, midY);
    },
    []
  );

const renderFixedRangeVolumeProfile = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      x2: number,
      drawing: ChartDrawing,
      canvasWidth: number,
      canvasHeight: number
    ) => {
      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2);
      const boxWidth = Math.max(24, rightX - leftX);

      const rows = drawing.frvpRows || 24;
      const vaPct = (drawing.frvpValueAreaPct || 70) / 100;
      const placement = drawing.frvpPlacement || "left";
      const widthPct = (drawing.frvpWidthPct || 68) / 100;
      const pocColor = drawing.frvpPocColor || "#ff5252";
      const vaColor = drawing.frvpVaColor || "#2962ff";
      const borderColor = drawing.color || "#2962ff";

      const frvp = calculateFixedRangeVolumeProfile(
        barsRef.current,
        drawing.startTime,
        drawing.endTime,
        rows,
        vaPct
      );

      if (!frvp || frvp.maxBucketVolume <= 0) {
        ctx.save();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(leftX, 0);
        ctx.lineTo(leftX, canvasHeight);
        ctx.moveTo(rightX, 0);
        ctx.lineTo(rightX, canvasHeight);
        ctx.stroke();
        ctx.restore();
        return;
      }

      const yMaxHigh = getSafeScreenY(frvp.maxHigh);
      const yMinLow = getSafeScreenY(frvp.minLow);
      const topY = yMaxHigh !== null && yMinLow !== null ? Math.min(yMaxHigh, yMinLow) : 20;
      const bottomY = yMaxHigh !== null && yMinLow !== null ? Math.max(yMaxHigh, yMinLow) : canvasHeight - 40;
      const rangeHeight = Math.max(12, bottomY - topY);

      ctx.save();

      // 1. Background Box & Value Area Shading
      if (drawing.showBackground !== false) {
        ctx.fillStyle = "rgba(41, 98, 255, 0.04)";
        ctx.fillRect(leftX, topY, rightX - leftX, rangeHeight);

        const yVah = getSafeScreenY(frvp.vahPrice);
        const yVal = getSafeScreenY(frvp.valPrice);
        if (yVah !== null && yVal !== null) {
          const vaTop = Math.min(yVah, yVal);
          const vaHeight = Math.abs(yVal - yVah);
          ctx.fillStyle = "rgba(41, 98, 255, 0.09)";
          ctx.fillRect(leftX, vaTop, rightX - leftX, vaHeight);
        }
      }

      // 2. Left & Right Vertical Boundary Lines (TradingView FRVP anchors)
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = drawing.lineWidth || 1.5;
      ctx.beginPath();
      ctx.moveTo(leftX, topY);
      ctx.lineTo(leftX, bottomY);
      ctx.moveTo(rightX, topY);
      ctx.lineTo(rightX, bottomY);
      ctx.stroke();

      ctx.save();
      ctx.strokeStyle = "rgba(41, 98, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(leftX, topY);
      ctx.lineTo(rightX, topY);
      ctx.moveTo(leftX, bottomY);
      ctx.lineTo(rightX, bottomY);
      ctx.stroke();
      ctx.restore();

      // 3. Horizontal Volume Histogram Buckets (Buy + Sell split)
      const maxBarWidth = boxWidth * widthPct;
      for (const bucket of frvp.buckets) {
        const yTop = getSafeScreenY(bucket.priceHigh);
        const yBot = getSafeScreenY(bucket.priceLow);
        if (yTop === null || yBot === null) continue;

        const bTop = Math.min(yTop, yBot);
        const bHeight = Math.max(1.5, Math.abs(yBot - yTop) - 0.8);
        const totalW = (bucket.totalVolume / frvp.maxBucketVolume) * maxBarWidth;
        const buyW =
          bucket.totalVolume > 0
            ? (bucket.buyVolume / bucket.totalVolume) * totalW
            : 0;
        const sellW = Math.max(0, totalW - buyW);

        const alpha = bucket.isPoc ? 0.68 : bucket.isValueArea ? 0.46 : 0.18;

        if (placement === "right") {
          ctx.fillStyle = `rgba(255, 59, 48, ${alpha})`;
          ctx.fillRect(rightX - sellW, bTop, sellW, bHeight);
          ctx.fillStyle = `rgba(0, 192, 135, ${alpha})`;
          ctx.fillRect(rightX - sellW - buyW, bTop, buyW, bHeight);
          if (bucket.isPoc) {
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = 1;
            ctx.strokeRect(rightX - totalW, bTop, totalW, bHeight);
          }
        } else {
          ctx.fillStyle = `rgba(0, 192, 135, ${alpha})`;
          ctx.fillRect(leftX, bTop, buyW, bHeight);
          ctx.fillStyle = `rgba(255, 59, 48, ${alpha})`;
          ctx.fillRect(leftX + buyW, bTop, sellW, bHeight);
          if (bucket.isPoc) {
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = 1;
            ctx.strokeRect(leftX, bTop, totalW, bHeight);
          }
        }
      }

      // 4. VAH, VAL, and POC Horizontal Lines & Price Badges
      const lineEndX = drawing.extendRight ? canvasWidth : rightX;
      const drawFrvpLevel = (
        price: number,
        label: string,
        color: string,
        dashed: boolean,
        lw: number
      ) => {
        const y = getSafeScreenY(price);
        if (y === null || y < 0 || y > canvasHeight) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        if (dashed) ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(leftX, y);
        ctx.lineTo(lineEndX, y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (drawing.showLabels !== false) {
          const fmt = pricePrecision.formatPrice(price);
          const tagText = `${label} ${fmt}`;
          ctx.font = "bold 9px monospace";
          const tw = ctx.measureText(tagText).width + 8;
          const tx = Math.min(canvasWidth - tw - 70, rightX + 4);
          ctx.fillStyle = "rgba(10, 20, 31, 0.92)";
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(tx, y - 8, tw, 16, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(tagText, tx + 4, y + 0.5);
        }
        ctx.restore();
      };

      drawFrvpLevel(frvp.vahPrice, "VAH", vaColor, true, 1.2);
      drawFrvpLevel(frvp.valPrice, "VAL", vaColor, true, 1.2);
      drawFrvpLevel(frvp.pocPrice, "POC", pocColor, false, 1.85);

      // 5. Anchor Circles on Left & Right Vertical Boundaries (TradingView style)
      const anchorPts = [
        { x: leftX, y: topY },
        { x: leftX, y: bottomY },
        { x: rightX, y: topY },
        { x: rightX, y: bottomY },
      ];
      anchorPts.forEach((pt) => {
        ctx.fillStyle = "#0a141f";
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      ctx.restore();
    },
    [getSafeScreenY, pricePrecision]
  );

  const renderCircle = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      drawing: ChartDrawing
    ) => {
      const radius = Math.hypot(x2 - x1, y2 - y1);
      const color = drawing.color || "#2962ff";
      const fillCol = drawing.fillColor || color;
      const fillOp = drawing.fillOpacity !== undefined ? drawing.fillOpacity : 0.15;
      const lw = drawing.lineWidth || 2;
      const style = drawing.lineStyle || "solid";

      ctx.save();
      ctx.fillStyle = fillCol;
      ctx.globalAlpha = fillOp;
      ctx.beginPath();
      ctx.arc(x1, y1, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      if (style === "dashed") ctx.setLineDash([4, 4]);
      else if (style === "dotted") ctx.setLineDash([2, 2]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(x1, y1, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (drawing.text) {
        ctx.font = `${drawing.fontSize || 11}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(drawing.text, x1, y1);
      }
    },
    []
  );

  const renderTrendFib = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      points: Array<{ time: number; price: number }>,
      drawing: ChartDrawing,
      canvasWidth: number
    ) => {
      if (points.length < 3) return;
      const [p1, p2, p3] = points;
      const x1 = getSafeScreenX(p1.time);
      const y1 = getSafeScreenY(p1.price);
      const x2 = getSafeScreenX(p2.time);
      const y2 = getSafeScreenY(p2.price);
      const x3 = getSafeScreenX(p3.time);
      const y3 = getSafeScreenY(p3.price);

      if (x1 === null || y1 === null || x2 === null || y2 === null || x3 === null || y3 === null) return;

      // Wave 1 and Wave 2 connecting lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.stroke();
      ctx.setLineDash([]);

      // Extension levels projected from P3
      const extLevels = calculateTrendFibLevels(p1.price, p2.price, p3.price, drawing.fibLevels);
      const rightX = drawing.extendRight ? canvasWidth : Math.max(x3 + 120, canvasWidth * 0.9);

      extLevels.forEach((lvl) => {
        const y = getSafeScreenY(lvl.price);
        if (y === null) return;

        ctx.strokeStyle = lvl.color;
        ctx.lineWidth = lvl.ratio === 1.0 || lvl.ratio === 1.618 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x3, y);
        ctx.lineTo(rightX, y);
        ctx.stroke();

        const label = `${lvl.ratio} ($${pricePrecision.formatPrice(lvl.price)})`;
        ctx.font = "10px monospace";
        ctx.fillStyle = lvl.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, x3 + 4, y - 2);
      });
    },
    [getSafeScreenX, getSafeScreenY]
  );

  const renderGannBox = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      drawing: ChartDrawing
    ) => {
      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2);
      const topY = Math.min(y1, y2);
      const bottomY = Math.max(y1, y2);
      const w = rightX - leftX;
      const h = bottomY - topY;

      const { priceLevels, timeLevels } = calculateGannBoxLevels(
        drawing.startPrice,
        drawing.endPrice,
        drawing.startTime,
        drawing.endTime,
        drawing.gannPriceLevels,
        drawing.gannTimeLevels
      );

      ctx.fillStyle = "rgba(41, 98, 255, 0.05)";
      ctx.fillRect(leftX, topY, w, h);

      ctx.strokeStyle = drawing.color || "#2962ff";
      ctx.lineWidth = drawing.lineWidth || 1.5;
      ctx.strokeRect(leftX, topY, w, h);

      priceLevels.forEach((lvl) => {
        const y = getSafeScreenY(lvl.price);
        if (y === null) return;
        ctx.strokeStyle = lvl.color || (lvl.ratio === 0.5 ? "rgba(0, 216, 255, 0.6)" : "rgba(255, 255, 255, 0.15)");
        ctx.lineWidth = lvl.ratio === 0.5 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(leftX, y);
        ctx.lineTo(rightX, y);
        ctx.stroke();
      });

      timeLevels.forEach((lvl) => {
        const x = getSafeScreenX(lvl.time);
        if (x === null) return;
        ctx.strokeStyle = lvl.color || (lvl.ratio === 0.5 ? "rgba(0, 216, 255, 0.6)" : "rgba(255, 255, 255, 0.15)");
        ctx.lineWidth = lvl.ratio === 0.5 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.stroke();
      });

      // Diagonal angle rays (DEC-059)
      if (drawing.showGannAngles !== false) {
        ctx.strokeStyle = drawing.gannAnglesColor || "rgba(245, 172, 55, 0.6)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(leftX, topY);
        ctx.lineTo(rightX, bottomY);
        ctx.moveTo(leftX, bottomY);
        ctx.lineTo(rightX, topY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    [getSafeScreenX, getSafeScreenY]
  );

  const renderPath = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      points: Array<{ x: number; y: number }>,
      drawing: ChartDrawing,
      isSelected: boolean
    ) => {
      if (points.length < 2) return;
      const color = drawing.color || "#2962ff";
      const lw = drawing.lineWidth || 2;
      const style = drawing.lineStyle || "solid";

      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      if (style === "dashed") ctx.setLineDash([4, 4]);
      else if (style === "dotted") ctx.setLineDash([2, 2]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Node handles
      points.forEach((p) => {
        ctx.fillStyle = isSelected ? "#ffffff" : color;
        ctx.strokeStyle = isSelected ? color : "#ffffff";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isSelected ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      if (drawing.text && points.length > 0) {
        ctx.font = `${drawing.fontSize || 11}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(drawing.text, points[0].x + 6, points[0].y - 6);
      }
    },
    []
  );

  const renderFibonacci = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      drawing: ChartDrawing,
      canvasWidth: number
    ) => {
      const levels = calculateFibLevels(drawing.startPrice, drawing.endPrice, drawing.fibLevels);
      const leftX = drawing.extendLeft ? 0 : Math.min(x1, x2);
      const rightX = drawing.extendRight ? canvasWidth : Math.max(x1, x2) + 60;

      if (drawing.showBackground !== false) {
        const bgOpacity = drawing.fillOpacity !== undefined ? drawing.fillOpacity : 0.08;
        for (let i = 0; i < levels.length - 1; i++) {
          const lvlA = levels[i];
          const lvlB = levels[i + 1];
          const yA = getSafeScreenY(lvlA.price);
          const yB = getSafeScreenY(lvlB.price);
          if (yA !== null && yB !== null) {
            ctx.save();
            ctx.globalAlpha = bgOpacity;
            ctx.fillStyle = lvlB.bg || "rgba(41, 98, 255, 0.08)";
            ctx.fillRect(leftX, Math.min(yA, yB), rightX - leftX, Math.abs(yB - yA));
            ctx.restore();
          }
        }
      }

      levels.forEach((lvl) => {
        const y = getSafeScreenY(lvl.price);
        if (y === null) return;

        ctx.strokeStyle = lvl.color;
        ctx.lineWidth = lvl.ratio === 0 || lvl.ratio === 1 || lvl.ratio === 0.618 ? 1.5 : 1;
        if (lvl.ratio !== 0 && lvl.ratio !== 1 && lvl.ratio !== 0.618) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(leftX, y);
        ctx.lineTo(rightX, y);
        ctx.stroke();
        ctx.setLineDash([]);

        const label = `${lvl.ratio} ($${pricePrecision.formatPrice(lvl.price)})`;
        ctx.font = "10px monospace";
        ctx.fillStyle = lvl.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, leftX + 4, y - 2);
      });
    },
    [getSafeScreenY]
  );

  const renderRuler = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      startPrice: number,
      endPrice: number,
      startTime: number,
      endTime: number
    ) => {
      const metrics = calculateRulerMetrics(
        startPrice,
        endPrice,
        startTime,
        endTime,
        barsRef.current
      );
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);

      ctx.fillStyle = "rgba(41, 98, 255, 0.08)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "rgba(41, 98, 255, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);

      ctx.strokeStyle = "#2962ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const mins = Math.round(metrics.durationMs / 60000);
      const durStr = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
      const badgeText = `${metrics.deltaPrice >= 0 ? "+" : ""}${metrics.deltaPrice.toFixed(2)} (${metrics.deltaPercent >= 0 ? "+" : ""}${metrics.deltaPercent.toFixed(2)}%) · ${metrics.barCount} bars · ${durStr}`;

      ctx.font = "10px monospace";
      const textW = ctx.measureText(badgeText).width;
      const midX = rx + rw / 2;
      const midY = ry + rh / 2;

      ctx.fillStyle = "rgba(10, 20, 31, 0.88)";
      ctx.strokeStyle = "rgba(41, 98, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(midX - textW / 2 - 8, midY - 10, textW + 16, 20, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = metrics.deltaPrice >= 0 ? "#00c087" : "#ff3b30";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, midX, midY);
    },
    []
  );

  const renderBrush = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      points: Array<{ x: number; y: number }>,
      color: string,
      lineWidth = 2.5
    ) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    },
    []
  );

  const renderText = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      text: string,
      color: string
    ) => {
      ctx.font = "12px monospace";
      const textW = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(10, 20, 31, 0.85)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x1 - 4, y1 - 16, textW + 8, 22, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x1, y1 - 5);
    },
    []
  );

  const renderHandles = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      drawing: ChartDrawing,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      pathPoints?: Array<{ x: number; y: number }>
    ) => {
      // 1. Rectangle 8 handles (DEC-052)
      if (drawing.type === "rectangle") {
        const handles = getRectangleHandles(x1, y1, x2, y2);
        handles.forEach((h) => {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#2962ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.type.includes("m") ? 3.5 : 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        return;
      }

      // 2. Position tools 3 handles (Target, Stop, Width)
      if (drawing.type === "long_position" || drawing.type === "short_position") {
        const isLong = drawing.type === "long_position";
        const targetPrice =
          drawing.targetPrice !== undefined
            ? drawing.targetPrice
            : isLong
            ? drawing.startPrice * 1.02
            : drawing.startPrice * 0.98;
        const stopPrice =
          drawing.stopPrice !== undefined
            ? drawing.stopPrice
            : isLong
            ? drawing.startPrice * 0.99
            : drawing.startPrice * 1.01;

        const yTarget = getSafeScreenY(targetPrice);
        const yStop = getSafeScreenY(stopPrice);
        const yEntry = y1;
        const leftX = Math.min(x1, x2);
        const boxWidth = Math.max(80, Math.abs(x2 - x1));
        const midX = leftX + boxWidth / 2;
        const rightX = leftX + boxWidth;

        const handles = [
          { x: midX, y: yTarget !== null ? yTarget : y2, fill: "#00c087", stroke: "#ffffff" },
          { x: midX, y: yStop !== null ? yStop : y1, fill: "#ff3b30", stroke: "#ffffff" },
          { x: rightX, y: yEntry, fill: "#ffffff", stroke: "#2962ff" },
          { x: midX, y: yEntry, fill: "#ffffff", stroke: "#2962ff" },
        ];

        handles.forEach((h) => {
          ctx.fillStyle = h.fill;
          ctx.strokeStyle = h.stroke;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        return;
      }

      // 3. Circle 2 handles (Center + Radius)
      if (drawing.type === "circle") {
        const handles = [
          { x: x1, y: y1, fill: "#2962ff", stroke: "#ffffff" },
          { x: x2, y: y2, fill: "#ffffff", stroke: "#2962ff" },
        ];
        handles.forEach((h) => {
          ctx.fillStyle = h.fill;
          ctx.strokeStyle = h.stroke;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        return;
      }

      // 4. Date Range & Fixed Range Volume Profile handles (Left & Right boundary midpoints)
      if (drawing.type === "date_range" || drawing.type === "fixed_range_volume_profile") {
        let midY = (y1 + y2) / 2;
        if (drawing.type === "fixed_range_volume_profile") {
          const frvp = calculateFixedRangeVolumeProfile(
            barsRef.current,
            drawing.startTime,
            drawing.endTime,
            drawing.frvpRows || 24,
            (drawing.frvpValueAreaPct || 70) / 100
          );
          if (frvp) {
            const yh = getSafeScreenY(frvp.maxHigh);
            const yl = getSafeScreenY(frvp.minLow);
            if (yh !== null && yl !== null) {
              midY = (yh + yl) / 2;
            }
          }
        }
        [{ x: x1, y: midY }, { x: x2, y: midY }].forEach((h) => {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#2962ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        return;
      }

      // 5. Horizontal Line & Vertical Line center handles
      if (drawing.type === "horizontal_line") {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#2962ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc((x1 + x2) / 2, y1, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        return;
      }

      if (drawing.type === "vertical_line") {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#2962ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x1, (y1 + y2) / 2, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        return;
      }

      // 6. Path or Trend-Based Fib node points
      if (pathPoints && pathPoints.length > 0) {
        pathPoints.forEach((p) => {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#2962ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        return;
      }

      // 7. Default 2-point handles
      const defaultHandles = [
        { x: x1, y: y1, r: 4.5, fill: "#ffffff", stroke: "#2962ff" },
        { x: x2, y: y2, r: 4.5, fill: "#ffffff", stroke: "#2962ff" },
        { x: (x1 + x2) / 2, y: (y1 + y2) / 2, r: 3.5, fill: "#2962ff", stroke: "#ffffff" },
      ];

      defaultHandles.forEach((h) => {
        ctx.fillStyle = h.fill;
        ctx.strokeStyle = h.stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    },
    [getSafeScreenY]
  );

  // Hit-Testing for Selection & Handle Dragging (DEC-043, DEC-046, DEC-047, DEC-052 to DEC-056)
  const getHitTestResult = useCallback(
    (x: number, y: number) => {
      if (isDrawingsHidden || drawings.length === 0) return null;

      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        if (d.isHidden) continue;

        // 1. Path or Brush multi-point hit testing (DEC-047, DEC-063)
        if ((d.type === "path" || d.type === "brush") && d.points && d.points.length > 0) {
          const screenPts = d.points
            .map((pt) => ({ x: timeToCoordinate(pt.time), y: priceToCoordinate(pt.price) }))
            .filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;

          if (d.type === "path") {
            for (let pIdx = 0; pIdx < screenPts.length; pIdx++) {
              if (Math.hypot(x - screenPts[pIdx].x, y - screenPts[pIdx].y) <= 9) {
                return { drawing: d, handle: `node_${pIdx}` };
              }
            }
          }

          if (isPointNearPath(x, y, screenPts, 10)) {
            return { drawing: d, handle: "body" as const };
          }
          continue;
        }

        // 2. Trend-Based Fib Extension 3-point hit testing (DEC-055)
        if (d.type === "trend_fib" && d.points && d.points.length > 0) {
          const screenPts = d.points
            .map((pt) => ({ x: timeToCoordinate(pt.time), y: priceToCoordinate(pt.price) }))
            .filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;

          for (let pIdx = 0; pIdx < screenPts.length; pIdx++) {
            if (Math.hypot(x - screenPts[pIdx].x, y - screenPts[pIdx].y) <= 9) {
              return { drawing: d, handle: `node_${pIdx}` };
            }
          }

          if (
            screenPts.length >= 2 &&
            isPointNearSegment(x, y, screenPts[0].x, screenPts[0].y, screenPts[1].x, screenPts[1].y, 8)
          ) {
            return { drawing: d, handle: "body" as const };
          }

          if (screenPts.length >= 3) {
            if (
              isPointNearSegment(x, y, screenPts[1].x, screenPts[1].y, screenPts[2].x, screenPts[2].y, 8)
            ) {
              return { drawing: d, handle: "body" as const };
            }
            const extLevels = calculateTrendFibLevels(
              d.points[0].price,
              d.points[1].price,
              d.points[2].price,
              d.fibLevels
            );
            for (const lvl of extLevels) {
              const ly = getSafeScreenY(lvl.price);
              if (ly !== null && Math.abs(y - ly) <= 6 && x >= screenPts[2].x) {
                return { drawing: d, handle: "body" as const };
              }
            }
          }
          continue;
        }

        const x1 = getSafeScreenX(d.startTime);
        const y1 = getSafeScreenY(d.startPrice);
        const x2 = getSafeScreenX(d.endTime);
        const y2 = getSafeScreenY(d.endPrice);
        if (x1 === null || y1 === null) continue;

        // 3. Horizontal Line & Vertical Line infinite hit testing (DEC-054)
        if (d.type === "horizontal_line") {
          const midX = x2 !== null ? (x1 + x2) / 2 : x1;
          if (Math.hypot(x - midX, y - y1) <= 9) {
            return { drawing: d, handle: "h_center" };
          }
          if (Math.abs(y - y1) <= 8) {
            return { drawing: d, handle: "body" as const };
          }
          continue;
        }

        if (d.type === "vertical_line") {
          const midY = y2 !== null ? (y1 + y2) / 2 : y1;
          if (Math.hypot(x - x1, y - midY) <= 9) {
            return { drawing: d, handle: "v_center" };
          }
          if (Math.abs(x - x1) <= 8) {
            return { drawing: d, handle: "body" as const };
          }
          continue;
        }

        // 4. Position tools handles & edge lines (DEC-054, DEC-065, DEC-100)
        if (d.type === "long_position" || d.type === "short_position") {
          const isLong = d.type === "long_position";
          const targetPrice =
            d.targetPrice !== undefined
              ? d.targetPrice
              : isLong
              ? d.startPrice * 1.02
              : d.startPrice * 0.98;
          const stopPrice =
            d.stopPrice !== undefined
              ? d.stopPrice
              : isLong
              ? d.startPrice * 0.99
              : d.startPrice * 1.01;
          const yTarget = getSafeScreenY(targetPrice);
          const yStop = getSafeScreenY(stopPrice);
          const validX2 = x2 !== null ? x2 : x1 + 120;
          const leftX = Math.min(x1, validX2);
          const boxWidth = Math.max(80, Math.abs(validX2 - x1));
          const midX = leftX + boxWidth / 2;
          const rightX = leftX + boxWidth;

          // 1. Circular center handles (9px radius)
          if (yTarget !== null && Math.hypot(x - midX, y - yTarget) <= 9) {
            return { drawing: d, handle: "pos_target" };
          }
          if (yStop !== null && Math.hypot(x - midX, y - yStop) <= 9) {
            return { drawing: d, handle: "pos_stop" };
          }
          if (Math.hypot(x - rightX, y - y1) <= 9) {
            return { drawing: d, handle: "pos_width" };
          }
          if (Math.hypot(x - midX, y - y1) <= 9) {
            return { drawing: d, handle: "pos_entry" };
          }

          // 2. Full horizontal edge line hit-testing (DEC-100 TradingView parity)
          if (yTarget !== null && x >= leftX - 4 && x <= rightX + 4 && Math.abs(y - yTarget) <= 6) {
            return { drawing: d, handle: "pos_target" };
          }
          if (yStop !== null && x >= leftX - 4 && x <= rightX + 4 && Math.abs(y - yStop) <= 6) {
            return { drawing: d, handle: "pos_stop" };
          }
          if (x >= leftX - 4 && x <= rightX + 4 && Math.abs(y - y1) <= 5) {
            return { drawing: d, handle: "pos_entry" };
          }

          // 3. Body interior dragging
          if (yTarget !== null && yStop !== null) {
            const minY = Math.min(y1, yTarget, yStop);
            const maxY = Math.max(y1, yTarget, yStop);
            if (x >= leftX && x <= rightX && y >= minY && y <= maxY) {
              return { drawing: d, handle: "body" as const };
            }
          }
          continue;
        }

        if (x2 === null || y2 === null) continue;

        // 5. Rectangle 8 handles hit testing (DEC-052, DEC-062)
        if (d.type === "rectangle") {
          const handles = getRectangleHandles(x1, y1, x2, y2);
          for (const h of handles) {
            if (Math.hypot(x - h.x, y - h.y) <= 9) {
              return { drawing: d, handle: h.type };
            }
          }
          const canvasW = drawingCanvasRef.current?.getBoundingClientRect().width || 2000;
          if (isPointNearRectangle(x, y, x1, y1, x2, y2, !!d.extendRight, canvasW, 8)) {
            return { drawing: d, handle: "body" as const };
          }
          continue;
        }

        // 6. Circle handles (Center + Radius perimeter)
        if (d.type === "circle") {
          if (Math.hypot(x - x1, y - y1) <= 9) {
            return { drawing: d, handle: "circle_center" };
          }
          if (Math.hypot(x - x2, y - y2) <= 9) {
            return { drawing: d, handle: "circle_radius" };
          }
          const radius = Math.hypot(x2 - x1, y2 - y1);
          if (isPointNearCircle(x, y, x1, y1, radius, 8)) {
            return { drawing: d, handle: "body" as const };
          }
          continue;
        }

                // 7. Date Range & Fixed Range Volume Profile handles (Left & Right boundary midpoints)
        if (d.type === "date_range" || d.type === "fixed_range_volume_profile") {
          let topY = Math.min(y1, y2);
          let bottomY = Math.max(y1, y2);
          if (d.type === "fixed_range_volume_profile") {
            const frvp = calculateFixedRangeVolumeProfile(
              barsRef.current,
              d.startTime,
              d.endTime,
              d.frvpRows || 24,
              (d.frvpValueAreaPct || 70) / 100
            );
            if (frvp) {
              const yh = getSafeScreenY(frvp.maxHigh);
              const yl = getSafeScreenY(frvp.minLow);
              if (yh !== null && yl !== null) {
                topY = Math.min(yh, yl);
                bottomY = Math.max(yh, yl);
              }
            }
          }
          const midY = (topY + bottomY) / 2;
          if (
            Math.hypot(x - x1, y - midY) <= 10 ||
            (d.type === "fixed_range_volume_profile" && Math.abs(x - x1) <= 6 && y >= topY - 8 && y <= bottomY + 8)
          ) {
            return { drawing: d, handle: "dr_start" };
          }
          if (
            Math.hypot(x - x2, y - midY) <= 10 ||
            (d.type === "fixed_range_volume_profile" && Math.abs(x - x2) <= 6 && y >= topY - 8 && y <= bottomY + 8)
          ) {
            return { drawing: d, handle: "dr_end" };
          }
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          if (d.type === "fixed_range_volume_profile") {
            if (x >= minX && x <= maxX && y >= topY - 4 && y <= bottomY + 4) {
              return { drawing: d, handle: "body" as const };
            }
          } else if (x >= minX && x <= maxX) {
            return { drawing: d, handle: "body" as const };
          }
          continue;
        }

        // 8. Gann Box handles (4 corners)
        if (d.type === "gann_box") {
          if (Math.hypot(x - x1, y - y1) <= 9) return { drawing: d, handle: "start" as const };
          if (Math.hypot(x - x2, y - y2) <= 9) return { drawing: d, handle: "end" as const };
          if (Math.hypot(x - x1, y - y2) <= 9) return { drawing: d, handle: "gann_bl" };
          if (Math.hypot(x - x2, y - y1) <= 9) return { drawing: d, handle: "gann_tr" };
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          const minY = Math.min(y1, y2);
          const maxY = Math.max(y1, y2);
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            return { drawing: d, handle: "body" as const };
          }
          continue;
        }

        // 9. Fibonacci Retracement handles and levels (DEC-050)
        if (d.type === "fibonacci") {
          if (Math.hypot(x - x1, y - y1) <= 9) return { drawing: d, handle: "start" as const };
          if (Math.hypot(x - x2, y - y2) <= 9) return { drawing: d, handle: "end" as const };
          const levels = calculateFibLevels(d.startPrice, d.endPrice, d.fibLevels);
          const minX = d.extendLeft ? 0 : Math.min(x1, x2);
          const maxX = d.extendRight ? (drawingCanvasRef.current?.width || 2000) : Math.max(x1, x2) + 60;
          if (x >= minX - 4 && x <= maxX + 4) {
            for (const lvl of levels) {
              const ly = getSafeScreenY(lvl.price);
              if (ly !== null && Math.abs(y - ly) <= 6) {
                return { drawing: d, handle: "body" as const };
              }
            }
          }
          continue;
        }

        // 10. Default 2-point handles and segment check (trendline, brush, text)
        if (Math.hypot(x - x1, y - y1) <= 9) {
          return { drawing: d, handle: "start" as const };
        }
        if (Math.hypot(x - x2, y - y2) <= 9) {
          return { drawing: d, handle: "end" as const };
        }
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        if (Math.hypot(x - midX, y - midY) <= 8) {
          return { drawing: d, handle: "body" as const };
        }

        if (isPointNearSegment(x, y, x1, y1, x2, y2, 8)) {
          return { drawing: d, handle: "body" as const };
        }
      }

      return null;
    },
    [isDrawingsHidden, drawings, getSafeScreenX, getSafeScreenY, timeToCoordinate, priceToCoordinate]
  );

  const isFvgHidden =
    hiddenIndicators.includes("Unmitigated Multi-Timeframe FVG (0% Hit)") ||
    hiddenIndicators.some((ind) => ind.toLowerCase().includes("fvg"));
  const hasFvgIndicator =
    (activeIndicators.includes("Unmitigated Multi-Timeframe FVG (0% Hit)") ||
      activeIndicators.some((ind) => ind.toLowerCase().includes("fvg"))) &&
    !isFvgHidden;

  const activeFvgZones = useMemo(() => {
    if (!hasFvgIndicator) return [];
    return computeUnmitigatedFvgs(bars, { timeframe: resolution });
  }, [hasFvgIndicator, bars, resolution]);

  const isMarketStructureHidden =
    hiddenIndicators.includes("True Market Structure & Substructure") ||
    hiddenIndicators.some((ind) => ind.toLowerCase().includes("structure"));
  const hasMarketStructure =
    (activeIndicators.includes("True Market Structure & Substructure") ||
      activeIndicators.some((ind) => ind.toLowerCase().includes("structure"))) &&
    !isMarketStructureHidden;

  const marketStructureResult = useMemo(() => {
    if (!hasMarketStructure || bars.length === 0) return null;
    return computeMarketStructure(bars, marketStructureSettings);
  }, [hasMarketStructure, bars, marketStructureSettings]);

  const isCandleStructureHidden =
    hiddenIndicators.includes("Candlestick Market Structure (Price Action)") ||
    hiddenIndicators.some((ind) => ind.toLowerCase().includes("candle"));
  const hasCandleStructure =
    (activeIndicators.includes("Candlestick Market Structure (Price Action)") ||
      activeIndicators.some((ind) => ind.toLowerCase().includes("candle"))) &&
    !isCandleStructureHidden;

  const candleStructureResult = useMemo(() => {
    if (!hasCandleStructure || bars.length === 0) return null;
    return computeCandleMarketStructure(bars, candleStructureSettings);
  }, [hasCandleStructure, bars, candleStructureSettings]);

  const bullFvgCount = activeFvgZones.filter((z) => z.type === "BULLISH").length;
  const bearFvgCount = activeFvgZones.filter((z) => z.type === "BEARISH").length;

  const renderDrawingCanvas = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(rect.width * dpr);
    const targetH = Math.floor(rect.height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // 0. Render Visible Range Volume Profile (VPVR) if enabled (DEC-071)
    const isVpvrHidden = hiddenIndicators.some(
      (ind) =>
        ind.toLowerCase().includes("volume profile") ||
        ind.toLowerCase().includes("poc")
    );
    const showVpvr =
      activeIndicators.some(
        (ind) =>
          ind.toLowerCase().includes("volume profile") ||
          ind.toLowerCase().includes("poc")
      ) && !isVpvrHidden;
    if (showVpvr && barsRef.current.length > 0) {
      let visibleBars = barsRef.current;
      try {
        const timeRange = chartRef.current?.timeScale().getVisibleRange();
        if (timeRange && timeRange.from && timeRange.to) {
          const fromMs = Number(timeRange.from) * 1000;
          const toMs = Number(timeRange.to) * 1000;
          const filtered = barsRef.current.filter(
            (b) => b.time >= fromMs && b.time <= toMs
          );
          if (filtered.length >= 5) {
            visibleBars = filtered;
          }
        }
      } catch {}

      const vpvr = calculateVisibleVolumeProfile(
        visibleBars,
        vpvrRows,
        vpvrVaPercent / 100
      );
      if (vpvr && vpvr.maxBucketVolume > 0) {
        const rightEdgeX = Math.max(100, rect.width - 68);
        const maxBarWidth = Math.min(180, rect.width * 0.22);

        ctx.save();
        // Draw each horizontal volume bucket (Buy + Sell stacked from right edge leftward)
        for (const bucket of vpvr.buckets) {
          const yTop = getSafeScreenY(bucket.priceHigh);
          const yBot = getSafeScreenY(bucket.priceLow);
          if (yTop === null || yBot === null) continue;

          const top = Math.min(yTop, yBot);
          const height = Math.max(2, Math.abs(yBot - yTop) - 1);
          const totalWidth =
            (bucket.totalVolume / vpvr.maxBucketVolume) * maxBarWidth;
          const buyWidth =
            bucket.totalVolume > 0
              ? (bucket.buyVolume / bucket.totalVolume) * totalWidth
              : 0;
          const sellWidth = Math.max(0, totalWidth - buyWidth);

          const alpha = bucket.isPoc ? 0.58 : bucket.isValueArea ? 0.36 : 0.15;

          // Sell portion (anchored on the right)
          ctx.fillStyle = `rgba(255, 59, 48, ${alpha})`;
          ctx.fillRect(rightEdgeX - sellWidth, top, sellWidth, height);

          // Buy portion (stacked to the left of sell portion)
          ctx.fillStyle = `rgba(0, 192, 135, ${alpha})`;
          ctx.fillRect(
            rightEdgeX - sellWidth - buyWidth,
            top,
            buyWidth,
            height
          );

          if (bucket.isPoc) {
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = 1.25;
            ctx.strokeRect(
              rightEdgeX - totalWidth,
              top,
              totalWidth,
              height
            );
          }
        }

        // Draw VAH, VAL, and POC horizontal reference lines & tags
        const drawVpvrLevel = (
          price: number,
          label: string,
          color: string,
          dashed: boolean
        ) => {
          const y = getSafeScreenY(price);
          if (y === null || y < 0 || y > rect.height) return;
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = dashed ? 1.1 : 1.6;
          if (dashed) ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(Math.max(0, rightEdgeX - maxBarWidth - 60), y);
          ctx.lineTo(rightEdgeX, y);
          ctx.stroke();
          ctx.setLineDash([]);

          const fmt = price >= 1 ? price.toFixed(2) : price.toFixed(4);
          const tagText = `${label} $${fmt}`;
          ctx.font = "bold 9px monospace";
          const tw = ctx.measureText(tagText).width + 8;
          const tx = Math.max(8, rightEdgeX - maxBarWidth - tw - 6);
          ctx.fillStyle = "rgba(10, 20, 31, 0.9)";
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(tx, y - 8, tw, 16, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(tagText, tx + 4, y + 0.5);
          ctx.restore();
        };

        drawVpvrLevel(vpvr.vahPrice, "VAH", "#2962ff", true);
        drawVpvrLevel(vpvr.valPrice, "VAL", "#2962ff", true);
        drawVpvrLevel(vpvr.pocPrice, "POC", "#f59e0b", false);

        ctx.restore();
      }
    }

    // Render Unmitigated Fair Value Gap Rectangles (0% Wick Touch)
    if (activeFvgZones.length > 0 && !isDrawingsHidden) {
      const latestBarTime = barsRef.current[barsRef.current.length - 1]?.time || Date.now();
      const latestX = getSafeScreenX(latestBarTime) || rect.width;

      activeFvgZones.forEach((zone) => {
        const x1 = getSafeScreenX(zone.startTime);
        const y1 = getSafeScreenY(zone.top);
        const y2 = getSafeScreenY(zone.bottom);

        if (x1 !== null && y1 !== null && y2 !== null) {
          const rightX = Math.max(x1 + 40, latestX);
          renderRectangle(
            ctx,
            x1,
            y1,
            rightX,
            y2,
            {
              id: zone.id,
              type: "rectangle",
              startTime: zone.startTime,
              startPrice: zone.top,
              endTime: latestBarTime,
              endPrice: zone.bottom,
              color: zone.color,
              fillColor: zone.fillColor,
              fillOpacity: 0.18,
              lineWidth: 1,
              showMidLine: true,
              midLineColor: zone.color,
              midLineStyle: "dashed",
              extendRight: false,
              text: `${zone.timeframe ? zone.timeframe + " " : ""}${zone.type === "BULLISH" ? "Bull FVG" : "Bear FVG"}`,
              fontSize: 10,
              textAlign: "right",
              textVAlign: "top",
            } as any,
            rect.width
          );
        }
      });
    }

    // Render Static Custom Script Boxes (DEC-082, DEC-095, DEC-096)
    const isCustomNamedHidden = customIndicatorData?.name
      ? hiddenIndicators.includes(customIndicatorData.name)
      : false;
    if (
      customScriptBoxes &&
      customScriptBoxes.length > 0 &&
      !isDrawingsHidden &&
      !isCustomIndicatorHidden &&
      !isCustomNamedHidden
    ) {
      const latestBarTime = barsRef.current[barsRef.current.length - 1]?.time || Date.now();
      customScriptBoxes.forEach((box, bIdx) => {
        const x1 = getSafeScreenX(box.startTime);
        const y1 = getSafeScreenY(box.top !== undefined ? box.top : (box.startPrice ?? 0));
        const y2 = getSafeScreenY(box.bottom !== undefined ? box.bottom : (box.endPrice ?? 0));

        if (x1 !== null && y1 !== null && y2 !== null) {
          const defaultColor =
            box.type === "BULLISH" ? "#00c087" : box.type === "BEARISH" ? "#ff3b30" : "#00d8ff";
          const boxColor = box.color || defaultColor;
          const endCoord = box.endTime !== undefined && box.endTime !== null ? getSafeScreenX(box.endTime) : null;
          const latestCoord = getSafeScreenX(latestBarTime);
          const x2 = box.extendRight
            ? rect.width
            : endCoord !== null
            ? endCoord
            : latestCoord !== null
            ? latestCoord
            : rect.width;

          renderRectangle(
            ctx,
            x1,
            y1,
            Math.max(x1 + 20, x2),
            y2,
            {
              id: box.id || `custom-box-${bIdx}`,
              type: "rectangle",
              startTime: box.startTime,
              startPrice: box.top !== undefined ? box.top : (box.startPrice ?? 0),
              endTime: box.endTime || latestBarTime,
              endPrice: box.bottom !== undefined ? box.bottom : (box.endPrice ?? 0),
              color: boxColor,
              fillColor: box.fillColor || boxColor,
              fillOpacity: box.fillOpacity !== undefined ? box.fillOpacity : 0.18,
              lineWidth: box.lineWidth || 1,
              lineStyle: box.lineStyle || "solid",
              showMidLine: box.showMidLine !== undefined ? box.showMidLine : true,
              midLineColor: box.midLineColor || boxColor,
              midLineStyle: box.midLineStyle || "dashed",
              extendRight: !!box.extendRight,
              text: box.label || (box.type ? `${box.type} Zone` : ""),
              fontSize: 10,
              textAlign: "right",
              textVAlign: "top",
            } as any,
            rect.width
          );
        }
      });
    }

    // Render True Market Structure & Substructure (Classic ZigZag, BOS, CHoCH)
    if (marketStructureResult && !isDrawingsHidden) {
      const { majorSwings, subSwings, breakouts } = marketStructureResult;

      // 1. Draw Internal Substructure ZigZag
      if (marketStructureSettings.showSubstructure && subSwings.length > 1) {
        ctx.strokeStyle = marketStructureSettings.subColor;
        ctx.lineWidth = marketStructureSettings.subLineWidth;
        if (marketStructureSettings.subLineStyle === "dashed") ctx.setLineDash([4, 4]);
        else if (marketStructureSettings.subLineStyle === "dotted") ctx.setLineDash([2, 2]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        let started = false;
        for (let s = 0; s < subSwings.length; s++) {
          const sx = getSafeScreenX(subSwings[s].time);
          const sy = getSafeScreenY(subSwings[s].price);
          if (sx !== null && sy !== null) {
            if (!started) {
              ctx.moveTo(sx, sy);
              started = true;
            } else {
              ctx.lineTo(sx, sy);
            }
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 2. Draw Major Structure ZigZag & Pivot Labels
      if (marketStructureSettings.showMajor && majorSwings.length > 0) {
        ctx.strokeStyle = marketStructureSettings.majorColor;
        ctx.lineWidth = marketStructureSettings.majorLineWidth;
        if (marketStructureSettings.majorLineStyle === "dashed") ctx.setLineDash([5, 5]);
        else if (marketStructureSettings.majorLineStyle === "dotted") ctx.setLineDash([2, 2]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        let started = false;
        for (let m = 0; m < majorSwings.length; m++) {
          const mx = getSafeScreenX(majorSwings[m].time);
          const my = getSafeScreenY(majorSwings[m].price);
          if (mx !== null && my !== null) {
            if (!started) {
              ctx.moveTo(mx, my);
              started = true;
            } else {
              ctx.lineTo(mx, my);
            }
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Swing Points & HH/HL/LH/LL Labels
        majorSwings.forEach((sw) => {
          const sx = getSafeScreenX(sw.time);
          const sy = getSafeScreenY(sw.price);
          if (sx === null || sy === null) return;

          // Draw small pivot circle
          ctx.fillStyle = marketStructureSettings.majorColor;
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();

          // Draw HH / HL / LH / LL label badge if enabled
          if (marketStructureSettings.showSwingLabels && sw.tag) {
            const isTagEnabled =
              (sw.tag === "HH" && marketStructureSettings.showHH) ||
              (sw.tag === "HL" && marketStructureSettings.showHL) ||
              (sw.tag === "LH" && marketStructureSettings.showLH) ||
              (sw.tag === "LL" && marketStructureSettings.showLL);

            if (isTagEnabled) {
              const tagColor =
                sw.tag === "HH"
                  ? marketStructureSettings.hhColor || marketStructureSettings.bullishColor
                  : sw.tag === "HL"
                  ? marketStructureSettings.hlColor || marketStructureSettings.bullishColor
                  : sw.tag === "LH"
                  ? marketStructureSettings.lhColor || marketStructureSettings.bearishColor
                  : marketStructureSettings.llColor || marketStructureSettings.bearishColor;

              ctx.font = "bold 9px monospace";
              ctx.textAlign = "center";
              const textY = sw.type === "HIGH" ? sy - 7 : sy + 14;

              // Background pill
              const textWidth = ctx.measureText(sw.tag).width;
              ctx.fillStyle = "rgba(23, 27, 38, 0.85)";
              ctx.fillRect(sx - textWidth / 2 - 3, textY - 8, textWidth + 6, 12);
              ctx.strokeStyle = tagColor;
              ctx.lineWidth = 1;
              ctx.strokeRect(sx - textWidth / 2 - 3, textY - 8, textWidth + 6, 12);

              ctx.fillStyle = tagColor;
              ctx.fillText(sw.tag, sx, textY + 1);
            }
          }
        });
      }

      // 3. Draw Breakouts (BOS & CHoCH)
      if (breakouts.length > 0) {
        breakouts.forEach((b) => {
          const x1 = getSafeScreenX(b.fromTime);
          const x2 = getSafeScreenX(b.toTime);
          const y = getSafeScreenY(b.level);

          if (x1 !== null && x2 !== null && y !== null) {
            const bColor =
              b.type === "BOS"
                ? b.direction === "BULLISH"
                  ? marketStructureSettings.bosBullishColor || marketStructureSettings.bullishColor
                  : marketStructureSettings.bosBearishColor || marketStructureSettings.bearishColor
                : b.direction === "BULLISH"
                ? marketStructureSettings.chochBullishColor || marketStructureSettings.bullishColor
                : marketStructureSettings.chochBearishColor || marketStructureSettings.bearishColor;

            // Dashed breakout level ray
            ctx.strokeStyle = bColor;
            ctx.lineWidth = b.isSubstructure ? 1 : 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label pill in the center of the breakout
            const midX = (x1 + x2) / 2;
            const labelText = `${b.type}${b.isSubstructure ? " (sub)" : ""}`;
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "center";
            const textWidth = ctx.measureText(labelText).width;

            ctx.fillStyle = bColor;
            ctx.fillRect(midX - textWidth / 2 - 3, y - 7, textWidth + 6, 13);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(labelText, midX, y + 3);
          }
        });
      }
    }

    // Render Candlestick-Based Market Structure (Price Action SH/SL & MSS/BOS)
    if (candleStructureResult && !isDrawingsHidden) {
      const { swings, breaks } = candleStructureResult;

      // 1. Render Swing High & Swing Low markers
      if (candleStructureSettings.showSwings) {
        swings.forEach((sw) => {
          const sx = getSafeScreenX(sw.time);
          const sy = getSafeScreenY(sw.price);
          if (sx === null || sy === null) return;

          const color =
            sw.type === "HIGH"
              ? candleStructureSettings.swingHighColor
              : candleStructureSettings.swingLowColor;

          // Draw small triangle pivot marker
          ctx.fillStyle = color;
          ctx.beginPath();
          if (sw.type === "HIGH") {
            ctx.moveTo(sx, sy - 2);
            ctx.lineTo(sx - 4, sy - 7);
            ctx.lineTo(sx + 4, sy - 7);
          } else {
            ctx.moveTo(sx, sy + 2);
            ctx.lineTo(sx - 4, sy + 7);
            ctx.lineTo(sx + 4, sy + 7);
          }
          ctx.closePath();
          ctx.fill();

          // Label text badge
          if (candleStructureSettings.showSwingTags) {
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "center";
            const textY = sw.type === "HIGH" ? sy - 9 : sy + 16;

            const textWidth = ctx.measureText(sw.tag).width;
            ctx.fillStyle = "rgba(19, 23, 34, 0.85)";
            ctx.fillRect(sx - textWidth / 2 - 2, textY - 8, textWidth + 4, 11);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - textWidth / 2 - 2, textY - 8, textWidth + 4, 11);

            ctx.fillStyle = color;
            ctx.fillText(sw.tag, sx, textY);
          }
        });
      }

      // 2. Render Market Structure Shifts (MSS / BOS)
      if (candleStructureSettings.showBreaks) {
        breaks.forEach((b) => {
          const x1 = getSafeScreenX(b.fromTime);
          const x2 = getSafeScreenX(b.toTime);
          const y = getSafeScreenY(b.level);

          if (x1 !== null && x2 !== null && y !== null) {
            const bColor =
              b.direction === "BULLISH"
                ? candleStructureSettings.bullishMssColor
                : candleStructureSettings.bearishMssColor;

            // Breakout level ray
            ctx.strokeStyle = bColor;
            ctx.lineWidth = candleStructureSettings.breakLineWidth;
            if (candleStructureSettings.breakLineStyle === "dashed") ctx.setLineDash([3, 3]);
            else if (candleStructureSettings.breakLineStyle === "dotted") ctx.setLineDash([2, 2]);
            else ctx.setLineDash([]);

            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Shift pill
            const midX = (x1 + x2) / 2;
            const labelText = `${b.direction === "BULLISH" ? "+" : "-"}${b.type}`;
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "center";
            const textWidth = ctx.measureText(labelText).width;

            ctx.fillStyle = bColor;
            ctx.fillRect(midX - textWidth / 2 - 3, y - 6, textWidth + 6, 12);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(labelText, midX, y + 3);
          }
        });
      }
    }

    // 1. Render all persistent drawings if not hidden (DEC-040 & DEC-044 & DEC-070)
    if (!isDrawingsHidden) {
      drawings.forEach((d) => {
        if (d.isHidden) return;
        if (d.type === "path" && d.points && d.points.length > 0) {
          const screenPts = d.points
            .map((pt) => ({ x: timeToCoordinate(pt.time), y: priceToCoordinate(pt.price) }))
            .filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;
          renderPath(ctx, screenPts, d, d.id === selectedDrawingId);
          if (d.id === selectedDrawingId) {
            renderHandles(ctx, d, 0, 0, 0, 0, screenPts);
          }
          return;
        }

        if (d.type === "trend_fib" && d.points && d.points.length > 0) {
          renderTrendFib(ctx, d.points, d, rect.width);
          if (d.id === selectedDrawingId) {
            const screenPts = d.points
              .map((pt) => ({ x: timeToCoordinate(pt.time), y: priceToCoordinate(pt.price) }))
              .filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;
            renderHandles(ctx, d, 0, 0, 0, 0, screenPts);
          }
          return;
        }

        const x1 = getSafeScreenX(d.startTime);
        const y1 = getSafeScreenY(d.startPrice);
        const x2 = getSafeScreenX(d.endTime);
        const y2 = getSafeScreenY(d.endPrice);
        if (x1 === null || y1 === null) return;

        const validX2 = x2 !== null ? x2 : x1;
        const validY2 = y2 !== null ? y2 : y1;
        const color = d.color || "#2962ff";

        if (d.type === "trendline") {
          renderTrendline(ctx, x1, y1, validX2, validY2, d, rect.width);
        } else if (d.type === "horizontal_line") {
          renderHorizontalLine(ctx, y1, d, rect.width);
        } else if (d.type === "vertical_line") {
          renderVerticalLine(ctx, x1, d, rect.height);
        } else if (d.type === "rectangle") {
          renderRectangle(ctx, x1, y1, validX2, validY2, d, rect.width);
        } else if (d.type === "circle") {
          renderCircle(ctx, x1, y1, validX2, validY2, d);
        } else if (d.type === "date_range") {
          renderDateRange(ctx, x1, validX2, d, rect.height);
        } else if (d.type === "fixed_range_volume_profile") {
          renderFixedRangeVolumeProfile(ctx, x1, validX2, d, rect.width, rect.height);
        } else if (d.type === "long_position") {
          renderPositionBox(ctx, x1, y1, validX2, d, true);
        } else if (d.type === "short_position") {
          renderPositionBox(ctx, x1, y1, validX2, d, false);
        } else if (d.type === "gann_box") {
          renderGannBox(ctx, x1, y1, validX2, validY2, d);
        } else if (d.type === "fibonacci") {
          renderFibonacci(ctx, x1, y1, validX2, validY2, d, rect.width);
        } else if (d.type === "brush") {
          const screenPts = (d.points || [
            { time: d.startTime, price: d.startPrice },
            { time: d.endTime, price: d.endPrice },
          ])
            .map((pt) => ({ x: timeToCoordinate(pt.time), y: priceToCoordinate(pt.price) }))
            .filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;
          renderBrush(ctx, screenPts, color, d.lineWidth || 2.5);
        } else if (d.type === "text") {
          renderText(ctx, x1, y1, d.text || "Note", color);
        }

        if (d.id === selectedDrawingId) {
          renderHandles(ctx, d, x1, y1, validX2, validY2);
        }

        // Render active alert bell badge on alert-linked drawings (DEC-069)
        const hasLinkedAlert = activeAlerts.some(
          (a) => a.drawingId === d.id && a.symbol === symbol && a.active
        );
        if (hasLinkedAlert) {
          ctx.save();
          const badgeText = "🔔 ALERT";
          ctx.font = "bold 9px monospace";
          const tw = ctx.measureText(badgeText).width;
          const bx = Math.max(8, x1);
          const by = Math.max(18, y1 - 22);
          ctx.fillStyle = "rgba(245, 158, 11, 0.92)";
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, tw + 10, 16, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#0a141f";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(badgeText, bx + 5, by + 8);
          ctx.restore();
        }
      });
    }

    // 1.5 Render Active Standalone Price Alerts on Canvas (DEC-069)
    if (!isDrawingsHidden && activeAlerts.length > 0) {
      activeAlerts
        .filter((a) => a.symbol === symbol && a.active && !a.drawingId)
        .forEach((alert) => {
          const ay = getSafeScreenY(alert.targetPrice);
          if (ay === null || ay < 0 || ay > rect.height) return;
          ctx.save();
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1.25;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(0, ay);
          ctx.lineTo(rect.width, ay);
          ctx.stroke();
          ctx.setLineDash([]);

          const priceFormatted = pricePrecision.formatPrice(alert.targetPrice);
          const tagText = `🔔 $${priceFormatted}`;
          ctx.font = "bold 10px monospace";
          const tagW = ctx.measureText(tagText).width + 12;
          const tagH = 18;
          const tagX = Math.max(8, rect.width - tagW - 72);
          const tagY = ay - tagH / 2;

          ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(tagX, tagY, tagW, tagH, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#0a141f";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(tagText, tagX + 6, ay + 0.5);
          ctx.restore();
        });
    }

    // 1.6 Render Active Paper Positions & Working Limit Orders on Canvas (DEC-072)
    if (!isDrawingsHidden) {
      const symbolPositions = paperAccount.positions.filter((p) => p.symbol === symbol);
      const symbolOrders = paperAccount.orders.filter((o) => o.symbol === symbol);

      const drawOrderOrBracketLine = (
        price: number,
        badgeText: string,
        strokeColor: string,
        fillBg: string,
        textColor: string,
        dashed: boolean
      ) => {
        const py = getSafeScreenY(price);
        if (py === null || py < 0 || py > rect.height) return;
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = dashed ? 1.25 : 1.75;
        if (dashed) ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(rect.width, py);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = "bold 10px monospace";
        const tagW = ctx.measureText(badgeText).width + 14;
        const tagH = 18;
        const tagX = 14;
        const tagY = py - tagH / 2;

        ctx.fillStyle = fillBg;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tagX, tagY, tagW, tagH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, tagX + 7, py + 0.5);
        ctx.restore();
      };

      symbolPositions.forEach((pos) => {
        const mark = currentPrice && currentPrice > 0 ? currentPrice : pos.entryPrice;
        const pnl = calculatePositionUnrealizedPnl(pos, mark);
        const sign = pnl.unrealizedPnl >= 0 ? "+" : "";
        const entryFmt = pricePrecision.formatPrice(pos.entryPrice);
        const sideColor = pos.side === "long" ? "#00c087" : "#ff3b30";
        const pnlStr = `${sign}$${pnl.unrealizedPnl.toFixed(2)} (${sign}${pnl.roePercent.toFixed(1)}%)`;

        drawOrderOrBracketLine(
          pos.entryPrice,
          `${pos.side.toUpperCase()} ${pos.leverage}x @ $${entryFmt} · ${pnlStr}`,
          sideColor,
          "rgba(10, 20, 31, 0.94)",
          sideColor,
          false
        );

        if (pos.takeProfit && pos.takeProfit > 0) {
          const tpFmt = pricePrecision.formatPrice(pos.takeProfit);
          drawOrderOrBracketLine(
            pos.takeProfit,
            `TP (${pos.side.toUpperCase()}) @ $${tpFmt}`,
            "#00c087",
            "rgba(0, 192, 135, 0.16)",
            "#00c087",
            true
          );
        }

        if (pos.stopLoss && pos.stopLoss > 0) {
          const slFmt = pricePrecision.formatPrice(pos.stopLoss);
          drawOrderOrBracketLine(
            pos.stopLoss,
            `SL (${pos.side.toUpperCase()}) @ $${slFmt}`,
            "#ff3b30",
            "rgba(255, 59, 48, 0.16)",
            "#ff3b30",
            true
          );
        }
      });

      symbolOrders.forEach((ord) => {
        const limFmt = pricePrecision.formatPrice(ord.limitPrice);
        drawOrderOrBracketLine(
          ord.limitPrice,
          `LIMIT ${ord.side.toUpperCase()} ${ord.leverage}x @ $${limFmt}`,
          "#00d8ff",
          "rgba(10, 20, 31, 0.92)",
          "#00d8ff",
          true
        );
      });
    }

    // 2. Render in-flight active drawing tool preview
    if (activeDrawingTool === "path" && inFlightPathPoints.length > 0 && !isDrawingsHidden) {
      const previewPts = inFlightPathPoints
        .map((pt) => ({ x: timeToCoordinate(pt.time), y: priceToCoordinate(pt.price) }))
        .filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;
      if (mousePos) {
        previewPts.push(mousePos);
      }
      renderPath(ctx, previewPts, { type: "path", color: "#b6c4ff", lineWidth: 2 } as any, false);
    } else if (activeDrawingTool === "brush" && inFlightBrushPoints.length > 0 && !isDrawingsHidden) {
      const previewPts = inFlightBrushPoints
        .map((pt) => ({ x: timeToCoordinate(pt.time), y: priceToCoordinate(pt.price) }))
        .filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;
      renderBrush(ctx, previewPts, "#b6c4ff", 2.5);
    } else if (activeDrawingTool === "trend_fib" && inFlightTrendFibPoints.length > 0 && !isDrawingsHidden) {
      const previewPts = [...inFlightTrendFibPoints];
      if (mousePos) {
        const mouseTime =
          coordinateToTime(mousePos.x) ||
          (barsRef.current.length > 0
            ? barsRef.current[barsRef.current.length - 1].time
            : Date.now());
        const mousePrice = coordinateToPrice(mousePos.y) || currentPrice || 0;
        previewPts.push({ time: mouseTime, price: mousePrice });
      }
      renderTrendFib(
        ctx,
        previewPts,
        { type: "trend_fib", color: "#b6c4ff", lineWidth: 1.5, fibLevels: DEFAULT_FIB_LEVELS } as any,
        rect.width
      );
    } else if (inFlightDrawing && !isDrawingsHidden) {
      const x1 = getSafeScreenX(inFlightDrawing.startTime);
      const y1 = getSafeScreenY(inFlightDrawing.startPrice);
      const x2 = getSafeScreenX(inFlightDrawing.endTime);
      const y2 = getSafeScreenY(inFlightDrawing.endPrice);

      if (x1 !== null && y1 !== null) {
        const validX2 = x2 !== null ? x2 : x1;
        const validY2 = y2 !== null ? y2 : y1;
        const color = inFlightDrawing.color || "#b6c4ff";
        ctx.save();
        ctx.globalAlpha = 0.85;

        if (inFlightDrawing.type === "trendline") {
          ctx.setLineDash([4, 4]);
          renderTrendline(ctx, x1, y1, validX2, validY2, inFlightDrawing, rect.width);
        } else if (inFlightDrawing.type === "horizontal_line") {
          renderHorizontalLine(ctx, y1, inFlightDrawing, rect.width);
        } else if (inFlightDrawing.type === "vertical_line") {
          renderVerticalLine(ctx, x1, inFlightDrawing, rect.height);
        } else if (inFlightDrawing.type === "rectangle") {
          ctx.setLineDash([4, 4]);
          renderRectangle(ctx, x1, y1, validX2, validY2, inFlightDrawing, rect.width);
        } else if (inFlightDrawing.type === "circle") {
          renderCircle(ctx, x1, y1, validX2, validY2, inFlightDrawing);
        } else if (inFlightDrawing.type === "date_range") {
          renderDateRange(ctx, x1, validX2, inFlightDrawing, rect.height);
        } else if (inFlightDrawing.type === "fixed_range_volume_profile") {
          renderFixedRangeVolumeProfile(ctx, x1, validX2, inFlightDrawing, rect.width, rect.height);
        } else if (inFlightDrawing.type === "long_position") {
          renderPositionBox(ctx, x1, y1, validX2, inFlightDrawing, true);
        } else if (inFlightDrawing.type === "short_position") {
          renderPositionBox(ctx, x1, y1, validX2, inFlightDrawing, false);
        } else if (inFlightDrawing.type === "gann_box") {
          renderGannBox(ctx, x1, y1, validX2, validY2, inFlightDrawing);
        } else if (inFlightDrawing.type === "fibonacci") {
          renderFibonacci(ctx, x1, y1, validX2, validY2, inFlightDrawing, rect.width);
        } else if (inFlightDrawing.type === "text") {
          renderText(ctx, x1, y1, "Note", color);
        }
        ctx.restore();
      }
    }

    // 3. Smart Magnet Snapping Indicator (DEC-042)
    if (
      snappedPoint &&
      isMagnetActive &&
      (isDrawing ||
        drawingStep === 1 ||
        inFlightPathPoints.length > 0 ||
        inFlightTrendFibPoints.length > 0 ||
        activeDrawingTool !== "none")
    ) {
      ctx.save();
      ctx.strokeStyle = "#00d8ff";
      ctx.fillStyle = "rgba(0, 216, 255, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(snappedPoint.x, snappedPoint.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(snappedPoint.x - 9, snappedPoint.y);
      ctx.lineTo(snappedPoint.x + 9, snappedPoint.y);
      ctx.moveTo(snappedPoint.x, snappedPoint.y - 9);
      ctx.lineTo(snappedPoint.x, snappedPoint.y + 9);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Interactive Bar Replay Scissor-Cut ("Jump to Bar") Overlay (DEC-073)
    if (replayState === "SELECTING" && mousePos) {
      const cutX = snappedPoint ? snappedPoint.x : mousePos.x;
      const cutTime =
        (snappedPoint ? snappedPoint.time : coordinateToTime(cutX)) ||
        (barsRef.current.length > 0
          ? barsRef.current[barsRef.current.length - 1].time
          : Date.now());

      ctx.save();
      // Dimmed Future Bars Curtain to the right of the scissor line
      if (cutX < rect.width) {
        ctx.fillStyle = "rgba(6, 14, 23, 0.62)";
        ctx.fillRect(cutX, 0, rect.width - cutX, rect.height);
      }

      // Vertical Scissor-Cut Line
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cutX, 0);
      ctx.lineTo(cutX, rect.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Floating Scissor-Cut Timestamp Pill Badge
      const dStr = new Date(cutTime).toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const label = `✂ CUT HERE · ${dStr}`;
      ctx.font = "bold 10px monospace";
      const tw = ctx.measureText(label).width + 16;
      const th = 22;
      const bx = Math.max(8, Math.min(rect.width - tw - 8, cutX - tw / 2));
      const by = 52;

      ctx.fillStyle = "rgba(245, 158, 11, 0.96)";
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, th, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#0a141f";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx + tw / 2, by + th / 2 + 0.5);
      ctx.restore();
    }

    // 5. Strategy Backtest Entry-to-Exit Trade Execution Connectors & PnL Badges (DEC-074)
    if (showTradeConnectors && trades && trades.length > 0) {
      for (const trade of trades) {
        const x1 = timeToCoordinate(trade.entryTime);
        const y1 = priceToCoordinate(trade.entryPrice);
        const x2 = timeToCoordinate(trade.exitTime);
        const y2 = priceToCoordinate(trade.exitPrice);

        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
        if (Math.max(x1, x2) < -60 || Math.min(x1, x2) > rect.width + 60) continue;

        const isProfitable = trade.netPnL >= 0;
        const isFocused = focusedTrade?.tradeId === trade.tradeId;
        const baseColor = isProfitable ? "#00c087" : "#ff3b30";

        ctx.save();

        // Focused trade highlighted corridor & halo
        if (isFocused) {
          ctx.fillStyle = isProfitable
            ? "rgba(0, 192, 135, 0.08)"
            : "rgba(255, 59, 48, 0.08)";
          const rx = Math.min(x1, x2);
          const ry = Math.min(y1, y2);
          const rw = Math.max(8, Math.abs(x2 - x1));
          const rh = Math.max(8, Math.abs(y2 - y1));
          ctx.fillRect(rx - 4, ry - 4, rw + 8, rh + 8);

          ctx.strokeStyle = isProfitable
            ? "rgba(0, 192, 135, 0.45)"
            : "rgba(255, 59, 48, 0.45)";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        // Dashed Entry-to-Exit connector path
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = isFocused ? 2.2 : 1.4;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Entry node circle
        ctx.fillStyle = "#0a141f";
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(x1, y1, isFocused ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Exit node filled circle
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(x2, y2, isFocused ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Floating PnL badge at midpoint (always shown when focused or when connector span >= 28px)
        const spanPx = Math.hypot(x2 - x1, y2 - y1);
        if (isFocused || spanPx >= 28) {
          const midX = (x1 + x2) / 2;
          const midY = Math.min(y1, y2) - (isFocused ? 18 : 13);
          const sign = isProfitable ? "+" : "";
          const badgeText = isFocused
            ? `${trade.direction.toUpperCase()} ${sign}${trade.pnlPercent.toFixed(2)}% (${sign}$${trade.netPnL.toFixed(1)})`
            : `${sign}${trade.pnlPercent.toFixed(1)}%`;

          ctx.font = isFocused ? "bold 10px monospace" : "bold 9px monospace";
          const bw = ctx.measureText(badgeText).width + 10;
          const bh = isFocused ? 18 : 15;
          const bx = Math.max(4, Math.min(rect.width - bw - 4, midX - bw / 2));
          const by = Math.max(12, midY - bh / 2);

          ctx.fillStyle = isFocused
            ? isProfitable
              ? "rgba(0, 192, 135, 0.95)"
              : "rgba(255, 59, 48, 0.95)"
            : "rgba(10, 20, 31, 0.88)";
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = isFocused ? 1.5 : 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isFocused ? "#0a141f" : baseColor;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(badgeText, bx + bw / 2, by + bh / 2 + 0.5);
        }

        ctx.restore();
      }
    }

    // 6. Multi-Chart Synchronized Crosshair Guide (DEC-075)
    if (syncCrosshair && syncedCrosshairTime !== null) {
      const syncX = timeToCoordinate(syncedCrosshairTime);
      if (syncX !== null && syncX >= 0 && syncX <= rect.width) {
        ctx.save();
        ctx.strokeStyle = "rgba(41, 98, 255, 0.55)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(syncX, 0);
        ctx.lineTo(syncX, rect.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Find nearest bar close price at syncedCrosshairTime to draw synchronized price dot
        let nearestBar: CandlestickBar | null = null;
        let minDiff = Infinity;
        for (const b of barsRef.current) {
          const diff = Math.abs(b.time - syncedCrosshairTime);
          if (diff < minDiff) {
            minDiff = diff;
            nearestBar = b;
          }
        }
        if (nearestBar) {
          const syncY = priceToCoordinate(nearestBar.close);
          if (syncY !== null && syncY >= 0 && syncY <= rect.height) {
            ctx.fillStyle = "#2962ff";
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(syncX, syncY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    ctx.restore();
  }, [
    drawings,
    activeAlerts,
    paperAccount,
    currentPrice,
    replayState,
    activeIndicators,
    hiddenIndicators,
    vpvrRows,
    vpvrVaPercent,
    trades,
    focusedTrade,
    showTradeConnectors,
    syncCrosshair,
    syncedCrosshairTime,
    symbol,
    selectedDrawingId,
    inFlightDrawing,
    inFlightPathPoints,
    inFlightTrendFibPoints,
    inFlightBrushPoints,
    isDrawingsHidden,
    snappedPoint,
    isMagnetActive,
    isDrawing,
    drawingStep,
    activeDrawingTool,
    mousePos,
    coordinateToTime,
    getSafeScreenX,
    getSafeScreenY,
    timeToCoordinate,
    priceToCoordinate,
    renderTrendline,
    renderHorizontalLine,
    renderVerticalLine,
    renderRectangle,
    renderCircle,
    renderDateRange,
    renderFixedRangeVolumeProfile,
    renderPositionBox,
    renderTrendFib,
    renderGannBox,
    renderPath,
    renderFibonacci,
    renderBrush,
    renderText,
    renderHandles,
    customScriptBoxes,
    activeFvgZones,
    marketStructureResult,
    candleStructureResult,
    isCustomIndicatorHidden,
    customIndicatorData,
  ]);

  // Listen for Multi-Chart Crosshair Synchronization events from sibling panes (DEC-075)
  useEffect(() => {
    const onCrosshairSync = (e: Event) => {
      const detail = (e as CustomEvent<{ sourcePaneId: string; timeMs: number | null }>).detail;
      if (!detail || detail.sourcePaneId === paneId) return;
      if (!syncCrosshair) {
        setSyncedCrosshairTime(null);
        return;
      }
      setSyncedCrosshairTime(detail.timeMs);
    };
    window.addEventListener("mochex:crosshair-sync", onCrosshairSync);
    return () => window.removeEventListener("mochex:crosshair-sync", onCrosshairSync);
  }, [paneId, syncCrosshair]);

  // Subscribe to Pan & Zoom events to re-project drawings seamlessly
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const handleRangeChange = () => {
      renderDrawingCanvas();
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    chart.timeScale().subscribeVisibleTimeRangeChange(handleRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRangeChange);
    };
  }, [renderDrawingCanvas]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      renderDrawingCanvas();
    });
    return () => cancelAnimationFrame(rafId);
  }, [renderDrawingCanvas]);

  // Unified auto-refresh & indicator/drawing cleanup handler (DEC-119)
  useEffect(() => {
    const handleClearDrawings = () => {
      saveDrawings([]);
      setSelectedDrawingId(null);
      setInFlightDrawing(null);
      setDrawingStep(0);

      const canvas = drawingCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      const chart = chartRef.current;
      if (chart) {
        try {
          chart.applyOptions({});
          chart.timeScale().applyOptions({});
        } catch {}
      }

      requestAnimationFrame(() => {
        renderDrawingCanvas();
      });
    };

    const handleClearIndicatorsEvent = () => {
      const chart = chartRef.current;
      if (chart) {
        // 1. Hide main pane indicator series
        ema20SeriesRef.current?.applyOptions({ visible: false });
        ema50SeriesRef.current?.applyOptions({ visible: false });
        ema100SeriesRef.current?.applyOptions({ visible: false });
        ema200SeriesRef.current?.applyOptions({ visible: false });
        bbUpperSeriesRef.current?.applyOptions({ visible: false });
        bbMiddleSeriesRef.current?.applyOptions({ visible: false });
        bbLowerSeriesRef.current?.applyOptions({ visible: false });

        // 2. Tear down sub-pane series
        if (rsiSeriesRef.current) {
          try { chart.removeSeries(rsiSeriesRef.current); } catch {}
          rsiSeriesRef.current = null;
        }
        if (macdLineSeriesRef.current) {
          try { chart.removeSeries(macdLineSeriesRef.current); } catch {}
          macdLineSeriesRef.current = null;
        }
        if (macdSignalSeriesRef.current) {
          try { chart.removeSeries(macdSignalSeriesRef.current); } catch {}
          macdSignalSeriesRef.current = null;
        }
        if (macdHistSeriesRef.current) {
          try { chart.removeSeries(macdHistSeriesRef.current); } catch {}
          macdHistSeriesRef.current = null;
        }
        if (strategyEquitySeriesRef.current) {
          try { chart.removeSeries(strategyEquitySeriesRef.current); } catch {}
          strategyEquitySeriesRef.current = null;
        }
        if (strategyBuyHoldSeriesRef.current) {
          try { chart.removeSeries(strategyBuyHoldSeriesRef.current); } catch {}
          strategyBuyHoldSeriesRef.current = null;
        }
        if (strategyDrawdownSeriesRef.current) {
          try { chart.removeSeries(strategyDrawdownSeriesRef.current); } catch {}
          strategyDrawdownSeriesRef.current = null;
        }
        if (customIndicatorSeriesRef.current) {
          try { chart.removeSeries(customIndicatorSeriesRef.current); } catch {}
          customIndicatorSeriesRef.current = null;
        }

        try {
          chart.applyOptions({});
          chart.timeScale().applyOptions({});
        } catch {}
      }

      const canvas = drawingCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      requestAnimationFrame(() => {
        renderDrawingCanvas();
      });
    };

    const handleRefreshChartEvent = () => {
      const chart = chartRef.current;
      if (chart) {
        try {
          chart.applyOptions({});
          chart.timeScale().applyOptions({});
        } catch {}
      }
      const canvas = drawingCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(() => {
        renderDrawingCanvas();
      });
    };

    window.addEventListener("mochex:clear-drawings", handleClearDrawings);
    window.addEventListener("mochex:clear-indicators", handleClearIndicatorsEvent);
    window.addEventListener("mochex:clear-custom-indicators", handleClearIndicatorsEvent);
    window.addEventListener("mochex:refresh-chart", handleRefreshChartEvent);

    return () => {
      window.removeEventListener("mochex:clear-drawings", handleClearDrawings);
      window.removeEventListener("mochex:clear-indicators", handleClearIndicatorsEvent);
      window.removeEventListener("mochex:clear-custom-indicators", handleClearIndicatorsEvent);
      window.removeEventListener("mochex:refresh-chart", handleRefreshChartEvent);
    };
  }, [saveDrawings, renderDrawingCanvas]);

  // Keyboard shortcut listener (Delete/Backspace to remove, Enter to finish path, Escape to cancel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActivePane) return;
      if (isTypingTarget(document.activeElement)) {
        return;
      }

      // Undo / Redo keyboard shortcuts (DEC-068)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Clone / Duplicate selected drawing shortcut (DEC-070)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (selectedDrawingId) {
          e.preventDefault();
          const target = drawings.find((d) => d.id === selectedDrawingId);
          if (target) {
            const cloned = cloneDrawingObject(target, getResolutionMs(resolution) * 3);
            saveDrawings([...drawings, cloned]);
            setSelectedDrawingId(cloned.id);
          }
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedDrawingId) {
          const drawingToDelete = drawings.find((d) => d.id === selectedDrawingId);
          if (drawingToDelete && !drawingToDelete.isLocked) {
            saveDrawings(drawings.filter((d) => d.id !== selectedDrawingId));
            setSelectedDrawingId(null);
          }
        }
      } else if (e.key === "Enter") {
        if (activeDrawingTool === "path" && inFlightPathPoints.length >= 2) {
          const finishedDrawing: ChartDrawing = {
            id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            type: "path",
            points: [...inFlightPathPoints],
            startTime: inFlightPathPoints[0].time,
            endTime: inFlightPathPoints[inFlightPathPoints.length - 1].time,
            startPrice: inFlightPathPoints[0].price,
            endPrice: inFlightPathPoints[inFlightPathPoints.length - 1].price,
            color: "#2962ff",
            lineWidth: 2,
            lineStyle: "solid",
            isLocked: isDrawingsLocked || false,
          };
          saveDrawings([...drawings, finishedDrawing]);
          setSelectedDrawingId(finishedDrawing.id);
          setInFlightPathPoints([]);
          setMousePos(null);
          onSelectDrawingTool?.("none");
        }
      } else if (e.key === "Escape") {
        if (inFlightPathPoints.length > 0) {
          setInFlightPathPoints([]);
          setMousePos(null);
          onSelectDrawingTool?.("none");
        } else if (inFlightTrendFibPoints.length > 0) {
          setInFlightTrendFibPoints([]);
          setMousePos(null);
          onSelectDrawingTool?.("none");
        } else if (inFlightBrushPoints.length > 0) {
          setInFlightBrushPoints([]);
          setIsDrawing(false);
          onSelectDrawingTool?.("none");
        } else if (inFlightDrawing) {
          setInFlightDrawing(null);
          setDrawingStep(0);
          setIsDrawing(false);
          setDragStartPos(null);
        } else if (selectedDrawingId) {
          setSelectedDrawingId(null);
        } else if (activeDrawingTool !== "none" && activeDrawingTool !== "crosshair") {
          onSelectDrawingTool?.("none");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedDrawingId,
    drawings,
    inFlightDrawing,
    inFlightPathPoints,
    inFlightTrendFibPoints,
    inFlightBrushPoints,
    activeDrawingTool,
    isDrawingsLocked,
    onSelectDrawingTool,
    saveDrawings,
    handleUndo,
    handleRedo,
    isActivePane,
  ]);

  const flashToast = useCallback((message: string) => {
    setShortcutToast(message);
    window.setTimeout(() => {
      setShortcutToast((current) => (current === message ? null : current));
    }, 1400);
  }, []);

  const resetChartView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({ autoScale: true, invertScale: false });
    chart.timeScale().resetTimeScale();
    chart.timeScale().scrollToRealTime();
    setIsPriceScaleInverted(false);
    setActiveQuickRange(null);
    flashToast("Chart view reset");
  }, [flashToast]);

  // TradingView Alt-Shortcut Suite (DEC-077) & Alternative Shortcuts (DEC-091)
  useEffect(() => {
    const handleGlobalResetView = (e: Event) => {
      const detail = (e as CustomEvent<{ paneId?: string }>).detail;
      if (!detail?.paneId || detail.paneId === paneId) {
        resetChartView();
      }
    };

    window.addEventListener("mochex:reset-view", handleGlobalResetView);

    if (!isActivePane) {
      return () => {
        window.removeEventListener("mochex:reset-view", handleGlobalResetView);
      };
    }

    // Price/time under the cursor, falling back to the latest candle close
    const resolveCursorAnchor = (): { time: number; price: number } | null => {
      const lastBar = barsRef.current[barsRef.current.length - 1];
      const hover = lastHoverPointRef.current;
      if (hover) {
        const price = coordinateToPrice(hover.y);
        const time = coordinateToTime(hover.x);
        if (price !== null && time !== null) return { time, price };
      }
      if (lastBar) return { time: lastBar.time, price: lastBar.close };
      return null;
    };

    const handleShortcut = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      const action = matchChartShortcut(e);
      if (!action || action === "show_cheatsheet") return;
      e.preventDefault();
      e.stopPropagation();

      const chart = chartRef.current;

      switch (action) {
        case "reset_view": {
          resetChartView();
          return;
        }
        case "invert_scale": {
          if (!chart) return;
          setIsPriceScaleInverted((prev) => {
            const next = !prev;
            chart.priceScale("right").applyOptions({ invertScale: next });
            flashToast(next ? "Price scale inverted" : "Price scale normal");
            return next;
          });
          return;
        }
        case "trendline": {
          onSelectDrawingTool?.("trendline");
          flashToast("Trendline tool");
          return;
        }
        case "fibonacci": {
          onSelectDrawingTool?.("fibonacci");
          flashToast("Fib Retracement tool");
          return;
        }
        case "horizontal_line": {
          const anchor = resolveCursorAnchor();
          if (!anchor) return;
          const newDrawing: ChartDrawing = {
            id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            type: "horizontal_line",
            startTime: anchor.time,
            startPrice: anchor.price,
            endTime: anchor.time + 86400000,
            endPrice: anchor.price,
            color: "#2962ff",
            lineWidth: 1.5,
            lineStyle: "solid",
            isLocked: isDrawingsLocked || false,
          };
          saveDrawings([...drawingsRef.current, newDrawing]);
          setSelectedDrawingId(newDrawing.id);
          flashToast(`Horizontal line @ ${pricePrecision.formatPrice(anchor.price)}`);
          return;
        }
        case "create_alert": {
          // Selected drawing -> alert on drawing; otherwise drop an H-line at cursor price and alert on it
          let target = selectedDrawingId
            ? drawingsRef.current.find((d) => d.id === selectedDrawingId) ?? null
            : null;
          if (!target) {
            const anchor = resolveCursorAnchor();
            if (!anchor) return;
            target = {
              id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              type: "horizontal_line",
              startTime: anchor.time,
              startPrice: anchor.price,
              endTime: anchor.time + 86400000,
              endPrice: anchor.price,
              color: "#f5ac37",
              lineWidth: 1.5,
              lineStyle: "dashed",
              isLocked: isDrawingsLocked || false,
            };
            saveDrawings([...drawingsRef.current, target]);
            setSelectedDrawingId(target.id);
          }
          const newAlerts = createAlertsFromDrawing(target, symbolRef.current);
          window.dispatchEvent(
            new CustomEvent("mochex:create-drawing-alert", { detail: { alerts: newAlerts } })
          );
          flashToast("Alert created");
          return;
        }
      }
    };

    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("mochex:reset-view", handleGlobalResetView);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("mochex:reset-view", handleGlobalResetView);
    };
  }, [
    isActivePane,
    selectedDrawingId,
    isDrawingsLocked,
    onSelectDrawingTool,
    saveDrawings,
    coordinateToPrice,
    coordinateToTime,
  ]);

  // Container mouse move handler to detect drawing hover when canvas pointer-events are disabled (DEC-087)
  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!drawingCanvasRef.current || isDrawingsHidden || drawingsRef.current.length === 0) {
        return;
      }
      if (
        isDrawingMode ||
        draggedHandleRef.current ||
        drawingStep === 1 ||
        inFlightDrawing !== null ||
        inFlightPathPoints.length > 0 ||
        inFlightTrendFibPoints.length > 0
      ) {
        return;
      }

      const rect = drawingCanvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = getHitTestResult(x, y);
      const isHit = hit !== null;
      const nextHandle = hit ? hit.handle : null;

      setIsHoveringDrawing((prev) => (prev === isHit ? prev : isHit));
      setHoveredHandle((prev) => (prev === nextHandle ? prev : nextHandle));
    },
    [
      isDrawingsHidden,
      isDrawingMode,
      selectedDrawingId,
      drawingStep,
      inFlightDrawing,
      inFlightPathPoints,
      inFlightTrendFibPoints,
      getHitTestResult,
    ]
  );

  // Mouse handlers for drawing overlay (DEC-042 to DEC-056)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let effectiveTime =
      coordinateToTime(x) ||
      (barsRef.current.length > 0
        ? barsRef.current[barsRef.current.length - 1].time
        : Date.now());
    let effectivePrice = coordinateToPrice(y) || currentPrice || 0;

    if (isMagnetActive) {
      const snap = findNearestCandlePoint(
        x,
        y,
        barsRef.current,
        timeToCoordinate,
        priceToCoordinate,
        25
      );
      if (snap) {
        effectiveTime = snap.time;
        effectivePrice = snap.price;
      }
    }

    // 0. Interactive Bar Replay Scissor-Cut Click (DEC-073)
    if (replayState === "SELECTING") {
      replayEngine.setCutoffTime(effectiveTime);
      setMousePos(null);
      return;
    }

    // 1. Path Drawing Tool: multi-click vertex placement (DEC-047)
    if (activeDrawingTool === "path") {
      if (e.detail === 2 && inFlightPathPoints.length >= 2) {
        const finishedDrawing: ChartDrawing = {
          id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: "path",
          points: [...inFlightPathPoints],
          startTime: inFlightPathPoints[0].time,
          endTime: inFlightPathPoints[inFlightPathPoints.length - 1].time,
          startPrice: inFlightPathPoints[0].price,
          endPrice: inFlightPathPoints[inFlightPathPoints.length - 1].price,
          color: "#2962ff",
          lineWidth: 2,
          lineStyle: "solid",
          isLocked: isDrawingsLocked || false,
        };
        saveDrawings([...drawings, finishedDrawing]);
        setSelectedDrawingId(finishedDrawing.id);
        setInFlightPathPoints([]);
        setMousePos(null);
        onSelectDrawingTool?.("none");
        return;
      }

      setInFlightPathPoints((prev) => [...prev, { time: effectiveTime, price: effectivePrice }]);
      return;
    }

    // 2. Trend-Based Fib Extension: 3-point progressive placement (DEC-055)
    if (activeDrawingTool === "trend_fib") {
      const currentPts = [...inFlightTrendFibPoints, { time: effectiveTime, price: effectivePrice }];
      if (currentPts.length === 3) {
        const finishedDrawing: ChartDrawing = {
          id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: "trend_fib",
          points: currentPts,
          startTime: currentPts[0].time,
          endTime: currentPts[2].time,
          startPrice: currentPts[0].price,
          endPrice: currentPts[2].price,
          color: "#2962ff",
          lineWidth: 1.5,
          lineStyle: "solid",
          fibLevels: DEFAULT_FIB_LEVELS,
          isLocked: isDrawingsLocked || false,
        };
        saveDrawings([...drawings, finishedDrawing]);
        setSelectedDrawingId(finishedDrawing.id);
        setInFlightTrendFibPoints([]);
        setMousePos(null);
        onSelectDrawingTool?.("none");
      } else {
        setInFlightTrendFibPoints(currentPts);
      }
      return;
    }

    // 3. 1-Click Drop Tools (DEC-054): horizontal_line, vertical_line, long_position, short_position, text
    if (activeDrawingTool === "horizontal_line") {
      const newDrawing: ChartDrawing = {
        id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "horizontal_line",
        startTime: effectiveTime,
        startPrice: effectivePrice,
        endTime: effectiveTime + 86400000,
        endPrice: effectivePrice,
        color: "#2962ff",
        lineWidth: 1.5,
        lineStyle: "solid",
        isLocked: isDrawingsLocked || false,
      };
      saveDrawings([...drawings, newDrawing]);
      setSelectedDrawingId(newDrawing.id);
      onSelectDrawingTool?.("none");
      return;
    }

    if (activeDrawingTool === "vertical_line") {
      const newDrawing: ChartDrawing = {
        id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "vertical_line",
        startTime: effectiveTime,
        startPrice: effectivePrice,
        endTime: effectiveTime,
        endPrice: effectivePrice,
        color: "#2962ff",
        lineWidth: 1.5,
        lineStyle: "solid",
        isLocked: isDrawingsLocked || false,
      };
      saveDrawings([...drawings, newDrawing]);
      setSelectedDrawingId(newDrawing.id);
      onSelectDrawingTool?.("none");
      return;
    }

    if (activeDrawingTool === "long_position") {
      const resMs = Math.max(60000, getResolutionMs(resolution));
      const timeSpan = 20 * resMs;
      const target = effectivePrice * 1.02;
      const stop = effectivePrice * 0.99;
      const newDrawing: ChartDrawing = {
        id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "long_position",
        startTime: effectiveTime,
        startPrice: effectivePrice,
        endTime: effectiveTime + timeSpan,
        endPrice: target,
        targetPrice: target,
        stopPrice: stop,
        color: "#ffffff",
        lineWidth: 1.5,
        profitColor: "#089981",
        profitOpacity: 20,
        stopColor: "#f23636",
        stopOpacity: 20,
        accountSize: 10000,
        riskPercent: 1.0,
        showLabels: true,
        isLocked: isDrawingsLocked || false,
      };
      saveDrawings([...drawings, newDrawing]);
      setSelectedDrawingId(newDrawing.id);
      onSelectDrawingTool?.("none");
      return;
    }

    if (activeDrawingTool === "short_position") {
      const resMs = Math.max(60000, getResolutionMs(resolution));
      const timeSpan = 20 * resMs;
      const target = effectivePrice * 0.98;
      const stop = effectivePrice * 1.01;
      const newDrawing: ChartDrawing = {
        id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "short_position",
        startTime: effectiveTime,
        startPrice: effectivePrice,
        endTime: effectiveTime + timeSpan,
        endPrice: target,
        targetPrice: target,
        stopPrice: stop,
        color: "#ffffff",
        lineWidth: 1.5,
        profitColor: "#089981",
        profitOpacity: 20,
        stopColor: "#f23636",
        stopOpacity: 20,
        accountSize: 10000,
        riskPercent: 1.0,
        showLabels: true,
        isLocked: isDrawingsLocked || false,
      };
      saveDrawings([...drawings, newDrawing]);
      setSelectedDrawingId(newDrawing.id);
      onSelectDrawingTool?.("none");
      return;
    }

    if (activeDrawingTool === "text") {
      const newDrawing: ChartDrawing = {
        id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: "text",
        startTime: effectiveTime,
        startPrice: effectivePrice,
        endTime: effectiveTime,
        endPrice: effectivePrice,
        text: "Note",
        fontSize: 12,
        color: "#2962ff",
        lineWidth: 1,
        isLocked: isDrawingsLocked || false,
      };
      saveDrawings([...drawings, newDrawing]);
      setSelectedDrawingId(newDrawing.id);
      onSelectDrawingTool?.("none");
      return;
    }

    // 3.5. Freehand Brush Stroke Start (DEC-063)
    if (activeDrawingTool === "brush") {
      setInFlightBrushPoints([{ time: effectiveTime, price: effectivePrice }]);
      setIsDrawing(true);
      return;
    }

    // 4. Standard 2-Point Drawing Tools (trendline, rectangle, circle, date_range, gann_box, fibonacci)
    if (activeDrawingTool !== "none" && activeDrawingTool !== "crosshair") {
      if (drawingStep === 0) {
        const newDrawing: ChartDrawing = {
          id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: activeDrawingTool,
          startTime: effectiveTime,
          startPrice: effectivePrice,
          endTime: effectiveTime,
          endPrice: effectivePrice,
          color: "#2962ff",
          showMetrics: false,
          fillColor: activeDrawingTool === "rectangle" ? "#2962ff" : undefined,
          fillOpacity: activeDrawingTool === "rectangle" ? 0.15 : undefined,
          lineWidth: 2,
          lineStyle: "solid",
          fibLevels: activeDrawingTool === "fibonacci" ? DEFAULT_FIB_LEVELS : undefined,
          frvpRows: activeDrawingTool === "fixed_range_volume_profile" ? 24 : undefined,
          frvpValueAreaPct: activeDrawingTool === "fixed_range_volume_profile" ? 70 : undefined,
          frvpPlacement: activeDrawingTool === "fixed_range_volume_profile" ? "left" : undefined,
          frvpWidthPct: activeDrawingTool === "fixed_range_volume_profile" ? 68 : undefined,
          frvpPocColor: activeDrawingTool === "fixed_range_volume_profile" ? "#ff5252" : undefined,
          frvpVaColor: activeDrawingTool === "fixed_range_volume_profile" ? "#2962ff" : undefined,
          showLabels: activeDrawingTool === "fixed_range_volume_profile" ? true : undefined,
          isLocked: isDrawingsLocked || false,
        };
        setInFlightDrawing(newDrawing);
        setDrawingStep(1);
        setIsDrawing(true);
        setDragStartPos({
          x,
          y,
          startTime: effectiveTime,
          endTime: effectiveTime,
          startPrice: effectivePrice,
          endPrice: effectivePrice,
        });
      } else if (drawingStep === 1 && inFlightDrawing) {
        let finalEndTime = inFlightDrawing.endTime;
        let finalEndPrice = inFlightDrawing.endPrice;

        if (e.shiftKey) {
          const anchorX = getSafeScreenX(inFlightDrawing.startTime);
          const anchorY = getSafeScreenY(inFlightDrawing.startPrice);
          if (
            inFlightDrawing.type === "trendline" ||
            inFlightDrawing.type === "fibonacci" ||
            inFlightDrawing.type === "date_range"
          ) {
            const snapped = calculateShiftAngleSnap(
              x,
              y,
              anchorX,
              anchorY,
              inFlightDrawing.startTime,
              inFlightDrawing.startPrice,
              coordinateToTime,
              coordinateToPrice
            );
            finalEndTime = snapped.time;
            finalEndPrice = snapped.price;
          } else if (inFlightDrawing.type === "rectangle" || inFlightDrawing.type === "gann_box") {
            const snapped = calculateShiftSquareSnap(
              x,
              y,
              anchorX,
              anchorY,
              inFlightDrawing.startTime,
              inFlightDrawing.startPrice,
              coordinateToTime,
              coordinateToPrice
            );
            finalEndTime = snapped.time;
            finalEndPrice = snapped.price;
          }
        }

        const finished: ChartDrawing = {
          ...inFlightDrawing,
          endTime: finalEndTime,
          endPrice: finalEndPrice,
          showMetrics: false,
        };
        saveDrawings([...drawings, finished]);
        setSelectedDrawingId(finished.id);
        setInFlightDrawing(null);
        setDrawingStep(0);
        setIsDrawing(false);
        setDragStartPos(null);
        onSelectDrawingTool?.("none");
      }
      return;
    }

    // 5. Selection & handle dragging workflow (DEC-062)
    const hit = getHitTestResult(x, y);
    if (hit) {
      setSelectedDrawingId(hit.drawing.id);
      if (!hit.drawing.isLocked && !isDrawingsLocked) {
        const wasStartEarlier = hit.drawing.startTime <= hit.drawing.endTime;
        const wasStartHigher = hit.drawing.startPrice >= hit.drawing.endPrice;
        const isLong = hit.drawing.type === "long_position";
        const currentTargetPrice =
          hit.drawing.targetPrice !== undefined
            ? hit.drawing.targetPrice
            : hit.drawing.type === "long_position" || hit.drawing.type === "short_position"
            ? isLong
              ? hit.drawing.startPrice * 1.04
              : hit.drawing.startPrice * 0.96
            : undefined;
        const currentStopPrice =
          hit.drawing.stopPrice !== undefined
            ? hit.drawing.stopPrice
            : hit.drawing.type === "long_position" || hit.drawing.type === "short_position"
            ? isLong
              ? hit.drawing.startPrice * 0.98
              : hit.drawing.startPrice * 1.02
            : undefined;

        preDragDrawingsRef.current = drawingsRef.current;
        draggedHandleRef.current = hit.handle;
        setDraggedHandle(hit.handle);
        setDragStartPos({
          x,
          y,
          startTime: hit.drawing.startTime,
          endTime: hit.drawing.endTime,
          startPrice: hit.drawing.startPrice,
          endPrice: hit.drawing.endPrice,
          targetPrice: currentTargetPrice,
          stopPrice: currentStopPrice,
          points: hit.drawing.points ? [...hit.drawing.points] : undefined,
          wasStartEarlier,
          wasStartHigher,
        });
      }
    } else {
      setSelectedDrawingId(null);
      draggedHandleRef.current = null;
      setDraggedHandle(null);
      setDragStartPos(null);
    }
  };

  // Centralized handle dragging processor with Shift lock / angle snap (DEC-116, DEC-118)
  const processActiveHandleDrag = useCallback(
    (clientX: number, clientY: number, shiftKey: boolean) => {
      const activeHandle = draggedHandle || draggedHandleRef.current;
      const startPos = dragStartPosRef.current || dragStartPos;
      if (!activeHandle || !selectedDrawingId || !startPos) return;

      const rect = drawingCanvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      let effectiveTime =
        coordinateToTime(x) ||
        (barsRef.current.length > 0
          ? barsRef.current[barsRef.current.length - 1].time
          : Date.now());
      const clampedY = Math.max(0, Math.min(rect.height, y));
      let effectivePrice = coordinateToPrice(y) || coordinateToPrice(clampedY) || currentPrice || 0;

      if (isMagnetActive) {
        const snap = findNearestCandlePoint(
          x,
          y,
          barsRef.current,
          timeToCoordinate,
          priceToCoordinate,
          25
        );
        if (snap) {
          effectiveTime = snap.time;
          effectivePrice = snap.price;
        }
      }

      const currentDrawings = drawingsRef.current.length > 0 ? drawingsRef.current : drawings;
      const drawing = currentDrawings.find((d) => d.id === selectedDrawingId);
      if (!drawing || drawing.isLocked || isDrawingsLocked) return;

      // 1. Node handles for path or trend_fib
        if (activeHandle.startsWith("node_")) {
          const nodeIdx = parseInt(activeHandle.replace("node_", ""), 10);
          if (drawing.points && !isNaN(nodeIdx) && drawing.points[nodeIdx]) {
            const updatedPoints = [...drawing.points];
            updatedPoints[nodeIdx] = { time: effectiveTime, price: effectivePrice };
            saveDrawings(
              currentDrawings.map((d) =>
                d.id === selectedDrawingId
                  ? {
                      ...d,
                      points: updatedPoints,
                      startTime: updatedPoints[0]?.time ?? d.startTime,
                      endTime: updatedPoints[updatedPoints.length - 1]?.time ?? d.endTime,
                      startPrice: updatedPoints[0]?.price ?? d.startPrice,
                      endPrice: updatedPoints[updatedPoints.length - 1]?.price ?? d.endPrice,
                    }
                  : d
              )
            );
          }
          return;
        }

        // 2. Rectangle 8 handles (DEC-052, DEC-062)
        if (activeHandle.startsWith("rect_")) {
          const hType = activeHandle.replace("rect_", "");
          let sT = drawing.startTime;
          let eT = drawing.endTime;
          let sP = drawing.startPrice;
          let eP = drawing.endPrice;

          const isStartLeft = startPos.wasStartEarlier ?? (sT <= eT);
          const isStartTop = startPos.wasStartHigher ?? (sP >= eP);

          if (hType === "tl") {
            if (isStartLeft) sT = effectiveTime; else eT = effectiveTime;
            if (isStartTop) sP = effectivePrice; else eP = effectivePrice;
          } else if (hType === "tr") {
            if (isStartLeft) eT = effectiveTime; else sT = effectiveTime;
            if (isStartTop) sP = effectivePrice; else eP = effectivePrice;
          } else if (hType === "bl") {
            if (isStartLeft) sT = effectiveTime; else eT = effectiveTime;
            if (isStartTop) eP = effectivePrice; else sP = effectivePrice;
          } else if (hType === "br") {
            if (isStartLeft) eT = effectiveTime; else sT = effectiveTime;
            if (isStartTop) eP = effectivePrice; else sP = effectivePrice;
          } else if (hType === "mt") {
            if (isStartTop) sP = effectivePrice; else eP = effectivePrice;
          } else if (hType === "mb") {
            if (isStartTop) eP = effectivePrice; else sP = effectivePrice;
          } else if (hType === "ml") {
            if (isStartLeft) sT = effectiveTime; else eT = effectiveTime;
          } else if (hType === "mr") {
            if (isStartLeft) eT = effectiveTime; else sT = effectiveTime;
          }

          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, startTime: sT, endTime: eT, startPrice: sP, endPrice: eP }
                : d
            )
          );
          return;
        }

        // 3. Long / Short Position handles (DEC-054, DEC-065, DEC-100)
        const posMinBuffer =
          pricePrecision?.minMove && pricePrecision.minMove > 0
            ? pricePrecision.minMove
            : drawing.startPrice > 0
            ? drawing.startPrice * 0.0001
            : 0.000001;
        const posPrecision = pricePrecision?.precision ?? 4;
        const posMinMove = pricePrecision?.minMove ?? posMinBuffer;

        if (activeHandle === "pos_target") {
          saveDrawings(
            currentDrawings.map((d) => {
              if (d.id !== selectedDrawingId) return d;
              const isLong = d.type === "long_position";
              const rawClamped = clampPositionTargetPrice(
                effectivePrice,
                d.startPrice,
                isLong,
                posMinBuffer
              );
              const quantized = quantizePrice(rawClamped, posMinMove, posPrecision);
              return { ...d, targetPrice: quantized, endPrice: quantized };
            })
          );
          return;
        }
        if (activeHandle === "pos_stop") {
          saveDrawings(
            currentDrawings.map((d) => {
              if (d.id !== selectedDrawingId) return d;
              const isLong = d.type === "long_position";
              const rawClamped = clampPositionStopPrice(
                effectivePrice,
                d.startPrice,
                isLong,
                posMinBuffer
              );
              const quantized = quantizePrice(rawClamped, posMinMove, posPrecision);
              return { ...d, stopPrice: quantized };
            })
          );
          return;
        }
        if (activeHandle === "pos_entry") {
          saveDrawings(
            currentDrawings.map((d) => {
              if (d.id !== selectedDrawingId) return d;
              const isLong = d.type === "long_position";
              const curTarget =
                d.targetPrice !== undefined
                  ? d.targetPrice
                  : isLong
                  ? d.startPrice * 1.01
                  : d.startPrice * 0.99;
              const curStop =
                d.stopPrice !== undefined
                  ? d.stopPrice
                  : isLong
                  ? d.startPrice * 0.99
                  : d.startPrice * 1.01;
              const clamped = clampPositionEntryPrice(
                effectivePrice,
                curTarget,
                curStop,
                isLong,
                0.01,
                posMinBuffer
              );
              const quantized = quantizePrice(clamped, posMinMove, posPrecision);
              return {
                ...d,
                startPrice: quantized,
                targetPrice: curTarget,
                stopPrice: curStop,
              };
            })
          );
          return;
        }
        if (activeHandle === "pos_width") {
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, endTime: effectiveTime }
                : d
            )
          );
          return;
        }

        // 4. Circle handles
        if (activeHandle === "circle_center") {
          const dt = effectiveTime - drawing.startTime;
          const dp = effectivePrice - drawing.startPrice;
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? {
                    ...d,
                    startTime: effectiveTime,
                    startPrice: effectivePrice,
                    endTime: d.endTime + dt,
                    endPrice: d.endPrice + dp,
                  }
                : d
            )
          );
          return;
        }
        if (activeHandle === "circle_radius") {
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, endTime: effectiveTime, endPrice: effectivePrice }
                : d
            )
          );
          return;
        }

        // 5. Date Range handles
        if (activeHandle === "dr_start") {
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId ? { ...d, startTime: effectiveTime } : d
            )
          );
          return;
        }
        if (activeHandle === "dr_end") {
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId ? { ...d, endTime: effectiveTime } : d
            )
          );
          return;
        }

        // 6. Horizontal & Vertical Line handles
        if (activeHandle === "h_center") {
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, startPrice: effectivePrice, endPrice: effectivePrice }
                : d
            )
          );
          return;
        }
        if (activeHandle === "v_center") {
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, startTime: effectiveTime, endTime: effectiveTime }
                : d
            )
          );
          return;
        }

        // 7. Standard start & end handles with Shift angle snap (DEC-116)
        if (activeHandle === "start") {
          let sTime = effectiveTime;
          let sPrice = effectivePrice;
          if (
            shiftKey &&
            (drawing.type === "trendline" ||
              drawing.type === "fibonacci" ||
              drawing.type === "date_range")
          ) {
            const anchorX = getSafeScreenX(drawing.endTime);
            const anchorY = getSafeScreenY(drawing.endPrice);
            const snapped = calculateShiftAngleSnap(
              x,
              y,
              anchorX,
              anchorY,
              drawing.endTime,
              drawing.endPrice,
              coordinateToTime,
              coordinateToPrice
            );
            sTime = snapped.time;
            sPrice = snapped.price;
          }
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, startTime: sTime, startPrice: sPrice }
                : d
            )
          );
          return;
        }
        if (activeHandle === "end") {
          let eTime = effectiveTime;
          let ePrice = effectivePrice;
          if (
            shiftKey &&
            (drawing.type === "trendline" ||
              drawing.type === "fibonacci" ||
              drawing.type === "date_range")
          ) {
            const anchorX = getSafeScreenX(drawing.startTime);
            const anchorY = getSafeScreenY(drawing.startPrice);
            const snapped = calculateShiftAngleSnap(
              x,
              y,
              anchorX,
              anchorY,
              drawing.startTime,
              drawing.startPrice,
              coordinateToTime,
              coordinateToPrice
            );
            eTime = snapped.time;
            ePrice = snapped.price;
          }
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, endTime: eTime, endPrice: ePrice }
                : d
            )
          );
          return;
        }

        // 7.5 Gann Box corner handles (DEC-087)
        if (activeHandle === "gann_bl") {
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, startTime: effectiveTime, endPrice: effectivePrice }
                : d
            )
          );
          return;
        }
        if (activeHandle === "gann_tr") {
          saveDrawings(
            currentDrawings.map((d) =>
              d.id === selectedDrawingId
                ? { ...d, endTime: effectiveTime, startPrice: effectivePrice }
                : d
            )
          );
          return;
        }

        // 8. Body translation with Shift axis lock (DEC-116)
        if (activeHandle === "body") {
          let deltaPrice =
            effectivePrice - (coordinateToPrice(startPos.y) || startPos.startPrice);
          const startCoordTime = coordinateToTime(startPos.x) || startPos.startTime;
          let deltaTime = effectiveTime - startCoordTime;

          if (shiftKey) {
            const locked = calculateShiftAxisLock(
              x,
              y,
              startPos.x,
              startPos.y,
              deltaTime,
              deltaPrice
            );
            deltaTime = locked.deltaTime;
            deltaPrice = locked.deltaPrice;
          }

          if ((drawing.type === "path" || drawing.type === "trend_fib") && startPos.points) {
            const translatedPoints = startPos.points.map((pt) => ({
              time: pt.time + deltaTime,
              price: pt.price + deltaPrice,
            }));
            saveDrawings(
              currentDrawings.map((d) =>
                d.id === selectedDrawingId
                  ? {
                      ...d,
                      points: translatedPoints,
                      startTime: startPos.startTime + deltaTime,
                      endTime: startPos.endTime + deltaTime,
                      startPrice: startPos.startPrice + deltaPrice,
                      endPrice: startPos.endPrice + deltaPrice,
                    }
                  : d
              )
            );
          } else {
            saveDrawings(
              currentDrawings.map((d) =>
                d.id === selectedDrawingId
                  ? {
                      ...d,
                      startTime: startPos.startTime + deltaTime,
                      endTime: startPos.endTime + deltaTime,
                      startPrice: startPos.startPrice + deltaPrice,
                      endPrice: startPos.endPrice + deltaPrice,
                      targetPrice:
                        startPos.targetPrice !== undefined
                          ? startPos.targetPrice + deltaPrice
                          : undefined,
                      stopPrice:
                        startPos.stopPrice !== undefined
                          ? startPos.stopPrice + deltaPrice
                          : undefined,
                    }
                  : d
              )
            );
          }
          return;
        }
    },
    [
      draggedHandle,
      dragStartPos,
      selectedDrawingId,
      coordinateToTime,
      coordinateToPrice,
      currentPrice,
      isMagnetActive,
      timeToCoordinate,
      priceToCoordinate,
      drawings,
      isDrawingsLocked,
      pricePrecision,
      saveDrawings,
      getSafeScreenX,
      getSafeScreenY,
    ]
  );

  const processActiveHandleDragRef = useRef(processActiveHandleDrag);
  processActiveHandleDragRef.current = processActiveHandleDrag;

  // Global window listeners during active dragging to prevent premature drag cancellation (DEC-118)
  useEffect(() => {
    if (!draggedHandle) return;

    const onWindowMouseMove = (e: MouseEvent) => {
      if (e.target !== drawingCanvasRef.current) {
        processActiveHandleDragRef.current(e.clientX, e.clientY, e.shiftKey);
      }
    };

    const onWindowMouseUp = () => {
      if (draggedHandleRef.current) {
        if (preDragDrawingsRef.current !== null) {
          commitHistoryBaseline(preDragDrawingsRef.current, drawingsRef.current);
          preDragDrawingsRef.current = null;
        }
        draggedHandleRef.current = null;
        setDraggedHandle(null);
        setDragStartPos(null);
        dragStartPosRef.current = null;
      }
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [draggedHandle]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let effectiveTime =
      coordinateToTime(x) ||
      (barsRef.current.length > 0
        ? barsRef.current[barsRef.current.length - 1].time
        : Date.now());
    const clampedY = Math.max(0, Math.min(rect.height, y));
    let effectivePrice = coordinateToPrice(y) || coordinateToPrice(clampedY) || currentPrice || 0;

    if (isMagnetActive) {
      const snap = findNearestCandlePoint(
        x,
        y,
        barsRef.current,
        timeToCoordinate,
        priceToCoordinate,
        25
      );
      if (snap) {
        setSnappedPoint((prev) => {
          if (
            prev &&
            prev.time === snap.time &&
            prev.price === snap.price &&
            Math.abs(prev.x - snap.x) < 0.5 &&
            Math.abs(prev.y - snap.y) < 0.5
          ) {
            return prev;
          }
          return snap;
        });
        effectiveTime = snap.time;
        effectivePrice = snap.price;
      } else {
        setSnappedPoint((prev) => (prev === null ? prev : null));
      }
    } else {
      setSnappedPoint((prev) => (prev === null ? prev : null));
    }

    if (
      activeDrawingTool === "path" ||
      activeDrawingTool === "trend_fib" ||
      replayState === "SELECTING"
    ) {
      setMousePos((prev) => {
        if (prev && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5) return prev;
        return { x, y };
      });
    }

    // Brush freehand streaming (DEC-063)
    if (activeDrawingTool === "brush" && inFlightBrushPoints.length > 0) {
      setInFlightBrushPoints((prev) => [...prev, { time: effectiveTime, price: effectivePrice }]);
      return;
    }

    if (drawingStep === 1 && inFlightDrawing) {
      let finalTime = effectiveTime;
      let finalPrice = effectivePrice;

      if (e.shiftKey) {
        const anchorX = getSafeScreenX(inFlightDrawing.startTime);
        const anchorY = getSafeScreenY(inFlightDrawing.startPrice);

        if (
          inFlightDrawing.type === "trendline" ||
          inFlightDrawing.type === "fibonacci" ||
          inFlightDrawing.type === "date_range"
        ) {
          const snapped = calculateShiftAngleSnap(
            x,
            y,
            anchorX,
            anchorY,
            inFlightDrawing.startTime,
            inFlightDrawing.startPrice,
            coordinateToTime,
            coordinateToPrice
          );
          finalTime = snapped.time;
          finalPrice = snapped.price;
        } else if (inFlightDrawing.type === "rectangle" || inFlightDrawing.type === "gann_box") {
          const snapped = calculateShiftSquareSnap(
            x,
            y,
            anchorX,
            anchorY,
            inFlightDrawing.startTime,
            inFlightDrawing.startPrice,
            coordinateToTime,
            coordinateToPrice
          );
          finalTime = snapped.time;
          finalPrice = snapped.price;
        }
      }

      setInFlightDrawing((prev) =>
        prev ? { ...prev, endTime: finalTime, endPrice: finalPrice } : null
      );
      return;
    }

    const activeHandle = draggedHandle || draggedHandleRef.current;
    if (activeHandle && selectedDrawingId && (dragStartPos || dragStartPosRef.current)) {
      processActiveHandleDrag(e.clientX, e.clientY, e.shiftKey);
      return;
    }

    const hit = getHitTestResult(x, y);
    const isHit = hit !== null;
    const nextHandle = hit ? hit.handle : null;
    setIsHoveringDrawing((prev) => (prev === isHit ? prev : isHit));
    setHoveredHandle((prev) => (prev === nextHandle ? prev : nextHandle));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let effectiveTime =
      coordinateToTime(x) ||
      (barsRef.current.length > 0
        ? barsRef.current[barsRef.current.length - 1].time
        : Date.now());
    const clampedY = Math.max(0, Math.min(rect.height, y));
    let effectivePrice = coordinateToPrice(y) || coordinateToPrice(clampedY) || currentPrice || 0;

    if (isMagnetActive) {
      const snap = findNearestCandlePoint(
        x,
        y,
        barsRef.current,
        timeToCoordinate,
        priceToCoordinate,
        25
      );
      if (snap) {
        effectiveTime = snap.time;
        effectivePrice = snap.price;
      }
    }

    // Finalize freehand brush stroke (DEC-063)
    if (activeDrawingTool === "brush") {
      if (inFlightBrushPoints.length > 1) {
        const finished: ChartDrawing = {
          id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: "brush",
          points: [...inFlightBrushPoints],
          startTime: inFlightBrushPoints[0].time,
          endTime: inFlightBrushPoints[inFlightBrushPoints.length - 1].time,
          startPrice: inFlightBrushPoints[0].price,
          endPrice: inFlightBrushPoints[inFlightBrushPoints.length - 1].price,
          color: "#2962ff",
          lineWidth: 2.5,
          lineStyle: "solid",
          isLocked: isDrawingsLocked || false,
        };
        saveDrawings([...drawings, finished]);
        setSelectedDrawingId(finished.id);
      }
      setInFlightBrushPoints([]);
      setIsDrawing(false);
      return;
    }

    if (drawingStep === 1 && inFlightDrawing && dragStartPos) {
      const dist = Math.hypot(x - dragStartPos.x, y - dragStartPos.y);
      if (dist > 15) {
        const finished: ChartDrawing = {
          ...inFlightDrawing,
          endTime: effectiveTime,
          endPrice: effectivePrice,
        };
        saveDrawings([...drawings, finished]);
        setSelectedDrawingId(finished.id);
        setInFlightDrawing(null);
        setDrawingStep(0);
        setIsDrawing(false);
        setDragStartPos(null);
        onSelectDrawingTool?.("none");
        return;
      }
    }

    if (draggedHandle || draggedHandleRef.current) {
      if (preDragDrawingsRef.current !== null) {
        commitHistoryBaseline(preDragDrawingsRef.current, drawingsRef.current);
        preDragDrawingsRef.current = null;
      }
      draggedHandleRef.current = null;
      setDraggedHandle(null);
      setDragStartPos(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Finish in-flight path if active (DEC-047)
    if (activeDrawingTool === "path") {
      if (inFlightPathPoints.length >= 2) {
        const finishedDrawing: ChartDrawing = {
          id: `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: "path",
          points: [...inFlightPathPoints],
          startTime: inFlightPathPoints[0].time,
          endTime: inFlightPathPoints[inFlightPathPoints.length - 1].time,
          startPrice: inFlightPathPoints[0].price,
          endPrice: inFlightPathPoints[inFlightPathPoints.length - 1].price,
          color: "#2962ff",
          lineWidth: 2,
          lineStyle: "solid",
          isLocked: isDrawingsLocked || false,
        };
        saveDrawings([...drawings, finishedDrawing]);
        setSelectedDrawingId(finishedDrawing.id);
        setInFlightPathPoints([]);
        setMousePos(null);
        onSelectDrawingTool?.("none");
      }
      return;
    }

    // Double-click on existing drawing opens TradingView Settings Modal (DEC-048)
    const hit = getHitTestResult(x, y);
    if (hit) {
      setSelectedDrawingId(hit.drawing.id);
      setIsSettingsModalOpen(true);
    }
  };

  // Telemetry tape & Indicator HUD computations (DEC-034)
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const closes = bars.map((b) => b.close);
  const ema20Vals = closes.length >= 20 ? ta.ema(closes, 20) : [];
  const ema50Vals = closes.length >= 50 ? ta.ema(closes, 50) : [];
  const ema100Vals = closes.length >= 100 ? ta.ema(closes, 100) : [];
  const ema200Vals = closes.length >= 200 ? ta.ema(closes, 200) : [];
  const bbVals = closes.length >= 20 ? ta.bollingerbands(closes, 20, 2) : [];
  const rsiVals = closes.length >= rsiPeriod + 1 ? ta.rsi(closes, rsiPeriod) : [];
  const macdResults =
    closes.length >= macdSlow + macdSignal
      ? ta.macd(closes, macdFast, macdSlow, macdSignal)
      : [];

  const latestEma20 = ema20Vals.length > 0 ? ema20Vals[ema20Vals.length - 1] : null;
  const latestEma50 = ema50Vals.length > 0 ? ema50Vals[ema50Vals.length - 1] : null;
  const latestEma100 = ema100Vals.length > 0 ? ema100Vals[ema100Vals.length - 1] : null;
  const latestEma200 = ema200Vals.length > 0 ? ema200Vals[ema200Vals.length - 1] : null;
  const latestBb = bbVals.length > 0 ? bbVals[bbVals.length - 1] : null;
  const latestRsi = rsiVals.length > 0 ? rsiVals[rsiVals.length - 1] : null;
  const latestMacdObj = macdResults.length > 0 ? macdResults[macdResults.length - 1] : null;

  const displayBar = hoveredStats
    ? {
        open: hoveredStats.open,
        high: hoveredStats.high,
        low: hoveredStats.low,
        close: hoveredStats.close,
      }
    : lastBar;

  const displayEma20 = hoveredStats?.ema20 ?? latestEma20;
  const displayEma50 = hoveredStats?.ema50 ?? latestEma50;
  const displayEma100 = hoveredStats?.ema100 ?? latestEma100;
  const displayEma200 = hoveredStats?.ema200 ?? latestEma200;
  const displayBbUpper = hoveredStats?.bbUpper ?? latestBb?.upper;
  const displayBbMiddle = hoveredStats?.bbMiddle ?? latestBb?.middle;
  const displayBbLower = hoveredStats?.bbLower ?? latestBb?.lower;
  const displayRsi = hoveredStats?.rsi ?? latestRsi;
  const displayMacd = hoveredStats?.macd ?? latestMacdObj?.macd;
  const displayMacdSignal = hoveredStats?.macdSignal ?? latestMacdObj?.signal;
  const displayMacdHist = hoveredStats?.macdHist ?? latestMacdObj?.histogram;
  const displayVol = hoveredStats?.volume ?? lastBar?.volume;

  const isEmaHidden =
    hiddenIndicators.includes("EMA Ribbon Momentum Multi-Timeframe") ||
    hiddenIndicators.some((ind) => ind.toLowerCase().includes("ema"));
  const hasRibbonOrEma =
    (activeIndicators.includes("EMA Ribbon Momentum Multi-Timeframe") ||
      activeIndicators.some((ind) => ind.toLowerCase().includes("ema"))) &&
    !isEmaHidden;

  const isBollingerHidden =
    hiddenIndicators.includes("Bollinger Bands Squeeze Breakout") ||
    hiddenIndicators.some((ind) => ind.toLowerCase().includes("bollinger"));
  const hasBollinger =
    (activeIndicators.includes("Bollinger Bands Squeeze Breakout") ||
      activeIndicators.some((ind) => ind.toLowerCase().includes("bollinger"))) &&
    !isBollingerHidden;

  const isRsiHidden =
    hiddenIndicators.includes("RSI Divergence Engine Pro") ||
    hiddenIndicators.some((ind) => ind.toLowerCase().includes("rsi"));
  const hasRsi =
    (activeIndicators.includes("RSI Divergence Engine Pro") ||
      activeIndicators.some((ind) => ind.toLowerCase().includes("rsi"))) &&
    !isRsiHidden;

  const isMacdHidden =
    hiddenIndicators.includes("Zero-Lag MACD Histogram") ||
    hiddenIndicators.some((ind) => ind.toLowerCase().includes("macd"));
  const hasMacd =
    (activeIndicators.includes("Zero-Lag MACD Histogram") ||
      activeIndicators.some((ind) => ind.toLowerCase().includes("macd"))) &&
    !isMacdHidden;

  const isVolumeProfileHidden = hiddenIndicators.some(
    (ind) =>
      ind.toLowerCase().includes("volume profile") ||
      ind.toLowerCase().includes("poc")
  );
  const hasVolumeProfile =
    (activeIndicators.includes("Volume Profile & Dynamic Point of Control (POC)") ||
      activeIndicators.some(
        (ind) =>
          ind.toLowerCase().includes("volume profile") ||
          ind.toLowerCase().includes("poc")
      )) &&
    !isVolumeProfileHidden;

  const vpvrHudProfile = hasVolumeProfile
    ? calculateVisibleVolumeProfile(bars, vpvrRows, vpvrVaPercent / 100)
    : null;

  // Indicator structures hoisted above renderDrawingCanvas (DEC-119)

  // Drawing overlay interaction state (DEC-042, DEC-043 & DEC-073)
  const isInteracting =
    replayState === "SELECTING" ||
    isDrawingMode ||
    isDrawing ||
    drawingStep === 1 ||
    inFlightPathPoints.length > 0 ||
    inFlightTrendFibPoints.length > 0 ||
    draggedHandle !== null ||
    selectedDrawingId !== null ||
    isHoveringDrawing;

  const canvasCursor = (() => {
    if (replayState === "SELECTING") return "col-resize";
    if (isDrawingMode) return "crosshair";
    const h = draggedHandle || hoveredHandle;
    if (draggedHandle) {
      if (h && ["rect_ml", "rect_mr", "pos_width", "dr_start", "dr_end", "v_center"].includes(h)) return "ew-resize";
      if (h && ["rect_mt", "rect_mb", "pos_target", "pos_stop", "pos_entry", "h_center"].includes(h)) return "ns-resize";
      if (h && ["rect_tl", "rect_br"].includes(h)) return "nwse-resize";
      if (h && ["rect_tr", "rect_bl", "gann_bl", "gann_tr"].includes(h)) return "nesw-resize";
      return "grabbing";
    }
    if (h) {
      if (["rect_ml", "rect_mr", "pos_width", "dr_start", "dr_end", "v_center"].includes(h)) return "ew-resize";
      if (["rect_mt", "rect_mb", "pos_target", "pos_stop", "pos_entry", "h_center"].includes(h)) return "ns-resize";
      if (["rect_tl", "rect_br"].includes(h)) return "nwse-resize";
      if (["rect_tr", "rect_bl", "gann_bl", "gann_tr"].includes(h)) return "nesw-resize";
      if (["start", "end", "circle_center", "circle_radius"].includes(h) || h.startsWith("node_")) return "grab";
      return "grab";
    }
    return "default";
  })();

  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId);
  let floatingToolbarPos: { x: number; y: number } | null = null;
  if (selectedDrawing && !isDrawingsHidden) {
    if (
      (selectedDrawing.type === "path" || selectedDrawing.type === "trend_fib") &&
      selectedDrawing.points &&
      selectedDrawing.points.length > 0
    ) {
      const screenPts = selectedDrawing.points
        .map((pt) => ({ x: timeToCoordinate(pt.time), y: priceToCoordinate(pt.price) }))
        .filter((p) => p.x !== null && p.y !== null) as Array<{ x: number; y: number }>;
      if (screenPts.length > 0) {
        const minX = Math.min(...screenPts.map((p) => p.x));
        const maxX = Math.max(...screenPts.map((p) => p.x));
        const minY = Math.min(...screenPts.map((p) => p.y));
        const rect = drawingCanvasRef.current?.getBoundingClientRect();
        const width = rect?.width || 800;
        const top = Math.max(40, minY - 40);
        const left = Math.max(12, Math.min(width - 180, (minX + maxX) / 2 - 80));
        floatingToolbarPos = { x: left, y: top };
      }
    } else {
      const x1 = getSafeScreenX(selectedDrawing.startTime);
      const y1 = getSafeScreenY(selectedDrawing.startPrice);
      const x2 = getSafeScreenX(selectedDrawing.endTime);
      const y2 = getSafeScreenY(selectedDrawing.endPrice);
      if (y1 !== null) {
        const rect = drawingCanvasRef.current?.getBoundingClientRect();
        const width = rect?.width || 800;
        const validX1 = x1 !== null ? x1 : width / 2;
        const validX2 = x2 !== null ? x2 : width / 2;
        const validY2 = y2 !== null ? y2 : y1;
        let top = Math.max(40, Math.min(y1, validY2) - 40);

        // For position tools, ensure toolbar is positioned above the topmost boundary line (DEC-100, DEC-118)
        if (selectedDrawing.type === "long_position" || selectedDrawing.type === "short_position") {
          const isLong = selectedDrawing.type === "long_position";
          const tp =
            selectedDrawing.targetPrice !== undefined
              ? selectedDrawing.targetPrice
              : isLong
              ? selectedDrawing.startPrice * 1.02
              : selectedDrawing.startPrice * 0.98;
          const sl =
            selectedDrawing.stopPrice !== undefined
              ? selectedDrawing.stopPrice
              : isLong
              ? selectedDrawing.startPrice * 0.99
              : selectedDrawing.startPrice * 1.01;
          const ytp = getSafeScreenY(tp);
          const ysl = getSafeScreenY(sl);
          const candidates = [y1];
          if (ytp !== null) candidates.push(ytp);
          if (ysl !== null) candidates.push(ysl);
          const highestY = Math.min(...candidates);
          const lowestY = Math.max(...candidates);
          const height = rect?.height || 600;
          if (highestY > 52) {
            top = highestY - 42;
          } else {
            top = Math.min(height - 50, lowestY + 16);
          }
        }

        const left = Math.max(12, Math.min(width - 180, (validX1 + validX2) / 2 - 80));
        floatingToolbarPos = { x: left, y: top };
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-surface flex flex-col overflow-hidden select-none"
    >
      {/* Sub-Toolbar: OHLC Tape + Dynamic Indicator HUD (DEC-034) */}
      <div className="h-8 border-b border-border bg-surface-container-lowest px-3 flex items-center justify-between text-xs font-mono shrink-0">
        {/* Left: Real-time OHLC Statistics */}
        <div className="flex items-center gap-3 text-[11px] overflow-hidden">
          {displayBar && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-muted">
                O <span className="text-on-surface">{pricePrecision.formatPrice(displayBar.open)}</span>
              </span>
              <span className="text-muted">
                H <span className="text-secondary">{pricePrecision.formatPrice(displayBar.high)}</span>
              </span>
              <span className="text-muted">
                L <span className="text-tertiary">{pricePrecision.formatPrice(displayBar.low)}</span>
              </span>
              <span className="text-muted">
                C{" "}
                <span className="text-on-surface font-semibold">
                  {pricePrecision.formatPrice(displayBar.close)}
                </span>
              </span>
            </div>
          )}

          {/* Indicator HUD Legend */}
          <div className="hidden lg:flex items-center gap-3 pl-3 border-l border-border shrink-0">
            {hasRibbonOrEma && (
              <>
                <div className="flex items-center gap-1.5 text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>EMA 20</span>
                  <span className="text-on-surface">
                    {displayEma20 !== null && displayEma20 !== undefined
                      ? pricePrecision.formatPrice(displayEma20)
                      : "—"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[#2962ff]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff]" />
                  <span>EMA 50</span>
                  <span className="text-on-surface">
                    {displayEma50 !== null && displayEma50 !== undefined
                      ? pricePrecision.formatPrice(displayEma50)
                      : "—"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[#f5ac37]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f5ac37]" />
                  <span>EMA 100</span>
                  <span className="text-on-surface">
                    {displayEma100 !== null && displayEma100 !== undefined
                      ? pricePrecision.formatPrice(displayEma100)
                      : "—"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[#ff7043]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff7043]" />
                  <span>EMA 200</span>
                  <span className="text-on-surface">
                    {displayEma200 !== null && displayEma200 !== undefined
                      ? pricePrecision.formatPrice(displayEma200)
                      : "—"}
                  </span>
                </div>
              </>
            )}

            {hasBollinger && (
              <>
                <div className="flex items-center gap-1.5 text-[#2962ff]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff]" />
                  <span>BB Up</span>
                  <span className="text-on-surface">
                    {displayBbUpper !== null && displayBbUpper !== undefined
                      ? pricePrecision.formatPrice(displayBbUpper)
                      : "—"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-gold">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                  <span>BB Mid</span>
                  <span className="text-on-surface">
                    {displayBbMiddle !== null && displayBbMiddle !== undefined
                      ? pricePrecision.formatPrice(displayBbMiddle)
                      : "—"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[#2962ff]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff]" />
                  <span>BB Low</span>
                  <span className="text-on-surface">
                    {displayBbLower !== null && displayBbLower !== undefined
                      ? pricePrecision.formatPrice(displayBbLower)
                      : "—"}
                  </span>
                </div>
              </>
            )}

            <div className="flex items-center gap-1.5 text-muted">
              <span>Vol</span>
              <span className="text-on-surface">
                {displayVol !== undefined
                  ? displayVol >= 1000
                    ? `${(displayVol / 1000).toFixed(1)}K`
                    : displayVol.toFixed(2)
                  : "—"}
              </span>
            </div>

            {customIndicatorData && (() => {
              const isNamedHidden = customIndicatorData.name
                ? hiddenIndicators.includes(customIndicatorData.name)
                : false;
              const isEffectivelyHidden = isCustomIndicatorHidden || isNamedHidden;
              return (
                <div
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors ${
                    isEffectivelyHidden
                      ? "bg-surface-container-low text-muted border-outline-variant/30 opacity-70"
                      : "bg-primary-container/15 text-primary border-primary/30"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isEffectivelyHidden ? "bg-muted" : "bg-primary animate-pulse"
                    }`}
                  />
                  <span className={`font-semibold ${isEffectivelyHidden ? "line-through text-muted" : ""}`}>
                    {customIndicatorData.name}
                  </span>
                  {customScriptBoxes && customScriptBoxes.length > 0 && (
                    <span className="text-[10px] text-muted font-normal">
                      ({customScriptBoxes.length} {customScriptBoxes.length === 1 ? "zone" : "zones"})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomIndicatorHidden((prev) => !prev);
                      if (customIndicatorData.name && onToggleIndicatorVisibility) {
                        onToggleIndicatorVisibility(customIndicatorData.name);
                      }
                    }}
                    title={isEffectivelyHidden ? "Show custom indicator" : "Hide custom indicator"}
                    className="text-muted hover:text-on-surface ml-0.5 cursor-pointer"
                  >
                    {isEffectivelyHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                  {onClearCustomIndicator && (
                    <button
                      type="button"
                      onClick={onClearCustomIndicator}
                      title="Remove custom indicator from chart"
                      className="text-muted hover:text-tertiary ml-0.5 cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              );
            })()}

            {hasFvgIndicator && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-[10px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00c087] animate-pulse" />
                <span className="font-semibold text-on-surface">FVG 0% Hit:</span>
                <span className="text-[#00c087] font-bold">{bullFvgCount} Bull</span>
                <span>·</span>
                <span className="text-[#ff3b30] font-bold">{bearFvgCount} Bear</span>
              </div>
            )}

            {hasMarketStructure && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-[10px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff] animate-pulse" />
                <span className="font-semibold text-on-surface">
                  Structure ({marketStructureSettings.majorLength}, {marketStructureSettings.subLength})
                </span>
                <div className="flex items-center gap-1 ml-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      const updated = {
                        ...marketStructureSettings,
                        showMajor: !marketStructureSettings.showMajor,
                      };
                      saveMarketStructureSettings(updated);
                      setMarketStructureSettings(updated);
                    }}
                    title={
                      marketStructureSettings.showMajor
                        ? "Hide True Market Structure (Major)"
                        : "Show True Market Structure (Major)"
                    }
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold transition-all cursor-pointer ${
                      marketStructureSettings.showMajor
                        ? "bg-[#2962ff]/20 text-[#2962ff] border border-[#2962ff]/50"
                        : "bg-surface-container-high text-muted/60 border border-border line-through"
                    }`}
                  >
                    Major
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = {
                        ...marketStructureSettings,
                        showSubstructure: !marketStructureSettings.showSubstructure,
                      };
                      saveMarketStructureSettings(updated);
                      setMarketStructureSettings(updated);
                    }}
                    title={
                      marketStructureSettings.showSubstructure
                        ? "Hide Substructure"
                        : "Show Substructure"
                    }
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold transition-all cursor-pointer ${
                      marketStructureSettings.showSubstructure
                        ? "bg-purple-500/20 text-purple-400 border border-purple-500/50"
                        : "bg-surface-container-high text-muted/60 border border-border line-through"
                    }`}
                  >
                    Sub
                  </button>
                </div>
                {marketStructureResult && (
                  <span className="text-muted text-[9px]">
                    ({marketStructureResult.majorSwings.length}S · {marketStructureResult.breakouts.length}B)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onToggleIndicatorVisibility?.("True Market Structure & Substructure")}
                  title={isMarketStructureHidden ? "Show Structure" : "Hide Structure"}
                  className="text-muted hover:text-on-surface p-0.5 cursor-pointer ml-0.5"
                >
                  {isMarketStructureHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsMarketStructureModalOpen(true)}
                  title="Structure Settings"
                  className="text-muted hover:text-on-surface p-0.5 cursor-pointer"
                >
                  <Settings size={11} />
                </button>
                {onToggleIndicator && (
                  <button
                    type="button"
                    onClick={() => onToggleIndicator("True Market Structure & Substructure")}
                    title="Remove Structure from chart"
                    className="text-muted hover:text-error p-0.5 cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )}

            {hasCandleStructure && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-[10px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00c087] animate-pulse" />
                <span className="font-semibold text-on-surface">
                  Candle Structure ({candleStructureSettings.flankBars === 1 ? "3-Bar" : `${candleStructureSettings.flankBars * 2 + 1}-Bar`})
                </span>
                {candleStructureResult && (
                  <span className="text-muted text-[9px]">
                    ({candleStructureResult.swings.length}S · {candleStructureResult.breaks.length} Breaks)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onToggleIndicatorVisibility?.("Candlestick Market Structure (Price Action)")}
                  title={isCandleStructureHidden ? "Show Candle Structure" : "Hide Candle Structure"}
                  className="text-muted hover:text-on-surface p-0.5 cursor-pointer ml-0.5"
                >
                  {isCandleStructureHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCandleStructureModalOpen(true)}
                  title="Candle Structure Settings"
                  className="text-muted hover:text-on-surface p-0.5 cursor-pointer"
                >
                  <Settings size={11} />
                </button>
                {onToggleIndicator && (
                  <button
                    type="button"
                    onClick={() => onToggleIndicator("Candlestick Market Structure (Price Action)")}
                    title="Remove Candle Structure from chart"
                    className="text-muted hover:text-error p-0.5 cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Real-time Telemetry Status, Quick-Trade & VPVR Toggle */}
        <div className="flex items-center gap-2 text-[11px] text-muted shrink-0">
          {/* Quick Paper Trade Buttons (DEC-072) */}
          <div className="flex items-center gap-1 bg-surface-container-low p-0.5 rounded border border-border">
            <button
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("mochex:execute-paper-order", {
                    detail: {
                      order: {
                        symbol,
                        side: "long",
                        orderType: "market",
                        marginAmountUsdt: 1000,
                        leverage: 5,
                      },
                    },
                  })
                );
              }}
              title="1-Click Paper Market Buy / Long ($1,000 Margin · 5x)"
              className="px-1.5 py-0.5 rounded bg-[#00c087]/20 hover:bg-[#00c087] text-[#00c087] hover:text-[#06121c] border border-[#00c087]/40 text-[10px] font-bold transition-colors cursor-pointer"
            >
              BUY MKT
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("mochex:execute-paper-order", {
                    detail: {
                      order: {
                        symbol,
                        side: "short",
                        orderType: "market",
                        marginAmountUsdt: 1000,
                        leverage: 5,
                      },
                    },
                  })
                );
              }}
              title="1-Click Paper Market Sell / Short ($1,000 Margin · 5x)"
              className="px-1.5 py-0.5 rounded bg-[#ff3b30]/20 hover:bg-[#ff3b30] text-[#ff3b30] hover:text-white border border-[#ff3b30]/40 text-[10px] font-bold transition-colors cursor-pointer"
            >
              SELL MKT
            </button>
          </div>

          {onToggleIndicator && (
            <button
              onClick={() =>
                onToggleIndicator("Volume Profile & Dynamic Point of Control (POC)")
              }
              title="Toggle Visible Range Volume Profile (VPVR · POC / VAH / VAL)"
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold transition-colors cursor-pointer ${
                hasVolumeProfile
                  ? "bg-gold/15 text-gold border-gold/40"
                  : "bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border-border"
              }`}
            >
              <BarChart2 size={11} />
              <span>VPVR</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <Activity
              size={12}
              className={`${
                feedMode === "ws" ? "text-secondary" : "text-primary"
              } animate-pulse`}
            />
            <span className="hidden sm:inline">
              {feedMode === "ws" ? "MEXC V3 WebSocket Live" : "MEXC Live (2.5s Polling)"}
            </span>
          </div>

          <div className="flex items-center gap-1 text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
            <ShieldCheck size={11} />
            <span className="text-[10px] font-semibold">60 FPS Lightweight Charts</span>
          </div>
        </div>
      </div>

      {/* Main Chart Workspace Area */}
      <div
        className="flex-1 relative w-full h-full"
      >
        {hasLibrary ? (
          <div id="tv_chart_container" className="w-full h-full" />
        ) : (
          <div
            id={isActivePane ? "active-chart-container" : undefined}
            data-chart-container="true"
            data-active-pane={isActivePane ? "true" : "false"}
            className="w-full h-full relative"
            onMouseMove={handleContainerMouseMove}
          >
            {/* Lightweight Charts DOM Mount Container */}
            <div
              ref={chartMountRef}
              className="w-full h-full absolute inset-0 cursor-crosshair"
            />

            {/* Interactive Drawing Overlay Canvas (DEC-040 & DEC-042) */}
            <canvas
              ref={drawingCanvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDoubleClick={handleDoubleClick}
              onMouseLeave={() => {
                setSnappedPoint(null);
                setIsHoveringDrawing(false);
                setHoveredHandle(null);
                setMousePos(null);
                renderDrawingCanvas();
              }}
              className="w-full h-full absolute inset-0 z-10"
              style={{
                pointerEvents: isInteracting ? "auto" : "none",
                cursor: canvasCursor,
              }}
            />

            {/* Floating Action Pill for Selected Drawing (DEC-043, DEC-048 & DEC-118) */}
            {selectedDrawing && floatingToolbarPos && !isDrawingsHidden && (
              <div
                style={{
                  top: floatingToolbarPos.y,
                  left: floatingToolbarPos.x,
                  pointerEvents: (draggedHandle || draggedHandleRef.current) ? "none" : "auto",
                }}
                className={`absolute z-30 flex items-center gap-1.5 bg-surface-container-lowest/95 border border-border px-2 py-1 rounded-md shadow-xl backdrop-blur-md text-xs font-mono select-none ${
                  (draggedHandle || draggedHandleRef.current) ? "opacity-30 pointer-events-none" : ""
                }`}
              >
                {/* 1-Click Execute Paper Trade from Long/Short Position Drawing (DEC-072) */}
                {(selectedDrawing.type === "long_position" ||
                  selectedDrawing.type === "short_position") && (
                  <button
                    onClick={() => {
                      const orderInput = createOrderInputFromDrawing(
                        selectedDrawing,
                        symbol,
                        currentPrice || selectedDrawing.startPrice,
                        5
                      );
                      if (orderInput) {
                        window.dispatchEvent(
                          new CustomEvent("mochex:execute-paper-order", {
                            detail: { order: orderInput },
                          })
                        );
                      }
                    }}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] cursor-pointer transition-colors ${
                      selectedDrawing.type === "long_position"
                        ? "bg-[#00c087]/20 hover:bg-[#00c087] text-[#00c087] hover:text-[#06121c] border border-[#00c087]/40"
                        : "bg-[#ff3b30]/20 hover:bg-[#ff3b30] text-[#ff3b30] hover:text-white border border-[#ff3b30]/40"
                    }`}
                    title="Execute Paper Trade with this Position Drawing's Entry, TP & SL"
                  >
                    <Play size={10} />
                    <span>Trade</span>
                  </button>
                )}

                {/* Settings button */}
                <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer"
                  title="Drawing Settings"
                >
                  <Settings2 size={13} />
                </button>

                {/* Add Crossing Alert button (DEC-069) */}
                <button
                  onClick={() => {
                    const newAlerts = createAlertsFromDrawing(selectedDrawing, symbol);
                    window.dispatchEvent(
                      new CustomEvent("mochex:create-drawing-alert", {
                        detail: { alerts: newAlerts },
                      })
                    );
                  }}
                  className={`p-1 rounded cursor-pointer transition-colors ${
                    activeAlerts.some((a) => a.drawingId === selectedDrawing.id && a.active)
                      ? "text-gold bg-gold/15"
                      : "text-muted hover:text-gold hover:bg-surface"
                  }`}
                  title="Add Crossing Alert on Drawing"
                >
                  <BellPlus size={13} />
                </button>

                {/* Color cycle button */}
                <button
                  onClick={() => {
                    const nextColor =
                      DRAWING_COLORS[
                        (DRAWING_COLORS.indexOf(selectedDrawing.color || "#2962ff") + 1) %
                          DRAWING_COLORS.length
                      ];
                    saveDrawings(
                      drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, color: nextColor } : d
                      )
                    );
                  }}
                  className="flex items-center gap-1 p-1 hover:bg-surface rounded text-muted hover:text-on-surface cursor-pointer"
                  title="Cycle Color"
                >
                  <span
                    className="w-3 h-3 rounded-full border border-border"
                    style={{ backgroundColor: selectedDrawing.color || "#2962ff" }}
                  />
                </button>

                {/* Lock / Unlock button */}
                <button
                  onClick={() => {
                    saveDrawings(
                      drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, isLocked: !d.isLocked } : d
                      )
                    );
                  }}
                  className={`p-1 rounded cursor-pointer transition-colors ${
                    selectedDrawing.isLocked
                      ? "text-gold bg-gold/10"
                      : "text-muted hover:text-on-surface hover:bg-surface"
                  }`}
                  title={selectedDrawing.isLocked ? "Unlock Drawing" : "Lock Drawing"}
                >
                  {selectedDrawing.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>

                {/* Clone / Duplicate button (DEC-070) */}
                <button
                  onClick={() => {
                    const cloned = cloneDrawingObject(
                      selectedDrawing,
                      getResolutionMs(resolution) * 3
                    );
                    saveDrawings([...drawings, cloned]);
                    setSelectedDrawingId(cloned.id);
                  }}
                  className="p-1 rounded text-muted hover:text-primary hover:bg-surface cursor-pointer transition-colors"
                  title="Clone / Duplicate Drawing (Ctrl+D)"
                >
                  <Copy size={13} />
                </button>

                {/* Hide Layer button (DEC-070) */}
                <button
                  onClick={() => {
                    saveDrawings(
                      drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, isHidden: true } : d
                      )
                    );
                    setSelectedDrawingId(null);
                  }}
                  className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer transition-colors"
                  title="Hide Drawing Layer (Manage in Object Tree)"
                >
                  <EyeOff size={13} />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => {
                    if (!selectedDrawing.isLocked) {
                      saveDrawings(drawings.filter((d) => d.id !== selectedDrawing.id));
                      setSelectedDrawingId(null);
                    }
                  }}
                  className={`p-1 rounded cursor-pointer transition-colors ${
                    selectedDrawing.isLocked
                      ? "opacity-30 cursor-not-allowed"
                      : "text-muted hover:text-tertiary hover:bg-tertiary/10"
                  }`}
                  title="Delete Drawing (Del)"
                  disabled={selectedDrawing.isLocked}
                >
                  <Trash2 size={13} />
                </button>

                {/* Deselect button */}
                <button
                  onClick={() => setSelectedDrawingId(null)}
                  className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface cursor-pointer"
                  title="Deselect"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* TradingView 3-Tab Drawing Settings Modal (DEC-048) */}
            <DrawingSettingsModal
              isOpen={isSettingsModalOpen}
              onClose={() => setIsSettingsModalOpen(false)}
              drawing={selectedDrawing || null}
              onUpdateDrawing={(updated) => {
                saveDrawings(drawingsRef.current.map((d) => (d.id === updated.id ? updated : d)));
              }}
              onDeleteDrawing={(id) => {
                saveDrawings(drawingsRef.current.filter((d) => d.id !== id));
                setSelectedDrawingId(null);
                setIsSettingsModalOpen(false);
              }}
            />

            {/* TradingView Market Structure Settings Modal */}
            <MarketStructureSettingsModal
              isOpen={isMarketStructureModalOpen}
              onClose={() => setIsMarketStructureModalOpen(false)}
              settings={marketStructureSettings}
              onSaveSettings={(newSettings) => {
                saveMarketStructureSettings(newSettings);
                setMarketStructureSettings(newSettings);
              }}
            />

            {/* Candlestick Market Structure Settings Modal */}
            <CandleStructureSettingsModal
              isOpen={isCandleStructureModalOpen}
              onClose={() => setIsCandleStructureModalOpen(false)}
              settings={candleStructureSettings}
              onSaveSettings={(newSettings) => {
                saveCandleStructureSettings(newSettings);
                setCandleStructureSettings(newSettings);
              }}
            />

            {/* TradingView Floating Draggable Favorites Toolbar (DEC-064) */}
            {showFavoritesBar && favoriteTools && favoriteTools.length > 0 && (
              <FavoritesToolbar
                favoriteTools={favoriteTools}
                activeTool={activeDrawingTool}
                onSelectTool={onSelectDrawingTool || (() => {})}
                onClose={onToggleFavoritesBar || (() => {})}
              />
            )}

            {/* Floating In-Pane Header Badges (DEC-038) */}
            <div className="absolute top-2 left-2 z-20 flex flex-col gap-1.5 pointer-events-none">
              {hasRsi && (
                <div className="pointer-events-auto flex items-center gap-2 bg-surface-container-lowest/90 border border-border px-2.5 py-1 rounded text-[11px] font-mono shadow-sm backdrop-blur-xs">
                  <span className="w-2 h-2 rounded-full bg-[#9353d3]" />
                  <span className="font-semibold text-on-surface">RSI ({rsiPeriod})</span>
                  <span className="text-[#9353d3] font-semibold">
                    {displayRsi !== null && displayRsi !== undefined ? displayRsi.toFixed(2) : "—"}
                  </span>
                  <div className="flex items-center gap-1 pl-1.5 border-l border-border text-muted">
                    <button
                      onClick={() =>
                        setActiveSettingsModal(
                          activeSettingsModal === "rsi" ? null : "rsi"
                        )
                      }
                      className="hover:text-primary transition-colors p-0.5 rounded cursor-pointer"
                      title="Configure RSI"
                    >
                      <Settings size={12} />
                    </button>
                    {onToggleIndicator && (
                      <button
                        onClick={() => onToggleIndicator("RSI Divergence Engine Pro")}
                        className="hover:text-tertiary transition-colors p-0.5 rounded cursor-pointer"
                        title="Remove RSI Pane"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {hasMacd && (
                <div className="pointer-events-auto flex items-center gap-2 bg-surface-container-lowest/90 border border-border px-2.5 py-1 rounded text-[11px] font-mono shadow-sm backdrop-blur-xs">
                  <span className="w-2 h-2 rounded-full bg-[#2962ff]" />
                  <span className="font-semibold text-on-surface">
                    MACD ({macdFast}, {macdSlow}, {macdSignal})
                  </span>
                  <span className="text-[#2962ff]">
                    {displayMacd !== null && displayMacd !== undefined
                      ? displayMacd.toFixed(2)
                      : "—"}
                  </span>
                  <span className="text-gold">
                    {displayMacdSignal !== null && displayMacdSignal !== undefined
                      ? displayMacdSignal.toFixed(2)
                      : "—"}
                  </span>
                  <span
                    className={
                      displayMacdHist !== null && displayMacdHist !== undefined
                        ? displayMacdHist >= 0
                          ? "text-secondary font-semibold"
                          : "text-tertiary font-semibold"
                        : "text-muted"
                    }
                  >
                    {displayMacdHist !== null && displayMacdHist !== undefined
                      ? displayMacdHist >= 0
                        ? `+${displayMacdHist.toFixed(2)}`
                        : displayMacdHist.toFixed(2)
                      : "—"}
                  </span>
                  <div className="flex items-center gap-1 pl-1.5 border-l border-border text-muted">
                    <button
                      onClick={() =>
                        setActiveSettingsModal(
                          activeSettingsModal === "macd" ? null : "macd"
                        )
                      }
                      className="hover:text-primary transition-colors p-0.5 rounded cursor-pointer"
                      title="Configure MACD"
                    >
                      <Settings size={12} />
                    </button>
                    {onToggleIndicator && (
                      <button
                        onClick={() => onToggleIndicator("Zero-Lag MACD Histogram")}
                        className="hover:text-tertiary transition-colors p-0.5 rounded cursor-pointer"
                        title="Remove MACD Pane"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}
              {hasVolumeProfile && (
                <div className="pointer-events-auto flex items-center gap-2 bg-surface-container-lowest/90 border border-border px-2.5 py-1 rounded text-[11px] font-mono shadow-sm backdrop-blur-xs">
                  <span className="w-2 h-2 rounded-full bg-gold" />
                  <span className="font-semibold text-on-surface">
                    VPVR ({vpvrRows} rows, {vpvrVaPercent}% VA)
                  </span>
                  {vpvrHudProfile && (
                    <>
                      <span className="text-gold font-semibold">
                        POC ${pricePrecision.formatPrice(vpvrHudProfile.pocPrice)}
                      </span>
                      <span className="text-[#2962ff]">
                        VAH ${pricePrecision.formatPrice(vpvrHudProfile.vahPrice)}
                      </span>
                      <span className="text-[#2962ff]">
                        VAL ${pricePrecision.formatPrice(vpvrHudProfile.valPrice)}
                      </span>
                    </>
                  )}
                  <div className="flex items-center gap-1 pl-1.5 border-l border-border text-muted">
                    <button
                      onClick={() =>
                        setActiveSettingsModal(
                          activeSettingsModal === "vpvr" ? null : "vpvr"
                        )
                      }
                      className="hover:text-primary transition-colors p-0.5 rounded cursor-pointer"
                      title="Configure Volume Profile (VPVR)"
                    >
                      <Settings size={12} />
                    </button>
                    {onToggleIndicator && (
                      <button
                        onClick={() =>
                          onToggleIndicator(
                            "Volume Profile & Dynamic Point of Control (POC)"
                          )
                        }
                        className="hover:text-tertiary transition-colors p-0.5 rounded cursor-pointer"
                        title="Remove Volume Profile"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {strategyResult && strategyResult.equityCurve.length > 0 && (() => {
                const isProfitable = strategyResult.netProfit >= 0;
                const eqMetrics = buildStrategyEquitySeriesData(
                  strategyResult.equityCurve,
                  bars,
                  strategyResult.initialCapital
                );
                const latestPt =
                  strategyResult.equityCurve[strategyResult.equityCurve.length - 1];
                const displayEq = hoveredStats?.strategyEquity ?? latestPt?.equity ?? strategyResult.endingEquity;
                const displayBh = hoveredStats?.buyAndHoldEquity;
                const displayDd =
                  hoveredStats?.strategyDrawdown !== undefined
                    ? Math.abs(hoveredStats.strategyDrawdown)
                    : latestPt?.drawdownPercent ?? 0;

                return (
                  <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-surface-container-lowest/95 border border-border px-2.5 py-1 rounded text-[11px] font-mono shadow-md backdrop-blur-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isProfitable ? "bg-secondary" : "bg-tertiary"
                      }`}
                    />
                    <span className="font-semibold text-on-surface">
                      {strategyName || "Pine Strategy"}
                    </span>
                    <span
                      className={
                        isProfitable
                          ? "text-secondary font-semibold"
                          : "text-tertiary font-semibold"
                      }
                    >
                      {isProfitable ? "+" : ""}${strategyResult.netProfit.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      ({isProfitable ? "+" : ""}
                      {strategyResult.netProfitPercent.toFixed(2)}%)
                    </span>
                    <span
                      className={
                        eqMetrics.alphaPercent >= 0 ? "text-cyan" : "text-muted"
                      }
                      title="Strategy Alpha vs. Buy & Hold Benchmark"
                    >
                      α {eqMetrics.alphaPercent >= 0 ? "+" : ""}
                      {eqMetrics.alphaPercent.toFixed(1)}%
                    </span>
                    <span className="text-on-surface">
                      Eq ${displayEq.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    {displayBh !== undefined && showBuyHoldBenchmark && (
                      <span className="text-gold">
                        B&amp;H ${displayBh.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    <span className="text-tertiary">
                      DD -{displayDd.toFixed(2)}% (Max -{strategyResult.maxDrawdownPercent.toFixed(1)}%)
                    </span>

                    {/* Layer Toggle Pills */}
                    <div className="flex items-center gap-1 pl-1.5 border-l border-border">
                      <button
                        onClick={() => setShowStrategyPane((p) => !p)}
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold border cursor-pointer transition-colors ${
                          showStrategyPane
                            ? "bg-primary-container/25 text-primary border-primary/40"
                            : "bg-surface text-muted border-border"
                        }`}
                        title="Toggle Strategy Equity Sub-Pane"
                      >
                        Pane
                      </button>
                      <button
                        onClick={() => setShowBuyHoldBenchmark((p) => !p)}
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold border cursor-pointer transition-colors ${
                          showBuyHoldBenchmark
                            ? "bg-gold/20 text-gold border-gold/40"
                            : "bg-surface text-muted border-border"
                        }`}
                        title="Toggle Buy & Hold Benchmark Curve"
                      >
                        B&amp;H
                      </button>
                      <button
                        onClick={() => setShowUnderwaterDrawdown((p) => !p)}
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold border cursor-pointer transition-colors ${
                          showUnderwaterDrawdown
                            ? "bg-tertiary/20 text-tertiary border-tertiary/40"
                            : "bg-surface text-muted border-border"
                        }`}
                        title="Toggle Underwater Drawdown Histogram"
                      >
                        DD%
                      </button>
                      <button
                        onClick={() => setShowTradeConnectors((p) => !p)}
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold border cursor-pointer transition-colors ${
                          showTradeConnectors
                            ? "bg-secondary/20 text-secondary border-secondary/40"
                            : "bg-surface text-muted border-border"
                        }`}
                        title="Toggle On-Chart Trade Entry-to-Exit Connectors"
                      >
                        Lines ({trades.length})
                      </button>
                      {onClearStrategy && (
                        <button
                          onClick={onClearStrategy}
                          className="text-muted hover:text-tertiary transition-colors p-0.5 rounded cursor-pointer"
                          title="Clear Strategy Overlay"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Quick Parameter Tuning Modal (DEC-038 & DEC-071) */}
            {activeSettingsModal && (
              <div className="absolute top-12 left-2 z-30 bg-surface-container-low border border-border p-3 rounded-lg shadow-xl font-mono text-xs w-64 backdrop-blur-md">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                  <span className="font-semibold text-on-surface uppercase">
                    {activeSettingsModal === "rsi"
                      ? "RSI Parameters"
                      : activeSettingsModal === "macd"
                      ? "MACD Parameters"
                      : "VPVR Parameters"}
                  </span>
                  <button
                    onClick={() => setActiveSettingsModal(null)}
                    className="text-muted hover:text-on-surface p-0.5 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </div>

                {activeSettingsModal === "vpvr" && (
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center justify-between text-muted text-[11px]">
                      <span>Row Layout (12–80):</span>
                      <input
                        type="number"
                        min="8"
                        max="80"
                        value={vpvrRows}
                        onChange={(e) =>
                          setVpvrRows(Math.max(8, Math.min(80, parseInt(e.target.value) || 24)))
                        }
                        className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-right text-on-surface"
                      />
                    </label>
                    <label className="flex items-center justify-between text-muted text-[11px]">
                      <span>Value Area % (70):</span>
                      <input
                        type="number"
                        min="50"
                        max="95"
                        value={vpvrVaPercent}
                        onChange={(e) =>
                          setVpvrVaPercent(
                            Math.max(50, Math.min(95, parseInt(e.target.value) || 70))
                          )
                        }
                        className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-right text-on-surface"
                      />
                    </label>
                  </div>
                )}

                {activeSettingsModal === "rsi" && (
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center justify-between text-muted text-[11px]">
                      <span>RSI Period:</span>
                      <input
                        type="number"
                        min="2"
                        max="100"
                        value={rsiPeriod}
                        onChange={(e) =>
                          setRsiPeriod(Math.max(2, parseInt(e.target.value) || 14))
                        }
                        className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-right text-on-surface"
                      />
                    </label>
                    <label className="flex items-center justify-between text-muted text-[11px]">
                      <span>Overbought (70):</span>
                      <input
                        type="number"
                        min="50"
                        max="95"
                        value={rsiOverbought}
                        onChange={(e) =>
                          setRsiOverbought(parseInt(e.target.value) || 70)
                        }
                        className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-right text-on-surface"
                      />
                    </label>
                    <label className="flex items-center justify-between text-muted text-[11px]">
                      <span>Oversold (30):</span>
                      <input
                        type="number"
                        min="5"
                        max="50"
                        value={rsiOversold}
                        onChange={(e) =>
                          setRsiOversold(parseInt(e.target.value) || 30)
                        }
                        className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-right text-on-surface"
                      />
                    </label>
                  </div>
                )}

                {activeSettingsModal === "macd" && (
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center justify-between text-muted text-[11px]">
                      <span>Fast Length:</span>
                      <input
                        type="number"
                        min="2"
                        max="50"
                        value={macdFast}
                        onChange={(e) =>
                          setMacdFast(Math.max(2, parseInt(e.target.value) || 12))
                        }
                        className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-right text-on-surface"
                      />
                    </label>
                    <label className="flex items-center justify-between text-muted text-[11px]">
                      <span>Slow Length:</span>
                      <input
                        type="number"
                        min="5"
                        max="100"
                        value={macdSlow}
                        onChange={(e) =>
                          setMacdSlow(Math.max(5, parseInt(e.target.value) || 26))
                        }
                        className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-right text-on-surface"
                      />
                    </label>
                    <label className="flex items-center justify-between text-muted text-[11px]">
                      <span>Signal Smoothing:</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={macdSignal}
                        onChange={(e) =>
                          setMacdSignal(Math.max(1, parseInt(e.target.value) || 9))
                        }
                        className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-right text-on-surface"
                      />
                    </label>
                  </div>
                )}

                <div className="mt-3 pt-2 border-t border-border flex justify-end">
                  <button
                    onClick={() => setActiveSettingsModal(null)}
                    className="px-2.5 py-1 rounded bg-primary text-on-primary font-semibold text-[11px] hover:bg-primary-hover cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* TradingView-Style Historical Depth & Quick-Range Bar (DEC-076, DEC-117) */}
            <div
              ref={quickRangeBarRef}
              style={
                quickRangePos
                  ? { left: `${quickRangePos.x}px`, top: `${quickRangePos.y}px`, bottom: "auto" }
                  : { left: "64px", bottom: "28px" }
              }
              className="absolute z-20 hidden sm:flex items-center gap-1 bg-[#12161f]/95 border border-outline-variant/40 px-2 py-1 rounded-md text-[10px] font-mono backdrop-blur-md shadow-lg select-none"
            >
              {/* Drag Handle Grip (DEC-117) */}
              <div
                onMouseDown={handleMouseDownQuickRangeGrip}
                onDoubleClick={() => {
                  setQuickRangePos(null);
                  try {
                    localStorage.removeItem("mochex:quick_range_pos");
                  } catch {}
                }}
                title="Drag to reposition · Double-click to reset position"
                className="cursor-grab active:cursor-grabbing text-muted/50 hover:text-white flex items-center pr-1 -ml-0.5 border-r border-outline-variant/30 mr-0.5"
              >
                <GripVertical size={12} />
              </div>
              {(["1D", "1W", "1M", "3M", "ALL"] as const).map((rangeKey) => {
                const isActive = activeQuickRange === rangeKey;
                return (
                  <button
                    key={rangeKey}
                    onClick={() => handleSelectQuickRange(rangeKey)}
                    title={
                      rangeKey === "ALL"
                        ? `Fit all ${bars.length.toLocaleString()} loaded candles`
                        : `Zoom to ${rangeKey} range`
                    }
                    className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                      isActive
                        ? "bg-primary/20 text-primary font-bold border border-primary/40"
                        : "text-muted hover:text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {rangeKey}
                  </button>
                );
              })}

              <div className="w-px h-3.5 bg-outline-variant/40 mx-1" />

              {/* Loaded Candle Count Telemetry */}
              <span
                className="text-on-surface font-semibold px-1"
                title={
                  bars.length > 0
                    ? `Oldest: ${new Date(bars[0].time).toISOString().slice(0, 16).replace("T", " ")} UTC`
                    : "Loading historical candles..."
                }
              >
                {bars.length.toLocaleString()} Bars
              </span>

              {/* 1-Click Deep Historical Backfill (+1,000 Candles) */}
              {canLoadMoreHistory && bars.length < 10000 && (
                <button
                  onClick={() => fetchMoreOlderCandles(1000, true)}
                  disabled={isLoadingOlder}
                  title="Fetch 1,000 older historical candles from MEXC"
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                    isLoadingOlder
                      ? "bg-primary/10 border-primary/30 text-primary cursor-wait"
                      : "bg-surface-container-low hover:bg-primary/20 border-outline-variant/40 hover:border-primary/50 text-cyan hover:text-white cursor-pointer"
                  }`}
                >
                  {isLoadingOlder ? (
                    <RefreshCw size={10} className="animate-spin text-primary" />
                  ) : null}
                  <span>{isLoadingOlder ? "Loading..." : "+1K Older"}</span>
                </button>
              )}

              {/* Reset Chart View Button with RotateCcw Icon (DEC-091) */}
              <button
                onClick={resetChartView}
                title="Reset Chart View & Jump to Latest (Alt+R / Ctrl+Alt+R / R)"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-low hover:bg-primary/20 border border-outline-variant/40 hover:border-primary/50 text-on-surface hover:text-white transition-colors cursor-pointer font-medium text-[11px]"
              >
                <RotateCcw size={10} className="text-primary" />
                <span>Reset View</span>
              </button>

              {isPriceScaleInverted && (
                <button
                  onClick={() => {
                    setIsPriceScaleInverted(false);
                    chartRef.current?.priceScale("right").applyOptions({ invertScale: false });
                  }}
                  title="Price scale inverted (Alt+I to toggle)"
                  className="px-1.5 py-0.5 rounded bg-gold/15 border border-gold/40 text-gold font-bold cursor-pointer"
                >
                  INV
                </button>
              )}
            </div>

            {/* TradingView-Style Price Scale Auto / Reset Button (DEC-091) */}
            <div className="absolute bottom-8 right-14 z-20 flex items-center">
              <button
                onClick={resetChartView}
                title="Auto Scale & Reset Chart View (Alt+R / Ctrl+Alt+R / R)"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-lowest/90 hover:bg-primary/20 border border-border/80 hover:border-primary/50 text-[10px] font-mono text-muted hover:text-white transition-colors cursor-pointer shadow-xs backdrop-blur-xs"
              >
                <RotateCcw size={10} className="text-primary" />
                <span className="font-semibold">Auto</span>
              </button>
            </div>

            {/* Transient Keyboard Shortcut Feedback Toast (DEC-077) */}
            {shortcutToast && (
              <div className="absolute bottom-16 left-2 z-30 bg-[#161a25]/95 border border-primary/50 text-white px-2.5 py-1 rounded text-[10px] font-mono shadow-lg pointer-events-none">
                {shortcutToast}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
