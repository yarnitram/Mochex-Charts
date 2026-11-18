"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { CandlestickBar } from "@/lib/mexc/types";
import { SupportedExchange, SUPPORTED_EXCHANGES } from "@/lib/screener/multi-exchange-client";
import { formatEmaPrice } from "@/lib/alerts/ema-alerts";

export function EmaLevelMiniChart({
  symbol,
  timeframe,
  exchange,
  period,
  emaPrice,
  height = 330,
}: {
  symbol: string;
  timeframe: string;
  exchange: SupportedExchange;
  period: 20 | 50 | 100 | 200;
  emaPrice: number;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const exchangeConfig = SUPPORTED_EXCHANGES[exchange];

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    element.innerHTML = "";
    chart = createChart(element, {
      layout: { background: { type: ColorType.Solid, color: "#0a0e16" }, textColor: "#848e9c", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" },
      grid: { vertLines: { color: "#131b27" }, horzLines: { color: "#131b27" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1b2535", scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: "#1b2535", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    setLoading(true);
    setError(null);
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00c087", downColor: "#ff3b30", borderVisible: false, wickUpColor: "#00c087", wickDownColor: "#ff3b30",
    });

    const url = `/api/exchange/klines?exchange=${encodeURIComponent(exchange)}&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframe)}&limit=160`;
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        if (disposed || !chart) return;
        const bars: CandlestickBar[] = Array.isArray(data?.bars) ? data.bars : [];
        if (!bars.length) {
          setError(`No candles returned from ${exchange.toUpperCase()}`);
          return;
        }
        series.setData(bars.map((bar) => ({
          time: Math.floor(bar.time / 1000) as Time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })));
        series.createPriceLine({
          price: emaPrice,
          color: "#f5ac37",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `EMA ${period}`,
        });
        chart.timeScale().fitContent();
      })
      .catch(() => { if (!disposed) setError("Failed to load exchange candles"); })
      .finally(() => { if (!disposed) setLoading(false); });

    return () => {
      disposed = true;
      chart?.remove();
      chart = null;
    };
  }, [symbol, timeframe, exchange, period, emaPrice, reloadNonce]);

  return (
    <div className="rounded-xl border border-[#1b2535] bg-[#0c1017] overflow-hidden">
      <div className="px-3 py-2 border-b border-[#1b2535] flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold">
          <span className={`px-1.5 py-0.5 rounded border ${exchangeConfig.badgeBg} ${exchangeConfig.badgeText} ${exchangeConfig.badgeBorder}`}>{exchangeConfig.badgeLabel}</span>
          <span className="text-white">{symbol} · {timeframe}</span>
          <span className="text-amber-300">EMA {period} ${formatEmaPrice(emaPrice)}</span>
        </div>
        <button type="button" onClick={() => setReloadNonce((value) => value + 1)} className="text-[10px] text-[#848e9c] hover:text-white">Refresh</button>
      </div>
      <div className="relative" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" />
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e16]/70 text-xs text-[#848e9c]">Loading chart…</div>}
        {!loading && error && <div className="absolute inset-0 flex items-center justify-center text-xs text-rose-300">{error}</div>}
      </div>
    </div>
  );
}
