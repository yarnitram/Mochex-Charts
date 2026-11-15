"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { Loader2, RefreshCw } from "lucide-react";
import { CandlestickBar } from "@/lib/mexc/types";
import { formatPoiPrice } from "@/lib/indicators/radar-poi-engine";
import { SupportedExchange, SUPPORTED_EXCHANGES } from "@/lib/screener/multi-exchange-client";

export interface ObZoneMiniChartProps {
  symbol: string;
  timeframe: string;
  exchange?: SupportedExchange;
  zoneTop: number;
  zoneBottom: number;
  direction?: "BULLISH" | "BEARISH";
  targetPrice?: number;
  invalidationPrice?: number;
  fvgTop?: number;
  fvgBottom?: number;
  pattern?: "RGG" | "GRR";
  height?: number;
}

export function ObZoneMiniChart({
  symbol,
  timeframe,
  exchange = "mexc",
  zoneTop,
  zoneBottom,
  direction = "BULLISH",
  targetPrice,
  invalidationPrice,
  fvgTop,
  fvgBottom,
  pattern,
  height = 280,
}: ObZoneMiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const low = Math.min(zoneBottom, zoneTop);
  const high = Math.max(zoneBottom, zoneTop);
  const mid = (low + high) / 2;
  const spreadPct = low > 0 ? ((high - low) / low) * 100 : 0;
  const isBullish = direction === "BULLISH";
  const exCfg = SUPPORTED_EXCHANGES[exchange];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let chart: IChartApi | null = null;
    setLoading(true);
    setError(null);
    el.innerHTML = "";

    chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e16" },
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
      },
      rightPriceScale: {
        borderColor: "#1b2535",
        visible: true,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: "#1b2535",
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00c087",
      downColor: "#ff3b30",
      borderVisible: false,
      wickUpColor: "#00c087",
      wickDownColor: "#ff3b30",
    });

    const url = `/api/exchange/klines?exchange=${encodeURIComponent(
      exchange
    )}&symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${encodeURIComponent(
      timeframe || "4H"
    )}&limit=120`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (disposed || !chart) return;
        const bars: CandlestickBar[] = Array.isArray(data?.bars) ? data.bars : [];
        if (bars.length === 0) {
          setError(`No klines returned from ${exchange.toUpperCase()}`);
          return;
        }

        series.setData(
          bars.map((b) => ({
            time: Math.floor(b.time / 1000) as Time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          }))
        );

        if (high > 0) {
          series.createPriceLine({
            price: high,
            color: isBullish ? "#00c087" : "#64748b",
            lineWidth: isBullish ? 2 : 1,
            lineStyle: isBullish ? LineStyle.Solid : LineStyle.Dotted,
            axisLabelVisible: true,
            title: isBullish ? "OB Entry (Top)" : "OB Top",
          });
        }

        if (low > 0) {
          series.createPriceLine({
            price: low,
            color: !isBullish ? "#ff3b30" : "#64748b",
            lineWidth: !isBullish ? 2 : 1,
            lineStyle: !isBullish ? LineStyle.Solid : LineStyle.Dotted,
            axisLabelVisible: true,
            title: !isBullish ? "OB Entry (Bottom)" : "OB Bottom",
          });
        }

        if (mid > 0) {
          series.createPriceLine({
            price: mid,
            color: "#f59e0b",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "50% MT",
          });
        }

        if (targetPrice && targetPrice > 0) {
          series.createPriceLine({
            price: targetPrice,
            color: "#2962ff",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "Alarm Target",
          });
        }

        if (invalidationPrice && invalidationPrice > 0 && invalidationPrice !== low && invalidationPrice !== high) {
          series.createPriceLine({
            price: invalidationPrice,
            color: "#ef4444",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: "Invalidation",
          });
        }

        if (fvgTop && fvgBottom && fvgTop > fvgBottom) {
          series.createPriceLine({
            price: fvgTop,
            color: "rgba(56, 189, 248, 0.55)",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "FVG High",
          });
          series.createPriceLine({
            price: fvgBottom,
            color: "rgba(56, 189, 248, 0.55)",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "FVG Low",
          });
        }

        chart.timeScale().fitContent();
      })
      .catch((err) => {
        if (!disposed) {
          setError(err?.message || "Chart load failed");
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
      if (chart) {
        try {
          chart.remove();
        } catch {}
      }
    };
  }, [symbol, timeframe, exchange, high, low, mid, targetPrice, invalidationPrice, fvgTop, fvgBottom, isBullish, reloadNonce]);

  return (
    <div className="rounded-xl border border-[#1b2535] bg-[#0a0e16] overflow-hidden flex flex-col">
      {/* Chart Metadata Header */}
      <div className="px-3 py-2 border-b border-[#1b2535] bg-[#0c1017] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white">{symbol.replace("USDT", "/USDT")}</span>
          <span className="px-1.5 py-0.5 rounded bg-[#121824] border border-[#233144] text-[10px] font-bold text-[#b6c4ff]">
            {timeframe || "4H"}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
              exCfg
                ? `${exCfg.badgeBg} ${exCfg.badgeText} ${exCfg.badgeBorder}`
                : "bg-slate-800 text-slate-300 border-slate-700"
            }`}
          >
            {exCfg?.badgeLabel || exchange.toUpperCase()}
          </span>
          {pattern && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                isBullish
                  ? "bg-[#00c087]/15 text-[#00c087] border-[#00c087]/35"
                  : "bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/35"
              }`}
            >
              {pattern}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {high > 0 && (
            <span className="text-[10px] text-[#b6c4ff]">
              OB Range:{" "}
              <strong className="text-white">
                ${formatPoiPrice(low)} - ${formatPoiPrice(high)}
              </strong>{" "}
              <span className="text-[#848e9c]">({spreadPct.toFixed(2)}%)</span>
            </span>
          )}
          {targetPrice && targetPrice > 0 && (
            <span className="text-[10px] text-amber-300 font-bold">
              Target: ${formatPoiPrice(targetPrice)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="p-1 rounded hover:bg-[#1a2332] text-[#848e9c] hover:text-white cursor-pointer"
            title="Reload exchange chart"
          >
            <RefreshCw size={11} className={loading ? "animate-spin text-[#2962ff]" : ""} />
          </button>
        </div>
      </div>

      {/* Canvas Body */}
      <div className="relative w-full" style={{ height }}>
        <div ref={containerRef} className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e16]/75 text-xs text-[#848e9c] gap-2">
            <Loader2 size={15} className="animate-spin text-[#2962ff]" />
            <span>Loading {exCfg?.badgeLabel || exchange} chart...</span>
          </div>
        )}
        {!loading && error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e16]/90 text-xs text-rose-400 px-4 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
