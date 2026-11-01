"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  X,
  Star,
  Users,
  Code2,
  Plus,
  Check,
  TrendingUp,
  Activity,
  BarChart2,
  Layers,
  Sparkles,
  LayoutTemplate,
  Trash2,
  Save,
} from "lucide-react";
import {
  IndicatorTemplate,
  getStoredTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  toggleStarTemplate,
} from "@/lib/indicators/templates";
import {
  CustomScript,
  getCustomScripts,
  deleteCustomScript,
  DEFAULT_STARTER_SCRIPT,
  DEFAULT_FVG_SCRIPT,
  DEFAULT_MARKET_STRUCTURE_SCRIPT,
  DEFAULT_CANDLE_STRUCTURE_SCRIPT,
  DEFAULT_EMA_RIBBON_SCRIPT,
  DEFAULT_BOLLINGER_SCRIPT,
  DEFAULT_RSI_SCRIPT,
  DEFAULT_MACD_SCRIPT,
  DEFAULT_ADAM_EVE_SCRIPT,
  DEFAULT_HEAD_SHOULDERS_SCRIPT,
  resolveCatalogScriptCode,
} from "@/lib/indicators/custom-scripts-store";
import { IndicatorSandbox } from "@/lib/indicators/sandbox";
import { CandlestickBar } from "@/lib/mexc/types";

export interface IndicatorCatalogItem {
  id: string;
  name: string;
  author: string;
  category: "community" | "custom" | "builtins" | "volume" | "strategies";
  type: "Overlay" | "Sub-pane";
  rating: number;
  usersCount: string;
  description: string;
  isVerified: boolean;
  code?: string;
}

const STATIC_CATALOG_ITEMS: IndicatorCatalogItem[] = [
  {
    id: "market-structure-substructure",
    name: "True Market Structure & Substructure",
    author: "Mochex Core",
    category: "builtins",
    type: "Overlay",
    rating: 5.0,
    usersCount: "28.4K",
    description: "Institutional dual-lookback ZigZag market structure mapping Major Swings, Internal Substructure, Break of Structure (BOS), and Change of Character (CHoCH) with TradingView-style Settings Modal.",
    isVerified: true,
    code: DEFAULT_MARKET_STRUCTURE_SCRIPT,
  },
  {
    id: "candle-market-structure",
    name: "Candlestick Market Structure (Price Action)",
    author: "Mochex Price Action",
    category: "builtins",
    type: "Overlay",
    rating: 5.0,
    usersCount: "19.5K",
    description: "Pure price action candlestick structure detecting 3-bar/5-bar Swing Highs & Lows (SH/SL), and candle-close Market Structure Shifts (MSS) & Break of Structure (BOS).",
    isVerified: true,
    code: DEFAULT_CANDLE_STRUCTURE_SCRIPT,
  },
  {
    id: "fvg-unmitigated",
    name: "Unmitigated Multi-Timeframe FVG (0% Hit)",
    author: "Mochex Core",
    category: "builtins",
    type: "Overlay",
    rating: 5.0,
    usersCount: "22.6K",
    description: "Institutional Fair Value Gap engine with strict 0% wick touch mitigation, translucent colored rectangles, and 50% Consequent Encroachment (C.E.) midline.",
    isVerified: true,
    code: DEFAULT_FVG_SCRIPT,
  },
  {
    id: "ema-ribbon",
    name: "4 EMA Ribbon (20, 50, 100, 200)",
    author: "Mochex Core",
    category: "builtins",
    type: "Overlay",
    rating: 4.9,
    usersCount: "34.2K",
    description: "4-line Exponential Moving Average suite (20 White thin, 50 Blue medium, 100 Yellow thick, 200 Orange thickest) showing trend compression and Golden/Death cross expansion.",
    isVerified: true,
    code: DEFAULT_EMA_RIBBON_SCRIPT,
  },
  {
    id: "strategy-equity-underwater",
    name: "Strategy Equity Curve & Underwater Drawdown",
    author: "Mochex Quant",
    category: "strategies",
    type: "Sub-pane",
    rating: 5.0,
    usersCount: "12.8K",
    description: "Multi-pane visual strategy execution engine showing synchronized Strategy Equity Curve, Buy & Hold benchmark, and Underwater Drawdown % histogram.",
    isVerified: true,
    code: DEFAULT_STARTER_SCRIPT,
  },
  {
    id: "rsi-divergence-pro",
    name: "RSI Divergence Engine Pro",
    author: "AlgotraderX",
    category: "community",
    type: "Sub-pane",
    rating: 4.8,
    usersCount: "14.2K",
    description: "Detects regular and hidden bullish/bearish divergences automatically with dynamic overbought (70) and oversold (30) bands.",
    isVerified: true,
    code: DEFAULT_RSI_SCRIPT,
  },
  {
    id: "macd-zerolag",
    name: "Zero-Lag MACD Histogram",
    author: "QuantLab",
    category: "community",
    type: "Sub-pane",
    rating: 4.7,
    usersCount: "9.8K",
    description: "Eliminates standard moving average delay via exponential smoothing error feedback for fast reversal signals.",
    isVerified: true,
    code: DEFAULT_MACD_SCRIPT,
  },
  {
    id: "volume-profile-session",
    name: "Volume Profile & Dynamic Point of Control (POC)",
    author: "Mochex Core",
    category: "volume",
    type: "Overlay",
    rating: 4.9,
    usersCount: "35.1K",
    description: "High-density horizontal volume distribution rendering Value Area High (VAH), Value Area Low (VAL), and POC liquidity nodes.",
    isVerified: true,
    code: DEFAULT_STARTER_SCRIPT,
  },
  {
    id: "bollinger-squeeze",
    name: "Bollinger Bands Squeeze Breakout",
    author: "JohnCarter_TA",
    category: "builtins",
    type: "Overlay",
    rating: 4.6,
    usersCount: "8.1K",
    description: "Detects pre-breakout volatility contraction by comparing Bollinger Bands bandwidth with Keltner Channels.",
    isVerified: false,
    code: DEFAULT_BOLLINGER_SCRIPT,
  },
  {
    id: "adam-eve-patterns",
    name: "Adam & Eve Pattern Recognition",
    author: "Mochex Core",
    category: "builtins",
    type: "Overlay",
    rating: 5.0,
    usersCount: "24.6K",
    description: "Detects Bullish Adam (sharp V-spike) and Eve (rounded U-bottom) double bottoms and Bearish inverted patterns with Neckline breakout triggers and measured move targets.",
    isVerified: true,
    code: DEFAULT_ADAM_EVE_SCRIPT,
  },
  {
    id: "head-and-shoulders",
    name: "Head and Shoulders (H&S) Engine",
    author: "Mochex Core",
    category: "builtins",
    type: "Overlay",
    rating: 5.0,
    usersCount: "31.2K",
    description: "Detects classic Bearish Head & Shoulders and Bullish Inverse Head & Shoulders patterns with Left/Right shoulder symmetry, dynamic neckline rays, and 1:1 measured move targets.",
    isVerified: true,
    code: DEFAULT_HEAD_SHOULDERS_SCRIPT,
  },
];

interface IndicatorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyIndicator: (name: string) => void;
  onApplyTemplate?: (indicators: string[]) => void;
  onEditInStudio?: (indicator: IndicatorCatalogItem) => void;
  activeIndicators?: string[];
  initialTab?: "catalog" | "templates";
  sampleBars?: CandlestickBar[];
  onApplyCustomScript?: (script: {
    name: string;
    code: string;
    data?: Array<{ time: number; value: number }>;
    boxes?: any[];
  }) => void;
}

export function IndicatorsModal({
  isOpen,
  onClose,
  onApplyIndicator,
  onApplyTemplate,
  onEditInStudio,
  activeIndicators = [],
  initialTab = "catalog",
  sampleBars = [],
  onApplyCustomScript,
}: IndicatorsModalProps) {
  const [mainTab, setMainTab] = useState<"catalog" | "templates">("catalog");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customScripts, setCustomScripts] = useState<CustomScript[]>([]);

  // Templates state
  const [templates, setTemplates] = useState<IndicatorTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [templateFeedback, setTemplateFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTemplates(getStoredTemplates());
      setCustomScripts(getCustomScripts());
      setMainTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const handleCreateNewScript = () => {
    onClose();
    if (onEditInStudio) {
      onEditInStudio({
        id: `script-${Date.now()}`,
        name: "New Custom Indicator",
        category: "custom",
        author: "You",
        type: "Overlay",
        rating: 5.0,
        usersCount: "1",
        description: "New custom indicator script",
        isVerified: false,
        code: DEFAULT_STARTER_SCRIPT,
      });
    } else {
      window.dispatchEvent(
        new CustomEvent("mochex:open-script-studio", {
          detail: {
            script: {
              id: `script-${Date.now()}`,
              name: "New Custom Indicator",
              code: DEFAULT_STARTER_SCRIPT,
              type: "indicator",
            },
          },
        })
      );
    }
  };

  const handleDeleteCustomScript = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = deleteCustomScript(id);
    setCustomScripts(updated);
  };

  const handleSaveCurrentTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = saveCustomTemplate(newTemplateName, newTemplateDesc, activeIndicators);
      setTemplates(getStoredTemplates());
      setNewTemplateName("");
      setNewTemplateDesc("");
      setTemplateFeedback(`Template '${created.name}' saved successfully!`);
      setTimeout(() => setTemplateFeedback(null), 3000);
    } catch (err: any) {
      setTemplateFeedback(err?.message || "Failed to save template");
      setTimeout(() => setTemplateFeedback(null), 3000);
    }
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = deleteCustomTemplate(id);
    setTemplates(updated);
  };

  const handleToggleStar = (id: string) => {
    const updated = toggleStarTemplate(id);
    setTemplates(updated);
  };

  const handleApplyTemplateStack = (indicators: string[]) => {
    if (onApplyTemplate) {
      onApplyTemplate(indicators);
    } else {
      window.dispatchEvent(
        new CustomEvent("mochex:apply-indicator-template", {
          detail: { indicators },
        })
      );
    }
    onClose();
  };

  const handleItemApply = async (item: IndicatorCatalogItem) => {
    const resolvedCode = item.code || resolveCatalogScriptCode(item.id, item.name);
    const isCustomScript = item.category === "custom" || !!item.code || !!resolvedCode;
    const isCurrentlyActive = activeIndicators.includes(item.name);

    if (isCustomScript && resolvedCode) {
      if (isCurrentlyActive) {
        onApplyIndicator(item.name);
        if (onApplyCustomScript) {
          onApplyCustomScript({ name: item.name, code: resolvedCode, data: undefined, boxes: undefined });
        }
        return;
      }

      try {
        const sandbox = new IndicatorSandbox(1500);
        const fallbackBars = sampleBars && sampleBars.length > 0 ? sampleBars : [
          { time: Date.now() - 3600000, open: 68000, high: 68500, low: 67900, close: 68420, volume: 100 },
          { time: Date.now() - 1800000, open: 68420, high: 68600, low: 68300, close: 68550, volume: 120 },
          { time: Date.now(), open: 68550, high: 68700, low: 68400, close: 68600, volume: 150 },
        ];
        const res = await sandbox.execute({
          scriptId: item.id,
          code: resolvedCode,
          bars: fallbackBars,
          inputs: {},
        });

        if (res.success) {
          let points: Array<{ time: number; value: number }> | null = null;
          if (Array.isArray(res.data)) {
            points = (res.data as any[])
              .filter(
                (d) =>
                  d &&
                  d.time !== undefined &&
                  d.value !== null &&
                  d.value !== undefined &&
                  typeof Number(d.value) === "number" &&
                  !isNaN(Number(d.value))
              )
              .map((d) => ({
                time: typeof d.time === "number" ? d.time : Number(d.time),
                value: Number(d.value),
              }));
          }
          const boxes = Array.isArray(res.boxes) && res.boxes.length > 0 ? res.boxes : null;
          if (onApplyCustomScript) {
            onApplyCustomScript({
              name: item.name,
              code: resolvedCode,
              data: points && points.length > 0 ? points : undefined,
              boxes: boxes || undefined,
            });
          }
          onApplyIndicator(item.name);
        } else {
          if (onEditInStudio) {
            onEditInStudio({ ...item, code: resolvedCode });
          }
        }
      } catch {
        onApplyIndicator(item.name);
      }
    } else {
      onApplyIndicator(item.name);
    }
  };

  if (!isOpen) return null;

  // Convert custom user scripts to catalog items
  const customCatalogItems: IndicatorCatalogItem[] = customScripts.map((cs) => ({
    id: cs.id,
    name: cs.name,
    author: "You (Local)",
    category: "custom",
    type: cs.type === "strategy" ? "Sub-pane" : "Overlay",
    rating: 5.0,
    usersCount: "1",
    description: cs.description || "Custom user script compiled via Web Worker sandbox.",
    isVerified: cs.isPublished || false,
    code: cs.code,
  }));

  const allCatalogItems = [...customCatalogItems, ...STATIC_CATALOG_ITEMS];

  const categories = [
    { id: "all", label: "All Indicators", count: allCatalogItems.length, icon: <Layers size={14} /> },
    { id: "custom", label: "My Custom Scripts", count: customCatalogItems.length, icon: <Code2 size={14} /> },
    { id: "strategies", label: "Quant Strategies", count: 1, icon: <Activity size={14} /> },
    { id: "community", label: "Global Community", count: 2, icon: <Sparkles size={14} /> },
    { id: "builtins", label: "Built-in Overlays", count: 2, icon: <TrendingUp size={14} /> },
    { id: "volume", label: "Volume Profiles", count: 1, icon: <BarChart2 size={14} /> },
  ];

  const filteredItems = allCatalogItems.filter((item) => {
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesType =
      filterType === "all" ||
      (filterType === "overlay" && item.type === "Overlay") ||
      (filterType === "subpane" && item.type === "Sub-pane");
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesType && matchesSearch;
  });

  const filteredTemplates = templates
    .filter((t) => {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.indicators.some((ind) => ind.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (a.isStarred && !b.isStarred) return -1;
      if (!a.isStarred && b.isStarred) return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
      <div className="bg-surface border border-border rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0 bg-surface-container-lowest">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">fx</span>
              <h2 className="text-sm font-semibold text-on-surface">Indicators & Strategies Catalog</h2>
            </div>

            {/* Main Tabs Switcher */}
            <div className="flex items-center bg-surface-container-low p-0.5 rounded border border-outline-variant/30">
              <button
                onClick={() => setMainTab("catalog")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                  mainTab === "catalog"
                    ? "bg-primary-container text-white shadow-xs font-bold"
                    : "text-muted hover:text-on-surface"
                }`}
              >
                Catalog ({allCatalogItems.length})
              </button>
              <button
                onClick={() => setMainTab("templates")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  mainTab === "templates"
                    ? "bg-primary-container text-white shadow-xs font-bold"
                    : "text-muted hover:text-on-surface"
                }`}
              >
                <LayoutTemplate size={13} />
                <span>Templates ({templates.length})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Create Custom Script Button */}
            <button
              onClick={handleCreateNewScript}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary-container hover:bg-accent-hover text-white text-xs font-mono font-semibold transition-colors shadow-xs cursor-pointer"
              title="Create a new custom indicator or strategy in Script Studio"
            >
              <Plus size={13} />
              <span>+ New Script</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded text-muted hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search & Sub-Filter Bar */}
        <div className="px-5 py-3 border-b border-border bg-surface-container-low flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <div className="relative flex-1 w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                mainTab === "catalog"
                  ? "Search indicators, custom scripts, or authors..."
                  : "Search templates or indicator stacks..."
              }
              className="w-full bg-surface text-on-surface placeholder-muted text-xs font-mono pl-9 pr-3 py-2 rounded border border-outline-variant/30 focus:outline-hidden focus:border-primary-container transition-colors"
            />
          </div>

          {mainTab === "catalog" && (
            <div className="flex items-center gap-1.5 shrink-0">
              {["all", "overlay", "subpane"].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded text-xs font-mono capitalize transition-colors cursor-pointer ${
                    filterType === type
                      ? "bg-primary-container text-white font-medium"
                      : "bg-surface text-muted hover:text-on-surface border border-outline-variant/30"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modal Body */}
        {mainTab === "catalog" ? (
          /* 2-Column Catalog Body */
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Category Sidebar */}
            <div className="w-56 border-r border-border bg-surface-container-lowest p-3 space-y-1 overflow-y-auto no-scrollbar shrink-0">
              <div className="text-[10px] font-mono text-muted uppercase tracking-wider px-2 py-1">
                Libraries
              </div>
              {categories.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-mono transition-colors cursor-pointer ${
                      isActive
                        ? "bg-surface-container-high text-primary font-bold border-l-2 border-primary-container"
                        : "text-muted hover:text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {cat.icon}
                      <span>{cat.label}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-container text-muted">
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right: Cards Grid */}
            <div className="flex-1 p-4 overflow-y-auto no-scrollbar bg-surface-container-lowest">
              {filteredItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <Code2 size={36} className="text-muted/40" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-on-surface">No Scripts or Indicators Found</h3>
                    <p className="text-xs text-muted max-w-sm">
                      {selectedCategory === "custom"
                        ? "You haven't created any custom scripts yet. Click below to open Script Studio and write your first indicator or strategy!"
                        : "No indicators matching your search criteria."}
                    </p>
                  </div>
                  {selectedCategory === "custom" && (
                    <button
                      onClick={handleCreateNewScript}
                      className="flex items-center gap-1.5 px-4 py-2 rounded bg-primary-container hover:bg-accent-hover text-white text-xs font-mono font-semibold transition-colors shadow-xs cursor-pointer mt-2"
                    >
                      <Plus size={14} />
                      <span>Create Your First Script</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredItems.map((item) => {
                    const isApplied = activeIndicators.includes(item.name);
                    const isCustomScript = item.category === "custom";
                    return (
                      <div
                        key={item.id}
                        className={`bg-surface border rounded-lg p-3.5 flex flex-col justify-between transition-all hover:shadow-lg ${
                          isCustomScript
                            ? "border-primary/30 hover:border-primary/60 bg-gradient-to-br from-surface to-surface-container-low"
                            : "border-border hover:border-outline-variant/50"
                        }`}
                      >
                        <div>
                          {/* Header: Title + Type badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {isCustomScript && <Code2 size={13} className="text-primary shrink-0" />}
                              <h3 className="font-sans font-semibold text-xs text-on-surface leading-snug">
                                {item.name}
                              </h3>
                            </div>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container text-muted border border-border shrink-0">
                              {item.type}
                            </span>
                          </div>

                          {/* Author & Stats */}
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-muted">
                            <span>by {item.author}</span>
                            <div className="flex items-center gap-0.5 text-gold">
                              <Star size={11} fill="currentColor" />
                              <span>{item.rating}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Users size={11} />
                              <span>{item.usersCount}</span>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-muted font-sans mt-2 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        </div>

                        {/* Actions Bar */}
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-border">
                          {onEditInStudio && (
                            <button
                              onClick={() => {
                                onEditInStudio({
                                  ...item,
                                  code: item.code || resolveCatalogScriptCode(item.id, item.name),
                                });
                                onClose();
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface border border-outline-variant/30 text-xs font-mono transition-colors cursor-pointer"
                              title="Open and edit code in Script Studio"
                            >
                              <Code2 size={12} />
                              <span>Edit Studio</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleItemApply(item)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                              isApplied
                                ? "bg-secondary/20 text-secondary border border-secondary/40"
                                : "bg-primary-container hover:bg-accent-hover text-white shadow-xs"
                            }`}
                          >
                            {isApplied ? (
                              <>
                                <Check size={13} />
                                <span>Active on Chart</span>
                              </>
                            ) : (
                              <>
                                <Plus size={13} />
                                <span>Add to Chart</span>
                              </>
                            )}
                          </button>

                          {isCustomScript && (
                            <button
                              onClick={(e) => handleDeleteCustomScript(e, item.id)}
                              title="Delete custom script"
                              className="p-1.5 text-muted hover:text-tertiary hover:bg-tertiary/10 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Template Manager Body */
          <div className="flex-1 p-5 overflow-y-auto no-scrollbar bg-surface-container-lowest">
            {/* Save Current Stack Form */}
            <div className="bg-surface-container-low border border-border rounded-lg p-4 mb-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Save size={15} className="text-primary" />
                  <h3 className="text-xs font-bold font-mono text-on-surface uppercase">
                    Save Active Indicators as Template
                  </h3>
                </div>
                <div className="text-[11px] font-mono text-muted">
                  Active Stack: <span className="text-secondary font-bold">{activeIndicators.length}</span>
                </div>
              </div>

              <form onSubmit={handleSaveCurrentTemplate} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template name (e.g. My Breakout Stack)"
                    className="bg-surface text-on-surface text-xs font-mono px-3 py-2 rounded border border-outline-variant/30 focus:outline-hidden focus:border-primary-container"
                    required
                  />
                  <input
                    type="text"
                    value={newTemplateDesc}
                    onChange={(e) => setNewTemplateDesc(e.target.value)}
                    placeholder="Brief description (e.g. EMA 20/50 + RSI Divergence)"
                    className="bg-surface text-on-surface text-xs font-mono px-3 py-2 rounded border border-outline-variant/30 focus:outline-hidden focus:border-primary-container"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-muted font-mono flex items-center gap-1.5 flex-wrap">
                    <span>Includes:</span>
                    {activeIndicators.map((name) => (
                      <span key={name} className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px] text-on-surface">
                        {name}
                      </span>
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary-container hover:bg-accent-hover text-white text-xs font-mono font-semibold transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Save Template</span>
                  </button>
                </div>
              </form>

              {templateFeedback && (
                <div className="mt-3 text-xs font-mono text-secondary bg-secondary/10 px-3 py-1.5 rounded border border-secondary/20">
                  {templateFeedback}
                </div>
              )}
            </div>

            {/* Templates List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="bg-surface border border-border rounded-lg p-3.5 flex flex-col justify-between hover:border-outline-variant/50 transition-all shadow-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStar(tmpl.id)}
                          className={`p-1 rounded hover:bg-surface-container transition-colors cursor-pointer ${
                            tmpl.isStarred ? "text-gold" : "text-muted hover:text-gold"
                          }`}
                        >
                          <Star size={13} fill={tmpl.isStarred ? "currentColor" : "none"} />
                        </button>
                        <h4 className="text-xs font-semibold font-sans text-on-surface">{tmpl.name}</h4>
                      </div>

                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container text-muted border border-border">
                        {tmpl.isBuiltin ? "Preset" : "Custom"}
                      </span>
                    </div>

                    <p className="text-xs text-muted font-sans mt-2 line-clamp-2">{tmpl.description}</p>

                    <div className="flex flex-wrap gap-1 mt-3">
                      {tmpl.indicators.map((ind) => (
                        <span
                          key={ind}
                          className="px-1.5 py-0.2 rounded bg-surface-container-low text-[10px] font-mono text-muted border border-outline-variant/20"
                        >
                          {ind}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-4 pt-2.5 border-t border-border">
                    <button
                      onClick={() => handleApplyTemplateStack(tmpl.indicators)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-primary-container hover:bg-accent-hover text-white text-xs font-mono font-medium transition-colors shadow-xs cursor-pointer"
                    >
                      <LayoutTemplate size={12} />
                      <span>Apply Stack</span>
                    </button>

                    {!tmpl.isBuiltin && (
                      <button
                        onClick={() => handleDeleteTemplate(tmpl.id)}
                        className="p-1.5 text-muted hover:text-tertiary hover:bg-tertiary/10 rounded transition-colors cursor-pointer"
                        title="Delete template"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
