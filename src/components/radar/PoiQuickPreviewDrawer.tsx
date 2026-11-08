"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  X,
  ExternalLink,
  Bell,
  Star,
  Layers,
  Sparkles,
  Zap,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  Crosshair,
} from "lucide-react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { RadarPoiItem } from "@/lib/indicators/radar-poi-engine";
import { mexcClient } from "@/lib/mexc/client";
import { CandlestickBar } from "@/lib/mexc/types";

interface PoiQuickPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  coinName?: string;
  poi: RadarPoiItem;
  currentPrice: number;
  change24h: number;
  onOpenAlarmModal: () => void;
  onOpenPaperTradeModal?: () => void;
}

export function PoiQuickPreviewDrawer({
  isOpen,
  onClose,
  symbol,
  coinName,
  poi,
  currentPrice,
  change24h,
  onOpenAlarmModal,
  onOpenPaperTradeModal,
}: PoiQuickPreviewDrawerProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isBullish = poi.type === "BULLISH";
  const isSandwich = poi.category === "sandwich_zone";
  const isFvg = poi.category === "fvg";
  const isPositive = change24h >= 0;

  // Map timeframe string to MEXC resolution
  const resolution =
    poi.timeframe === "15m" || poi.timeframe === "15"
      ? "15"
      : poi.timeframe === "1H" || poi.timeframe === "60"
      ? "60"
      : poi.timeframe === "4H" || poi.timeframe === "240"
      ? "240"
      : poi.timeframe === "1D" || poi.timeframe === "D"
      ? "1D"
      : "240";

  // Fetch Klines and render chart
  useEffect(() => {
    if (!isOpen || !chartContainerRef.current) return;

    let isMounted = true;
    setLoading(true);
    setLoadError(null);

    // Initialize Lightweight Chart
    const container = chartContainerRef.current;
    container.innerHTML = "";

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#0c1017" },
        textColor: "#848e9c",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: "#131b27" },
        horzLines: { color: "#131b27" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(132, 142, 156, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(132, 142, 156, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: "#1b2535",
        visible: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: "#1b2535",
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    chartApiRef.current = chart;

    // Add Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00c087",
      downColor: "#ff3b30",
      borderVisible: false,
      wickUpColor: "#00c087",
      wickDownColor: "#ff3b30",
    });
    seriesRef.current = candleSeries;

    // Fetch historical candles from MEXC
    async function loadCandles() {
      try {
        const bars = await mexcClient.getKlines({
          symbol: symbol.toUpperCase(),
          resolution,
          limit: 100,
          forceProxy: false,
        });

        if (!isMounted) return;

        if (bars && bars.length > 0) {
          const chartData = bars.map((b: CandlestickBar) => ({
            time: Math.floor(b.time / 1000) as Time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          }));

          candleSeries.setData(chartData);

          // Add POI Price Lines
          // 1. Entry Boundary Line
          candleSeries.createPriceLine({
            price: poi.entryPrice,
            color: isBullish ? "#00c087" : "#ff3b30",
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: isBullish ? "Demand Entry" : "Supply Entry",
          });

          // 2. 50% Equilibrium Line (MT or CE)
          candleSeries.createPriceLine({
            price: poi.meanThreshold,
            color: "#f59e0b",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: isFvg ? "50% CE" : "50% MT",
          });

          // 3. Invalidation / Full Retest Boundary Line
          candleSeries.createPriceLine({
            price: poi.fullRetestPrice,
            color: "#64748b",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: "Zone Boundary",
          });

          chart.timeScale().fitContent();
        } else {
          setLoadError("No candle data available");
        }
      } catch (err: any) {
        if (isMounted) {
          setLoadError(err?.message || "Failed to load candles");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadCandles();

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      isMounted = false;
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartApiRef.current = null;
      seriesRef.current = null;
    };
  }, [isOpen, symbol, resolution, poi, isBullish, isFvg]);

  if (!isOpen) return null;

  const formattedPrice =
    currentPrice >= 1
      ? currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : currentPrice.toFixed(4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-[#0e141f] border-l border-[#1b2535] w-full max-w-xl h-full shadow-2xl flex flex-col font-mono text-xs animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="h-14 px-5 border-b border-[#1b2535] bg-[#0c1017] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm">
                  {symbol.replace("USDT", "/USDT")}
                </span>
                <span
                  className={`text-xs font-bold flex items-center gap-0.5 ${
                    isPositive ? "text-[#00c087]" : "text-[#ff3b30]"
                  }`}
                >
                  {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{isPositive ? "+" : ""}{change24h.toFixed(2)}%</span>
                </span>
              </div>
              <span className="text-[10px] text-[#848e9c] truncate max-w-[200px]">
                {coinName || "MEXC Spot"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#848e9c] hover:text-white hover:bg-[#121824] transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* POI Context Pill Banner */}
        <div className="p-4 bg-[#0a0d14] border-b border-[#172233] flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isBullish
                    ? "bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30"
                    : "bg-[#ff3b30]/15 text-[#ff3b30] border border-[#ff3b30]/30"
                }`}
              >
                {isSandwich
                  ? isBullish
                    ? "DEMAND SANDWICH (GRGG)"
                    : "SUPPLY SANDWICH (RGRR)"
                  : isFvg
                  ? isBullish
                    ? "BULLISH FVG"
                    : "BEARISH FVG"
                  : `${poi.type} ORDER BLOCK`}
              </span>

              <span className="px-2 py-0.5 rounded bg-[#172233] text-[#b6c4ff] text-[10px] font-bold">
                {poi.timeframe}
              </span>

              {poi.isPlus && (
                <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 text-[9px] font-bold flex items-center gap-1">
                  <Star size={9} className="fill-yellow-400" />
                  <span>++ S/R CONFLUENCE</span>
                </span>
              )}
            </div>

            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                poi.isInsideZone
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse"
                  : poi.distanceToEntryPct <= 1.5
                  ? "bg-[#00c087]/20 text-[#00c087] border border-[#00c087]/40"
                  : "bg-[#172233] text-[#848e9c]"
              }`}
            >
              {poi.isInsideZone
                ? "TESTING ZONE NOW"
                : `${poi.distanceToEntryPct.toFixed(2)}% TO ENTRY`}
            </span>
          </div>

          {/* Key Price Levels Grid */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#172233] text-center">
            <div className="p-2 rounded bg-[#0e141f] border border-[#1b2535]">
              <span className="text-[9px] text-[#848e9c] block">Live Mark</span>
              <span className="font-bold text-white text-xs">${formattedPrice}</span>
            </div>
            <div className="p-2 rounded bg-[#0e141f] border border-[#1b2535]">
              <span className="text-[9px] text-[#848e9c] block">Entry Level</span>
              <span className={`font-bold text-xs ${isBullish ? "text-[#00c087]" : "text-[#ff3b30]"}`}>
                ${poi.entryPrice.toFixed(2)}
              </span>
            </div>
            <div className="p-2 rounded bg-[#0e141f] border border-[#233144]">
              <span className="text-[9px] text-[#2962ff] block">
                {isFvg ? "50% CE" : "50% MT"}
              </span>
              <span className="font-bold text-[#b6c4ff] text-xs">
                ${poi.meanThreshold.toFixed(2)}
              </span>
            </div>
            <div className="p-2 rounded bg-[#0e141f] border border-[#1b2535]">
              <span className="text-[9px] text-[#848e9c] block">Boundary</span>
              <span className="font-bold text-[#848e9c] text-xs">
                ${poi.fullRetestPrice.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Lightweight Chart Canvas Area */}
        <div className="flex-1 relative bg-[#0c1017] min-h-[360px]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0c1017]/90 z-10 text-[#848e9c]">
              <RefreshCw size={24} className="animate-spin text-[#2962ff]" />
              <span className="text-xs">Loading {symbol} {poi.timeframe} Candles...</span>
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0c1017]/90 z-10 text-[#ff3b30]">
              <span className="text-xs">{loadError}</span>
            </div>
          )}

          <div ref={chartContainerRef} className="w-full h-full" />
        </div>

        {/* Action Toolbar Footer */}
        <div className="p-4 border-t border-[#1b2535] bg-[#0c1017] flex items-center justify-between gap-2 shrink-0">
          {onOpenPaperTradeModal && (
            <button
              onClick={() => {
                onClose();
                onOpenPaperTradeModal();
              }}
              className={`py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md ${
                isBullish
                  ? "bg-[#00c087] hover:bg-[#00a876] text-black shadow-[#00c087]/20"
                  : "bg-[#ff3b30] hover:bg-[#e03026] text-white shadow-[#ff3b30]/20"
              }`}
            >
              <Zap size={13} className="fill-current" />
              <span>Arm Paper Trade</span>
            </button>
          )}

          <button
            onClick={() => {
              onClose();
              onOpenAlarmModal();
            }}
            className="flex-1 py-2.5 px-3 rounded-lg bg-[#2962ff] hover:bg-[#1e50db] text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md shadow-[#2962ff]/20"
          >
            <Bell size={13} />
            <span>24/7 Cloud Alarm</span>
          </button>

          <Link
            href={`/chart?symbol=${symbol}`}
            className="py-2.5 px-3 rounded-lg bg-[#121824] hover:bg-[#1a2332] text-white border border-[#233144] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="hidden sm:inline">Chart</span>
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
