"use client";

import React, { useState } from "react";
import {
  Star,
  Pencil,
  ChevronUp,
  ChevronDown,
  Crosshair,
  TrendingUp,
  Sliders,
  Brush,
  Type,
  ArrowUpRight,
  ArrowDownRight,
  Square,
  CalendarRange,
  BarChart2,
  Magnet,
  Trash2,
} from "lucide-react";
import { DrawingToolType } from "../terminal/DrawingRail";

interface MobileTacticalDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  activeDrawingTool: DrawingToolType;
  onSelectDrawingTool: (tool: DrawingToolType) => void;
  onClearDrawings?: () => void;
}

const WATCHLIST_SAMPLE = [
  { symbol: "BTCUSDT", price: 68420.5, change: 3.42, volume: "42.8K" },
  { symbol: "ETHUSDT", price: 3485.2, change: -1.15, volume: "182K" },
  { symbol: "SOLUSDT", price: 178.65, change: 7.82, volume: "924K" },
  { symbol: "MXUSDT", price: 3.84, change: 0.52, volume: "48.9K" },
  { symbol: "XRPUSDT", price: 0.542, change: -0.45, volume: "1.4M" },
  { symbol: "DOGEUSDT", price: 0.128, change: 4.12, volume: "3.8M" },
];

export function MobileTacticalDrawer({
  isOpen,
  onToggle,
  selectedSymbol,
  onSelectSymbol,
  activeDrawingTool,
  onSelectDrawingTool,
  onClearDrawings,
}: MobileTacticalDrawerProps) {
  const [activeTab, setActiveTab] = useState<"watchlist" | "drawing">("watchlist");

  const drawingTools: Array<{ id: DrawingToolType; label: string; icon: React.ReactNode }> = [
    { id: "crosshair", label: "Crosshair", icon: <Crosshair size={18} /> },
    { id: "trendline", label: "Trendline", icon: <TrendingUp size={18} /> },
    { id: "rectangle", label: "Rectangle", icon: <Square size={18} /> },
    { id: "long_position", label: "Long Pos", icon: <ArrowUpRight size={18} /> },
    { id: "short_position", label: "Short Pos", icon: <ArrowDownRight size={18} /> },
    { id: "date_range", label: "Date Range", icon: <CalendarRange size={18} /> },
    { id: "fixed_range_volume_profile", label: "Fixed Range VP", icon: <BarChart2 size={18} /> },
    { id: "fibonacci", label: "Fibonacci", icon: <Sliders size={18} /> },
    { id: "brush", label: "Brush", icon: <Brush size={18} /> },
    { id: "text", label: "Annotation", icon: <Type size={18} /> },
  ];

  return (
    <div
      className={`fixed left-0 right-0 bottom-12 z-30 bg-surface-container-low border-t border-border rounded-t-xl transition-all duration-300 md:hidden flex flex-col shadow-2xl select-none ${
        isOpen ? "h-72" : "h-11"
      }`}
    >
      {/* Pull Handle & Segmented Tab Header */}
      <div
        onClick={onToggle}
        className="h-11 px-4 flex items-center justify-between cursor-pointer border-b border-border/50 shrink-0 bg-surface-container-lowest/80 rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          {/* Segmented Control */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center bg-surface-container p-0.5 rounded-lg border border-border"
          >
            <button
              onClick={() => setActiveTab("watchlist")}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium flex items-center gap-1 transition-colors ${
                activeTab === "watchlist"
                  ? "bg-primary-container text-white shadow-xs"
                  : "text-muted hover:text-on-surface"
              }`}
            >
              <Star size={12} />
              <span>Watchlist (6)</span>
            </button>

            <button
              onClick={() => setActiveTab("drawing")}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium flex items-center gap-1 transition-colors ${
                activeTab === "drawing"
                  ? "bg-primary-container text-white shadow-xs"
                  : "text-muted hover:text-on-surface"
              }`}
            >
              <Pencil size={12} />
              <span>Drawing Tools (7)</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 text-muted">
          {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>
      </div>

      {/* Drawer Body */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
          {activeTab === "watchlist" ? (
            /* High-Density Mobile Ticker List */
            <div className="space-y-1">
              {WATCHLIST_SAMPLE.map((item) => {
                const isSelected = item.symbol === selectedSymbol;
                const isPositive = item.change >= 0;
                return (
                  <div
                    key={item.symbol}
                    onClick={() => onSelectSymbol(item.symbol)}
                    className={`flex items-center justify-between p-2 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-surface-container-high border-primary-container"
                        : "bg-surface-container-lowest border-border hover:bg-surface-container"
                    }`}
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-on-surface">
                        {item.symbol.replace("USDT", "")}
                        <span className="text-[10px] text-muted">/USDT</span>
                      </div>
                      <div className="text-[10px] font-mono text-muted">Vol {item.volume}</div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold text-on-surface">
                        ${item.price.toFixed(2)}
                      </div>
                      <span
                        className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded inline-block ${
                          isPositive
                            ? "bg-secondary/15 text-secondary"
                            : "bg-tertiary/15 text-tertiary"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {item.change.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Tactile Drawing Tools Grid */
            <div className="grid grid-cols-3 gap-2">
              {drawingTools.map((t) => {
                const isActive = activeDrawingTool === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectDrawingTool(isActive ? "none" : t.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-mono transition-colors gap-1.5 ${
                      isActive
                        ? "bg-primary-container text-white border-primary-container shadow-xs"
                        : "bg-surface-container-lowest text-muted hover:text-on-surface border-border"
                    }`}
                  >
                    {t.icon}
                    <span className="text-[11px]">{t.label}</span>
                  </button>
                );
              })}

              <button
                onClick={onClearDrawings}
                className="flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-mono transition-colors gap-1.5 bg-surface-container-lowest text-muted hover:text-tertiary border-border"
              >
                <Trash2 size={18} />
                <span className="text-[11px]">Clear All</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
