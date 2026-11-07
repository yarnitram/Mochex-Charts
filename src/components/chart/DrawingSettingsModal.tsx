"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Settings2,
  Sliders,
  Hash,
  Type,
  Trash2,
  Plus,
  Bookmark,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import {
  ChartDrawing,
  FibLevelConfig,
  DEFAULT_FIB_LEVELS,
  DEFAULT_GANN_PRICE_LEVELS,
  DEFAULT_GANN_TIME_LEVELS,
  DrawingTemplate,
  calculatePositionMetrics,
} from "@/lib/chart/drawing-math";

interface DrawingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: ChartDrawing | null;
  onUpdateDrawing: (updated: ChartDrawing) => void;
  onDeleteDrawing?: (id: string) => void;
}

const PALETTE_COLORS = [
  "#2962ff",
  "#00c087",
  "#ff3b30",
  "#f5ac37",
  "#9353d3",
  "#00d8ff",
  "#ffffff",
  "#8d90a2",
];

export function DrawingSettingsModal({
  isOpen,
  onClose,
  drawing,
  onUpdateDrawing,
  onDeleteDrawing,
}: DrawingSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"style" | "coordinates" | "text">("style");

  // Local styling state
  const [color, setColor] = useState("#2962ff");
  const [lineWidth, setLineWidth] = useState(2);
  const [lineStyle, setLineStyle] = useState<"solid" | "dashed" | "dotted">("solid");
  const [fillColor, setFillColor] = useState("#2962ff");
  const [fillOpacity, setFillOpacity] = useState(15);
  const [extendRight, setExtendRight] = useState(false);
  const [extendLeft, setExtendLeft] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

  // Rectangle 50% Equilibrium Line (DEC-060)
  const [showMidLine, setShowMidLine] = useState(false);
  const [midLineColor, setMidLineColor] = useState("#2962ff");
  const [midLineStyle, setMidLineStyle] = useState<"solid" | "dashed" | "dotted">("dashed");

  // Text Alignment (DEC-061)
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("left");
  const [textVAlign, setTextVAlign] = useState<"top" | "middle" | "bottom">("top");

  // Gann Box Details (DEC-059)
  const [gannPriceLevels, setGannPriceLevels] = useState<FibLevelConfig[]>(DEFAULT_GANN_PRICE_LEVELS);
  const [gannTimeLevels, setGannTimeLevels] = useState<FibLevelConfig[]>(DEFAULT_GANN_TIME_LEVELS);
  const [showGannAngles, setShowGannAngles] = useState(true);
  const [gannAnglesColor, setGannAnglesColor] = useState("rgba(245, 172, 55, 0.6)");

  // Background Fill Shading Controls (DEC-058)
  const [showBackground, setShowBackground] = useState(true);

  // Fibonacci levels
  const [fibLevels, setFibLevels] = useState<FibLevelConfig[]>(DEFAULT_FIB_LEVELS);

  // Position tool parameters (DEC-066)
  const [targetPrice, setTargetPrice] = useState(0);
  const [stopPrice, setStopPrice] = useState(0);
  const [profitColor, setProfitColor] = useState("#089981");
  const [profitOpacity, setProfitOpacity] = useState(20);
  const [stopColor, setStopColor] = useState("#f23636");
  const [stopOpacity, setStopOpacity] = useState(20);
  const [accountSize, setAccountSize] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1.0);
  const [showLabels, setShowLabels] = useState(true);

  // Fixed Range Volume Profile (FRVP) parameters (DEC-128)
  const [frvpRows, setFrvpRows] = useState(24);
  const [frvpValueAreaPct, setFrvpValueAreaPct] = useState(70);
  const [frvpPlacement, setFrvpPlacement] = useState<"left" | "right">("left");
  const [frvpWidthPct, setFrvpWidthPct] = useState(68);
  const [frvpPocColor, setFrvpPocColor] = useState("#ff5252");
  const [frvpVahColor, setFrvpVahColor] = useState("#2962ff");
  const [frvpValColor, setFrvpValColor] = useState("#2962ff");
  const [frvpShowBackground, setFrvpShowBackground] = useState(true);
  const [frvpBackgroundColor, setFrvpBackgroundColor] = useState("#2962ff");
  const [frvpBackgroundOpacity, setFrvpBackgroundOpacity] = useState(12);

  // Coordinates
  const [startPrice, setStartPrice] = useState(0);
  const [endPrice, setEndPrice] = useState(0);

  // Text
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(11);

  // Templates state (DEC-051)
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState("");
  const [savedTemplates, setSavedTemplates] = useState<DrawingTemplate[]>([]);

  // Load saved templates for current drawing type from localStorage
  useEffect(() => {
    if (!drawing) return;
    try {
      const stored = localStorage.getItem(`mochex:templates:${drawing.type}`);
      if (stored) {
        setSavedTemplates(JSON.parse(stored));
      } else {
        setSavedTemplates([]);
      }
    } catch {
      setSavedTemplates([]);
    }
  }, [drawing?.type]);

  const loadedDrawingIdRef = useRef<string | null>(null);

  // Populate state whenever modal opens or a different drawing is selected
  useEffect(() => {
    if (!isOpen || !drawing) {
      loadedDrawingIdRef.current = null;
      return;
    }
    // Prevent re-populating and triggering recursive re-renders while editing the current drawing
    if (loadedDrawingIdRef.current === drawing.id) {
      return;
    }
    loadedDrawingIdRef.current = drawing.id;

    setColor(drawing.color || "#2962ff");
    setLineWidth(drawing.lineWidth || 2);
    setLineStyle(drawing.lineStyle || "solid");
    setFillColor(drawing.fillColor || drawing.color || "#2962ff");
    setFillOpacity(drawing.fillOpacity !== undefined ? Math.round(drawing.fillOpacity * 100) : 15);
    setExtendRight(!!drawing.extendRight);
    setExtendLeft(!!drawing.extendLeft);
    setShowMetrics(drawing.showMetrics === true);
    setStartPrice(drawing.startPrice);
    setEndPrice(drawing.endPrice);
    setText(drawing.text || "");
    setFontSize(drawing.fontSize || 11);

    setShowMidLine(!!drawing.showMidLine);
    setMidLineColor(drawing.midLineColor || drawing.color || "#2962ff");
    setMidLineStyle(drawing.midLineStyle || "dashed");
    setTextAlign(drawing.textAlign || "left");
    setTextVAlign(drawing.textVAlign || "top");
    setGannPriceLevels(
      drawing.gannPriceLevels && drawing.gannPriceLevels.length > 0
        ? drawing.gannPriceLevels
        : DEFAULT_GANN_PRICE_LEVELS
    );
    setGannTimeLevels(
      drawing.gannTimeLevels && drawing.gannTimeLevels.length > 0
        ? drawing.gannTimeLevels
        : DEFAULT_GANN_TIME_LEVELS
    );
    setShowGannAngles(drawing.showGannAngles !== false);
    setGannAnglesColor(drawing.gannAnglesColor || "rgba(245, 172, 55, 0.6)");
    setShowBackground(drawing.showBackground !== false);

    // Fibonacci levels
    if (drawing.type === "fibonacci" || drawing.type === "trend_fib") {
      setFibLevels(
        drawing.fibLevels && drawing.fibLevels.length > 0
          ? drawing.fibLevels
          : DEFAULT_FIB_LEVELS
      );
    }

    if (drawing.type === "fixed_range_volume_profile") {
      setFrvpRows(drawing.frvpRows || 24);
      setFrvpValueAreaPct(drawing.frvpValueAreaPct || 70);
      setFrvpPlacement(drawing.frvpPlacement || "left");
      setFrvpWidthPct(drawing.frvpWidthPct || 68);
      setFrvpPocColor(drawing.frvpPocColor || "#ff5252");
      setFrvpVahColor(drawing.frvpVahColor || drawing.frvpVaColor || "#2962ff");
      setFrvpValColor(drawing.frvpValColor || drawing.frvpVaColor || "#2962ff");
      setFrvpShowBackground(
        drawing.frvpShowBackground !== undefined
          ? drawing.frvpShowBackground
          : drawing.showBackground !== false
      );
      setFrvpBackgroundColor(drawing.frvpBackgroundColor || drawing.fillColor || "#2962ff");
      setFrvpBackgroundOpacity(
        drawing.frvpBackgroundOpacity !== undefined
          ? Math.round(drawing.frvpBackgroundOpacity * 100)
          : drawing.fillOpacity !== undefined
          ? Math.round(drawing.fillOpacity * 100)
          : 12
      );
      setShowLabels(drawing.showLabels !== false);
    }

    // Position tool levels (DEC-066)
    if (drawing.type === "long_position" || drawing.type === "short_position") {
      setProfitColor(drawing.profitColor || "#089981");
      setProfitOpacity(drawing.profitOpacity !== undefined ? drawing.profitOpacity : 20);
      setStopColor(drawing.stopColor || "#f23636");
      setStopOpacity(drawing.stopOpacity !== undefined ? drawing.stopOpacity : 20);
      setAccountSize(drawing.accountSize || 10000);
      setRiskPercent(drawing.riskPercent || 1.0);
      setShowLabels(drawing.showLabels !== false);

      const metrics = calculatePositionMetrics(
        drawing.startPrice,
        drawing.targetPrice || drawing.endPrice,
        drawing.stopPrice,
        drawing.type === "long_position",
        drawing.accountSize || 10000,
        drawing.riskPercent || 1.0
      );
      setTargetPrice(metrics.targetPrice);
      setStopPrice(metrics.stopPrice);
    }
  }, [isOpen, drawing?.id]);

  if (!isOpen || !drawing) return null;

  const handleApply = () => {
    onUpdateDrawing({
      ...drawing,
      color,
      lineWidth,
      lineStyle,
      fillColor,
      fillOpacity: fillOpacity / 100,
      extendRight,
      extendLeft,
      showMetrics,
      startPrice,
      endPrice,
      targetPrice: (drawing.type === "long_position" || drawing.type === "short_position") ? targetPrice : undefined,
      stopPrice: (drawing.type === "long_position" || drawing.type === "short_position") ? stopPrice : undefined,
      profitColor: (drawing.type === "long_position" || drawing.type === "short_position") ? profitColor : undefined,
      profitOpacity: (drawing.type === "long_position" || drawing.type === "short_position") ? profitOpacity : undefined,
      stopColor: (drawing.type === "long_position" || drawing.type === "short_position") ? stopColor : undefined,
      stopOpacity: (drawing.type === "long_position" || drawing.type === "short_position") ? stopOpacity : undefined,
      accountSize: (drawing.type === "long_position" || drawing.type === "short_position") ? accountSize : undefined,
      riskPercent: (drawing.type === "long_position" || drawing.type === "short_position") ? riskPercent : undefined,
      showLabels: (drawing.type === "long_position" || drawing.type === "short_position" || drawing.type === "fixed_range_volume_profile") ? showLabels : undefined,
      frvpRows: drawing.type === "fixed_range_volume_profile" ? frvpRows : undefined,
      frvpValueAreaPct: drawing.type === "fixed_range_volume_profile" ? frvpValueAreaPct : undefined,
      frvpPlacement: drawing.type === "fixed_range_volume_profile" ? frvpPlacement : undefined,
      frvpWidthPct: drawing.type === "fixed_range_volume_profile" ? frvpWidthPct : undefined,
      frvpPocColor: drawing.type === "fixed_range_volume_profile" ? frvpPocColor : undefined,
      frvpVahColor: drawing.type === "fixed_range_volume_profile" ? frvpVahColor : undefined,
      frvpValColor: drawing.type === "fixed_range_volume_profile" ? frvpValColor : undefined,
      frvpShowBackground: drawing.type === "fixed_range_volume_profile" ? frvpShowBackground : undefined,
      frvpBackgroundColor: drawing.type === "fixed_range_volume_profile" ? frvpBackgroundColor : undefined,
      frvpBackgroundOpacity: drawing.type === "fixed_range_volume_profile" ? frvpBackgroundOpacity / 100 : undefined,
      fibLevels: (drawing.type === "fibonacci" || drawing.type === "trend_fib") ? fibLevels : undefined,
      text,
      fontSize,
      showMidLine: drawing.type === "rectangle" ? showMidLine : undefined,
      midLineColor: drawing.type === "rectangle" ? midLineColor : undefined,
      midLineStyle: drawing.type === "rectangle" ? midLineStyle : undefined,
      textAlign,
      textVAlign,
      gannPriceLevels: drawing.type === "gann_box" ? gannPriceLevels : undefined,
      gannTimeLevels: drawing.type === "gann_box" ? gannTimeLevels : undefined,
      showGannAngles: drawing.type === "gann_box" ? showGannAngles : undefined,
      gannAnglesColor: drawing.type === "gann_box" ? gannAnglesColor : undefined,
      showBackground,
    });
    onClose();
  };

  const handleLiveChange = (updates: Partial<ChartDrawing>) => {
    onUpdateDrawing({
      ...drawing,
      color,
      lineWidth,
      lineStyle,
      fillColor,
      fillOpacity: fillOpacity / 100,
      extendRight,
      extendLeft,
      showMetrics,
      startPrice,
      endPrice,
      targetPrice: (drawing.type === "long_position" || drawing.type === "short_position") ? targetPrice : undefined,
      stopPrice: (drawing.type === "long_position" || drawing.type === "short_position") ? stopPrice : undefined,
      profitColor: (drawing.type === "long_position" || drawing.type === "short_position") ? profitColor : undefined,
      profitOpacity: (drawing.type === "long_position" || drawing.type === "short_position") ? profitOpacity : undefined,
      stopColor: (drawing.type === "long_position" || drawing.type === "short_position") ? stopColor : undefined,
      stopOpacity: (drawing.type === "long_position" || drawing.type === "short_position") ? stopOpacity : undefined,
      accountSize: (drawing.type === "long_position" || drawing.type === "short_position") ? accountSize : undefined,
      riskPercent: (drawing.type === "long_position" || drawing.type === "short_position") ? riskPercent : undefined,
      showLabels: (drawing.type === "long_position" || drawing.type === "short_position" || drawing.type === "fixed_range_volume_profile") ? showLabels : undefined,
      frvpRows: drawing.type === "fixed_range_volume_profile" ? frvpRows : undefined,
      frvpValueAreaPct: drawing.type === "fixed_range_volume_profile" ? frvpValueAreaPct : undefined,
      frvpPlacement: drawing.type === "fixed_range_volume_profile" ? frvpPlacement : undefined,
      frvpWidthPct: drawing.type === "fixed_range_volume_profile" ? frvpWidthPct : undefined,
      frvpPocColor: drawing.type === "fixed_range_volume_profile" ? frvpPocColor : undefined,
      frvpVahColor: drawing.type === "fixed_range_volume_profile" ? frvpVahColor : undefined,
      frvpValColor: drawing.type === "fixed_range_volume_profile" ? frvpValColor : undefined,
      frvpShowBackground: drawing.type === "fixed_range_volume_profile" ? frvpShowBackground : undefined,
      frvpBackgroundColor: drawing.type === "fixed_range_volume_profile" ? frvpBackgroundColor : undefined,
      frvpBackgroundOpacity: drawing.type === "fixed_range_volume_profile" ? frvpBackgroundOpacity / 100 : undefined,
      fibLevels: (drawing.type === "fibonacci" || drawing.type === "trend_fib") ? fibLevels : undefined,
      text,
      fontSize,
      showMidLine: drawing.type === "rectangle" ? showMidLine : undefined,
      midLineColor: drawing.type === "rectangle" ? midLineColor : undefined,
      midLineStyle: drawing.type === "rectangle" ? midLineStyle : undefined,
      textAlign,
      textVAlign,
      gannPriceLevels: drawing.type === "gann_box" ? gannPriceLevels : undefined,
      gannTimeLevels: drawing.type === "gann_box" ? gannTimeLevels : undefined,
      showGannAngles: drawing.type === "gann_box" ? showGannAngles : undefined,
      gannAnglesColor: drawing.type === "gann_box" ? gannAnglesColor : undefined,
      showBackground,
      ...updates,
    });
  };

  // Template handlers (DEC-051)
  const handleSaveTemplate = () => {
    if (!templateNameInput.trim()) return;
    const newTemplate: DrawingTemplate = {
      id: `tmpl_${Date.now()}`,
      name: templateNameInput.trim(),
      toolType: drawing.type,
      style: {
        color,
        lineWidth,
        lineStyle,
        fillColor,
        fillOpacity: fillOpacity / 100,
        extendRight,
        extendLeft,
        showMetrics,
        fibLevels: (drawing.type === "fibonacci" || drawing.type === "trend_fib") ? fibLevels : undefined,
      },
      createdAt: Date.now(),
    };

    const updated = [...savedTemplates, newTemplate];
    setSavedTemplates(updated);
    try {
      localStorage.setItem(`mochex:templates:${drawing.type}`, JSON.stringify(updated));
    } catch {}
    setTemplateNameInput("");
    setIsTemplateMenuOpen(false);
  };

  const handleApplyTemplate = (tmpl: DrawingTemplate) => {
    const s = tmpl.style;
    if (s.color) setColor(s.color);
    if (s.lineWidth) setLineWidth(s.lineWidth);
    if (s.lineStyle) setLineStyle(s.lineStyle);
    if (s.fillColor) setFillColor(s.fillColor);
    if (s.fillOpacity !== undefined) setFillOpacity(Math.round(s.fillOpacity * 100));
    if (s.extendRight !== undefined) setExtendRight(s.extendRight);
    if (s.extendLeft !== undefined) setExtendLeft(s.extendLeft);
    if (s.showMetrics !== undefined) setShowMetrics(s.showMetrics);
    if (s.fibLevels) setFibLevels(s.fibLevels);

    handleLiveChange(s);
    setIsTemplateMenuOpen(false);
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedTemplates.filter((t) => t.id !== id);
    setSavedTemplates(updated);
    try {
      localStorage.setItem(`mochex:templates:${drawing.type}`, JSON.stringify(updated));
    } catch {}
  };

  const handleApplyDefaultTemplate = () => {
    setColor("#2962ff");
    setLineWidth(2);
    setLineStyle("solid");
    setFillColor("#2962ff");
    setFillOpacity(15);
    setExtendRight(false);
    setExtendLeft(false);
    setShowMetrics(false);
    setFibLevels(DEFAULT_FIB_LEVELS);

    handleLiveChange({
      color: "#2962ff",
      lineWidth: 2,
      lineStyle: "solid",
      fillColor: "#2962ff",
      fillOpacity: 0.15,
      extendRight: false,
      extendLeft: false,
      showMetrics: false,
      fibLevels: DEFAULT_FIB_LEVELS,
    });
    setIsTemplateMenuOpen(false);
  };

  // Fibonacci Level Editing Helpers (DEC-050)
  const handleToggleFibLevel = (idx: number) => {
    const next = [...fibLevels];
    next[idx] = { ...next[idx], enabled: !next[idx].enabled };
    setFibLevels(next);
    handleLiveChange({ fibLevels: next });
  };

  const handleChangeFibRatio = (idx: number, ratioVal: number) => {
    const next = [...fibLevels];
    next[idx] = { ...next[idx], ratio: ratioVal };
    setFibLevels(next);
    handleLiveChange({ fibLevels: next });
  };

  const handleChangeFibColor = (idx: number, col: string) => {
    const next = [...fibLevels];
    next[idx] = { ...next[idx], color: col, bg: col.replace(")", ", 0.08)").replace("rgb", "rgba") };
    setFibLevels(next);
    handleLiveChange({ fibLevels: next });
  };

  const handleAddFibLevel = () => {
    const next = [...fibLevels, { ratio: 0.5, color: "#2962ff", enabled: true }];
    setFibLevels(next);
    handleLiveChange({ fibLevels: next });
  };

  const handleDeleteFibLevel = (idx: number) => {
    if (fibLevels.length <= 1) return;
    const next = fibLevels.filter((_, i) => i !== idx);
    setFibLevels(next);
    handleLiveChange({ fibLevels: next });
  };

  const handleChangeFibBgColor = (idx: number, bgCol: string) => {
    const next = [...fibLevels];
    next[idx] = { ...next[idx], bg: bgCol };
    setFibLevels(next);
    handleLiveChange({ fibLevels: next });
  };

  // Gann Box Level Editing Helpers (DEC-059)
  const handleToggleGannPriceLevel = (idx: number) => {
    const next = [...gannPriceLevels];
    next[idx] = { ...next[idx], enabled: !next[idx].enabled };
    setGannPriceLevels(next);
    handleLiveChange({ gannPriceLevels: next });
  };

  const handleChangeGannPriceRatio = (idx: number, ratioVal: number) => {
    const next = [...gannPriceLevels];
    next[idx] = { ...next[idx], ratio: ratioVal };
    setGannPriceLevels(next);
    handleLiveChange({ gannPriceLevels: next });
  };

  const handleChangeGannPriceColor = (idx: number, col: string) => {
    const next = [...gannPriceLevels];
    next[idx] = { ...next[idx], color: col };
    setGannPriceLevels(next);
    handleLiveChange({ gannPriceLevels: next });
  };

  const handleToggleGannTimeLevel = (idx: number) => {
    const next = [...gannTimeLevels];
    next[idx] = { ...next[idx], enabled: !next[idx].enabled };
    setGannTimeLevels(next);
    handleLiveChange({ gannTimeLevels: next });
  };

  const handleChangeGannTimeRatio = (idx: number, ratioVal: number) => {
    const next = [...gannTimeLevels];
    next[idx] = { ...next[idx], ratio: ratioVal };
    setGannTimeLevels(next);
    handleLiveChange({ gannTimeLevels: next });
  };

  const handleChangeGannTimeColor = (idx: number, col: string) => {
    const next = [...gannTimeLevels];
    next[idx] = { ...next[idx], color: col };
    setGannTimeLevels(next);
    handleLiveChange({ gannTimeLevels: next });
  };

  const isFibTool = drawing.type === "fibonacci" || drawing.type === "trend_fib";
  const isPositionTool = drawing.type === "long_position" || drawing.type === "short_position";
  const isGannBox = drawing.type === "gann_box";

  const isFillApplicable =
    (drawing.type === "rectangle" ||
      drawing.type === "date_range" ||
      drawing.type === "circle" ||
      isFibTool ||
      isGannBox) &&
    !isPositionTool;

  const isExtensionApplicable =
    drawing.type === "trendline" ||
    drawing.type === "rectangle" ||
    drawing.type === "fixed_range_volume_profile" ||
    isFibTool;

  const positionMetrics = isPositionTool
    ? calculatePositionMetrics(
        startPrice,
        targetPrice,
        stopPrice,
        drawing.type === "long_position",
        accountSize,
        riskPercent
      )
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-surface-container-low border border-border w-[490px] max-w-[95vw] rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs font-mono animate-in fade-in zoom-in-95 duration-150 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-primary" />
            <span className="font-semibold text-on-surface text-sm uppercase tracking-wide">
              {drawing.type.replace("_", " ")} Settings
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-on-surface p-1 rounded hover:bg-surface cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-surface-container-lowest/50 px-4 shrink-0">
          <button
            onClick={() => setActiveTab("style")}
            className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-semibold cursor-pointer transition-colors ${
              activeTab === "style"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-on-surface"
            }`}
          >
            <Sliders size={13} />
            <span>Style</span>
          </button>
          <button
            onClick={() => setActiveTab("coordinates")}
            className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-semibold cursor-pointer transition-colors ${
              activeTab === "coordinates"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-on-surface"
            }`}
          >
            <Hash size={13} />
            <span>Coordinates</span>
          </button>
          <button
            onClick={() => setActiveTab("text")}
            className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-semibold cursor-pointer transition-colors ${
              activeTab === "text"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-on-surface"
            }`}
          >
            <Type size={13} />
            <span>Visibility & Text</span>
          </button>
        </div>

        {/* Modal Tab Body */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
          {/* TAB 1: STYLE */}
          {activeTab === "style" && (
            <div className="flex flex-col gap-3.5">
              {/* Primary Line Color */}
              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px]">Line / Primary Color:</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1">
                    {PALETTE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setColor(c);
                          handleLiveChange({ color: c });
                        }}
                        style={{ backgroundColor: c }}
                        className={`w-4 h-4 rounded-full border cursor-pointer transition-transform ${
                          color === c ? "scale-125 border-white ring-1 ring-primary" : "border-border/50 hover:scale-110"
                        }`}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={color.startsWith("#") ? color : "#2962ff"}
                    onChange={(e) => {
                      setColor(e.target.value);
                      handleLiveChange({ color: e.target.value });
                    }}
                    className="w-5 h-5 rounded border border-border bg-surface cursor-pointer p-0 ml-1"
                  />
                </div>
              </div>

              {/* Line Width */}
              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px]">Line Width:</span>
                <div className="flex gap-1 bg-surface p-1 rounded border border-border">
                  {[1, 2, 3, 4].map((w) => (
                    <button
                      key={w}
                      onClick={() => {
                        setLineWidth(w);
                        handleLiveChange({ lineWidth: w });
                      }}
                      className={`px-2.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                        lineWidth === w ? "bg-primary text-white" : "text-muted hover:text-on-surface"
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Style */}
              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px]">Line Style:</span>
                <div className="flex gap-1 bg-surface p-1 rounded border border-border">
                  {(["solid", "dashed", "dotted"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => {
                        setLineStyle(style);
                        handleLiveChange({ lineStyle: style });
                      }}
                      className={`px-2 py-0.5 rounded capitalize cursor-pointer transition-colors ${
                        lineStyle === style ? "bg-primary text-white" : "text-muted hover:text-on-surface"
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              {/* Full TradingView Fibonacci Retracement Levels Grid (DEC-050, DEC-058) */}
              {isFibTool && (
                <div className="pt-3 border-t border-border flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted text-[11px] font-semibold uppercase">
                      Fibonacci Levels:
                    </span>
                    <button
                      onClick={handleAddFibLevel}
                      className="flex items-center gap-1 text-primary hover:text-primary-hover font-semibold text-[11px] cursor-pointer"
                    >
                      <Plus size={12} />
                      <span>Add Level</span>
                    </button>
                  </div>

                  {/* Master Background Toggle (DEC-058) */}
                  <div className="flex items-center justify-between py-1 px-1.5 bg-surface rounded border border-border/60">
                    <label className="flex items-center gap-2 text-on-surface cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={showBackground}
                        onChange={(e) => {
                          setShowBackground(e.target.checked);
                          handleLiveChange({ showBackground: e.target.checked });
                        }}
                        className="accent-primary rounded"
                      />
                      <span>Background Shading</span>
                    </label>
                    <span className="text-[10px] text-muted">Per-Level Tint Enabled</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 bg-surface-container-lowest/60 rounded border border-border">
                    {fibLevels.map((lvl, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-surface p-1.5 rounded border border-border/70 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={lvl.enabled}
                            onChange={() => handleToggleFibLevel(idx)}
                            className="accent-primary rounded cursor-pointer"
                          />
                          <input
                            type="number"
                            step="0.001"
                            value={lvl.ratio}
                            onChange={(e) =>
                              handleChangeFibRatio(idx, parseFloat(e.target.value) || 0)
                            }
                            className="w-14 bg-surface-container-lowest px-1 py-0.5 rounded border border-border text-on-surface text-right"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            title="Line Color"
                            value={lvl.color.startsWith("#") ? lvl.color : "#2962ff"}
                            onChange={(e) => handleChangeFibColor(idx, e.target.value)}
                            className="w-4 h-4 rounded border border-border cursor-pointer p-0"
                          />
                          <input
                            type="color"
                            title="Background Tint Color"
                            value={lvl.bg?.startsWith("#") ? lvl.bg : "#2962ff"}
                            onChange={(e) => handleChangeFibBgColor(idx, e.target.value)}
                            className="w-4 h-4 rounded border border-border cursor-pointer p-0 opacity-80"
                          />
                          <button
                            onClick={() => handleDeleteFibLevel(idx)}
                            className="text-muted hover:text-tertiary p-0.5 cursor-pointer"
                            title="Remove Level"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gann Box Price Levels, Time Levels & 1x1 Angles (DEC-059) */}
              {isGannBox && (
                <div className="pt-3 border-t border-border flex flex-col gap-3">
                  {/* Price Levels Table */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted text-[11px] font-semibold uppercase">
                      Gann Price Levels:
                    </span>
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-surface-container-lowest/60 rounded border border-border">
                      {gannPriceLevels.map((lvl, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-surface p-1.5 rounded border border-border/70 text-[11px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={lvl.enabled !== false}
                              onChange={() => handleToggleGannPriceLevel(idx)}
                              className="accent-primary rounded cursor-pointer"
                            />
                            <input
                              type="number"
                              step="0.001"
                              value={lvl.ratio}
                              onChange={(e) =>
                                handleChangeGannPriceRatio(idx, parseFloat(e.target.value) || 0)
                              }
                              className="w-14 bg-surface-container-lowest px-1 py-0.5 rounded border border-border text-on-surface text-right"
                            />
                          </div>
                          <input
                            type="color"
                            title="Level Color"
                            value={lvl.color.startsWith("#") ? lvl.color : "#2962ff"}
                            onChange={(e) => handleChangeGannPriceColor(idx, e.target.value)}
                            className="w-5 h-5 rounded border border-border cursor-pointer p-0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Time Levels Table */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted text-[11px] font-semibold uppercase">
                      Gann Time Levels:
                    </span>
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-surface-container-lowest/60 rounded border border-border">
                      {gannTimeLevels.map((lvl, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-surface p-1.5 rounded border border-border/70 text-[11px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={lvl.enabled !== false}
                              onChange={() => handleToggleGannTimeLevel(idx)}
                              className="accent-primary rounded cursor-pointer"
                            />
                            <input
                              type="number"
                              step="0.001"
                              value={lvl.ratio}
                              onChange={(e) =>
                                handleChangeGannTimeRatio(idx, parseFloat(e.target.value) || 0)
                              }
                              className="w-14 bg-surface-container-lowest px-1 py-0.5 rounded border border-border text-on-surface text-right"
                            />
                          </div>
                          <input
                            type="color"
                            title="Level Color"
                            value={lvl.color.startsWith("#") ? lvl.color : "#2962ff"}
                            onChange={(e) => handleChangeGannTimeColor(idx, e.target.value)}
                            className="w-5 h-5 rounded border border-border cursor-pointer p-0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 1x1 Diagonal Rays */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <label className="flex items-center gap-2 text-on-surface cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={showGannAngles}
                        onChange={(e) => {
                          setShowGannAngles(e.target.checked);
                          handleLiveChange({ showGannAngles: e.target.checked });
                        }}
                        className="accent-primary rounded"
                      />
                      <span>1x1 Diagonal Rays (Angles)</span>
                    </label>
                    {showGannAngles && (
                      <input
                        type="color"
                        title="Angles Color"
                        value={gannAnglesColor.startsWith("#") ? gannAnglesColor : "#f5ac37"}
                        onChange={(e) => {
                          setGannAnglesColor(e.target.value);
                          handleLiveChange({ gannAnglesColor: e.target.value });
                        }}
                        className="w-5 h-5 rounded border border-border bg-surface cursor-pointer p-0"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Rectangle 50% Equilibrium Line (DEC-060) */}
              {drawing.type === "rectangle" && (
                <div className="pt-3 border-t border-border flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-on-surface cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={showMidLine}
                        onChange={(e) => {
                          setShowMidLine(e.target.checked);
                          handleLiveChange({ showMidLine: e.target.checked });
                        }}
                        className="accent-primary rounded"
                      />
                      <span className="font-semibold">50% Equilibrium Line (Median)</span>
                    </label>
                    {showMidLine && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          title="50% Line Color"
                          value={midLineColor.startsWith("#") ? midLineColor : color}
                          onChange={(e) => {
                            setMidLineColor(e.target.value);
                            handleLiveChange({ midLineColor: e.target.value });
                          }}
                          className="w-5 h-5 rounded border border-border bg-surface cursor-pointer p-0"
                        />
                        <select
                          value={midLineStyle}
                          onChange={(e) => {
                            const s = e.target.value as "solid" | "dashed" | "dotted";
                            setMidLineStyle(s);
                            handleLiveChange({ midLineStyle: s });
                          }}
                          className="bg-surface border border-border rounded px-1.5 py-0.5 text-[10px] text-on-surface cursor-pointer"
                        >
                          <option value="dashed">Dashed</option>
                          <option value="solid">Solid</option>
                          <option value="dotted">Dotted</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Background Fill & Opacity */}
              {isFillApplicable && (
                <div className="pt-3 border-t border-border flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted text-[11px]">Fill Color:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={fillColor.startsWith("#") ? fillColor : color}
                        onChange={(e) => {
                          setFillColor(e.target.value);
                          handleLiveChange({ fillColor: e.target.value });
                        }}
                        className="w-6 h-6 rounded border border-border bg-surface cursor-pointer p-0.5"
                      />
                      <span className="text-on-surface uppercase text-[11px]">{fillColor}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted text-[11px]">Fill Opacity ({fillOpacity}%):</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={fillOpacity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setFillOpacity(val);
                        handleLiveChange({ fillOpacity: val / 100 });
                      }}
                      className="w-36 cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              )}

              {/* Long / Short Position Independent Colors & Opacity (DEC-066) */}
              {isPositionTool && (
                <div className="pt-3 border-t border-border flex flex-col gap-3">
                  {/* Profit Color & Opacity */}
                  <div className="flex flex-col gap-1.5 p-2 bg-surface rounded border border-border/60">
                    <div className="flex items-center justify-between">
                      <span className="text-secondary font-semibold text-[11px] uppercase tracking-wider">
                        Profit Zone (TP):
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={profitColor}
                          onChange={(e) => {
                            setProfitColor(e.target.value);
                            handleLiveChange({ profitColor: e.target.value });
                          }}
                          className="w-5 h-5 rounded border border-border bg-surface cursor-pointer p-0"
                        />
                        <span className="text-on-surface uppercase text-[11px] font-mono">{profitColor}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span>Opacity ({profitOpacity}%):</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={profitOpacity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setProfitOpacity(val);
                          handleLiveChange({ profitOpacity: val });
                        }}
                        className="w-28 accent-secondary cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Stop Loss Color & Opacity */}
                  <div className="flex flex-col gap-1.5 p-2 bg-surface rounded border border-border/60">
                    <div className="flex items-center justify-between">
                      <span className="text-tertiary font-semibold text-[11px] uppercase tracking-wider">
                        Stop Loss Zone (SL):
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={stopColor}
                          onChange={(e) => {
                            setStopColor(e.target.value);
                            handleLiveChange({ stopColor: e.target.value });
                          }}
                          className="w-5 h-5 rounded border border-border bg-surface cursor-pointer p-0"
                        />
                        <span className="text-on-surface uppercase text-[11px] font-mono">{stopColor}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span>Opacity ({stopOpacity}%):</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={stopOpacity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setStopOpacity(val);
                          handleLiveChange({ stopOpacity: val });
                        }}
                        className="w-28 accent-tertiary cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Show Labels & Badges Toggle */}
                  <div className="flex items-center justify-between py-1 px-2 bg-surface rounded border border-border/60">
                    <label className="flex items-center gap-2 text-on-surface cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={showLabels}
                        onChange={(e) => {
                          setShowLabels(e.target.checked);
                          handleLiveChange({ showLabels: e.target.checked });
                        }}
                        className="accent-primary rounded"
                      />
                      <span>Show TP/SL Summary Cards & Price Tags</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Fixed Range Volume Profile (FRVP) Settings (DEC-128) */}
              {drawing.type === "fixed_range_volume_profile" && (
                <div className="pt-3 border-t border-border flex flex-col gap-3">
                  <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">
                    Fixed Range Volume Profile (FRVP) Settings
                  </span>

                  {/* Number of Rows, Value Area %, Box Width %, Placement Inputs (DEC-129) */}
                  <div className="grid grid-cols-2 gap-2.5 bg-surface-container-lowest p-2.5 rounded-lg border border-border/60">
                    <div className="flex flex-col gap-1.5 text-muted text-[10px]">
                      <div className="flex items-center justify-between">
                        <span>Number of Rows:</span>
                        <input
                          type="number"
                          min="1"
                          value={frvpRows || ""}
                          placeholder="24"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setFrvpRows(0);
                              return;
                            }
                            const val = parseInt(raw, 10);
                            if (!isNaN(val)) {
                              setFrvpRows(val);
                              if (val >= 1) {
                                handleLiveChange({ frvpRows: val });
                              }
                            }
                          }}
                          onBlur={() => {
                            if (!frvpRows || frvpRows < 1) {
                              setFrvpRows(24);
                              handleLiveChange({ frvpRows: 24 });
                            }
                          }}
                          className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-on-surface text-center font-mono text-xs focus:border-primary outline-none"
                        />
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="300"
                        value={Math.min(300, Math.max(2, frvpRows || 24))}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 24;
                          setFrvpRows(val);
                          handleLiveChange({ frvpRows: val });
                        }}
                        className="accent-primary cursor-pointer w-full"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-muted text-[10px]">
                      <div className="flex items-center justify-between">
                        <span>Value Area (%):</span>
                        <input
                          type="number"
                          min="1"
                          value={frvpValueAreaPct || ""}
                          placeholder="70"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setFrvpValueAreaPct(0);
                              return;
                            }
                            const val = parseInt(raw, 10);
                            if (!isNaN(val)) {
                              setFrvpValueAreaPct(val);
                              if (val >= 1) {
                                handleLiveChange({ frvpValueAreaPct: val });
                              }
                            }
                          }}
                          onBlur={() => {
                            if (!frvpValueAreaPct || frvpValueAreaPct < 1) {
                              setFrvpValueAreaPct(70);
                              handleLiveChange({ frvpValueAreaPct: 70 });
                            }
                          }}
                          className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-on-surface text-center font-mono text-xs focus:border-primary outline-none"
                        />
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={Math.min(100, Math.max(1, frvpValueAreaPct || 70))}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 70;
                          setFrvpValueAreaPct(val);
                          handleLiveChange({ frvpValueAreaPct: val });
                        }}
                        className="accent-primary cursor-pointer w-full"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-muted text-[10px]">
                      <div className="flex items-center justify-between">
                        <span>Box Width (%):</span>
                        <input
                          type="number"
                          min="1"
                          value={frvpWidthPct || ""}
                          placeholder="68"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setFrvpWidthPct(0);
                              return;
                            }
                            const val = parseInt(raw, 10);
                            if (!isNaN(val)) {
                              setFrvpWidthPct(val);
                              if (val >= 1) {
                                handleLiveChange({ frvpWidthPct: val });
                              }
                            }
                          }}
                          onBlur={() => {
                            if (!frvpWidthPct || frvpWidthPct < 1) {
                              setFrvpWidthPct(68);
                              handleLiveChange({ frvpWidthPct: 68 });
                            }
                          }}
                          className="w-16 bg-surface px-1.5 py-0.5 rounded border border-border text-on-surface text-center font-mono text-xs focus:border-primary outline-none"
                        />
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="300"
                        value={Math.min(300, Math.max(5, frvpWidthPct || 68))}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 68;
                          setFrvpWidthPct(val);
                          handleLiveChange({ frvpWidthPct: val });
                        }}
                        className="accent-primary cursor-pointer w-full"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-muted text-[10px]">
                      <span className="leading-tight">Histogram Placement:</span>
                      <select
                        value={frvpPlacement}
                        onChange={(e) => {
                          const val = e.target.value as "left" | "right";
                          setFrvpPlacement(val);
                          handleLiveChange({ frvpPlacement: val });
                        }}
                        className="bg-surface px-2 py-1 rounded border border-border text-on-surface font-mono text-[11px] h-[28px] focus:border-primary outline-none"
                      >
                        <option value="left">Left to Right</option>
                        <option value="right">Right to Left</option>
                      </select>
                    </div>
                  </div>

                  {/* Key Profile Lines (VAH, POI / POC, VAL) Customization */}
                  <div className="flex flex-col gap-2 bg-surface-container-lowest p-2.5 rounded-lg border border-border/60">
                    <span className="text-muted text-[10px] font-semibold uppercase tracking-wider">
                      Lines & Level Colors (VAH, POI / POC, VAL):
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {/* POC / POI */}
                      <div className="flex flex-col items-center justify-between p-2 rounded bg-surface border border-border/60 gap-1.5">
                        <span className="text-[10px] text-muted font-medium">POC / POI</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={frvpPocColor}
                            onChange={(e) => {
                              setFrvpPocColor(e.target.value);
                              handleLiveChange({ frvpPocColor: e.target.value });
                            }}
                            className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent p-0"
                            title="Point of Control / Point of Interest line color"
                          />
                        </div>
                      </div>

                      {/* VAH */}
                      <div className="flex flex-col items-center justify-between p-2 rounded bg-surface border border-border/60 gap-1.5">
                        <span className="text-[10px] text-muted font-medium">VAH Line</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={frvpVahColor}
                            onChange={(e) => {
                              setFrvpVahColor(e.target.value);
                              handleLiveChange({ frvpVahColor: e.target.value });
                            }}
                            className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent p-0"
                            title="Value Area High line color"
                          />
                        </div>
                      </div>

                      {/* VAL */}
                      <div className="flex flex-col items-center justify-between p-2 rounded bg-surface border border-border/60 gap-1.5">
                        <span className="text-[10px] text-muted font-medium">VAL Line</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={frvpValColor}
                            onChange={(e) => {
                              setFrvpValColor(e.target.value);
                              handleLiveChange({ frvpValColor: e.target.value });
                            }}
                            className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent p-0"
                            title="Value Area Low line color"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Show Labels Toggle */}
                    <label className="flex items-center justify-between pt-1 text-on-surface cursor-pointer text-[11px]">
                      <span>Show Price Badges & Labels</span>
                      <input
                        type="checkbox"
                        checked={showLabels}
                        onChange={(e) => {
                          setShowLabels(e.target.checked);
                          handleLiveChange({ showLabels: e.target.checked });
                        }}
                        className="accent-primary rounded"
                      />
                    </label>
                  </div>

                  {/* Background Fill & Opacity Controls */}
                  <div className="flex flex-col gap-2.5 bg-surface-container-lowest p-2.5 rounded-lg border border-border/60">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-on-surface cursor-pointer text-[11px] font-medium">
                        <input
                          type="checkbox"
                          checked={frvpShowBackground}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setFrvpShowBackground(val);
                            handleLiveChange({
                              frvpShowBackground: val,
                              showBackground: val,
                            });
                          }}
                          className="accent-primary rounded"
                        />
                        <span>Enable Background Box Shading</span>
                      </label>
                      <span className="text-[10px] text-muted">
                        {frvpShowBackground ? "Visible" : "Hidden (Removed)"}
                      </span>
                    </div>

                    {frvpShowBackground && (
                      <div className="flex flex-col gap-2 pt-1 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-muted text-[10px]">Background Color:</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={frvpBackgroundColor}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFrvpBackgroundColor(val);
                                handleLiveChange({
                                  frvpBackgroundColor: val,
                                  fillColor: val,
                                });
                              }}
                              className="w-5 h-5 rounded border border-border bg-surface cursor-pointer p-0"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 text-muted text-[10px]">
                          <div className="flex items-center justify-between">
                            <span>Background Opacity:</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={frvpBackgroundOpacity}
                                onChange={(e) => {
                                  const val = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                                  setFrvpBackgroundOpacity(val);
                                  handleLiveChange({
                                    frvpBackgroundOpacity: val / 100,
                                    fillOpacity: val / 100,
                                  });
                                }}
                                className="w-14 bg-surface px-1 py-0.5 rounded border border-border text-on-surface text-center font-mono text-xs focus:border-primary outline-none"
                              />
                              <span className="text-[10px] text-muted">%</span>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={frvpBackgroundOpacity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setFrvpBackgroundOpacity(val);
                              handleLiveChange({
                                frvpBackgroundOpacity: val / 100,
                                fillOpacity: val / 100,
                              });
                            }}
                            className="accent-primary cursor-pointer w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Extension Radios (Extend Right / Extend Left) */}
              {isExtensionApplicable && (
                <div className="pt-3 border-t border-border flex flex-col gap-2">
                  <span className="text-muted text-[11px]">Projections:</span>
                  <label className="flex items-center gap-2 text-on-surface cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={extendRight}
                      onChange={(e) => {
                        setExtendRight(e.target.checked);
                        handleLiveChange({ extendRight: e.target.checked });
                      }}
                      className="accent-primary rounded"
                    />
                    <span>Extend Right (Infinite Supply / Demand Ray)</span>
                  </label>
                  <label className="flex items-center gap-2 text-on-surface cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={extendLeft}
                      onChange={(e) => {
                        setExtendLeft(e.target.checked);
                        handleLiveChange({ extendLeft: e.target.checked });
                      }}
                      className="accent-primary rounded"
                    />
                    <span>Extend Left (Historical Projection)</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COORDINATES */}
          {activeTab === "coordinates" && (
            <div className="flex flex-col gap-3">
              {isPositionTool && positionMetrics && (
                <div className="bg-surface-container-lowest p-3 rounded-lg border border-border flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-border/60">
                    <span className="text-muted font-semibold uppercase">Risk/Reward Ratio:</span>
                    <span className="text-primary font-bold text-sm bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                      1 : {positionMetrics.riskRewardRatio.toFixed(2)}
                    </span>
                  </div>

                  {/* Account Size & Risk Inputs */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex flex-col gap-1 text-muted text-[10px]">
                      <span>Account Size ($):</span>
                      <input
                        type="number"
                        min="1"
                        step="100"
                        value={accountSize}
                        onChange={(e) => {
                          const val = Math.max(1, parseFloat(e.target.value) || 10000);
                          setAccountSize(val);
                          handleLiveChange({ accountSize: val });
                        }}
                        className="bg-surface px-2 py-1 rounded border border-border text-right text-on-surface font-mono text-[11px]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-muted text-[10px]">
                      <span>Risk (% Equity):</span>
                      <input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.1"
                        value={riskPercent}
                        onChange={(e) => {
                          const val = Math.max(0.01, parseFloat(e.target.value) || 1);
                          setRiskPercent(val);
                          handleLiveChange({ riskPercent: val });
                        }}
                        className="bg-surface px-2 py-1 rounded border border-border text-right text-on-surface font-mono text-[11px]"
                      />
                    </label>
                  </div>

                  {/* Computed Risk & Lot Sizing Card */}
                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-surface rounded border border-border/60 text-center">
                    <div>
                      <div className="text-[9px] text-muted uppercase">Risk Amount</div>
                      <div className="text-[11px] font-bold text-tertiary">
                        ${positionMetrics.riskAmount.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted uppercase">Position Size</div>
                      <div className="text-[11px] font-bold text-primary font-mono">
                        {positionMetrics.quantity.toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted uppercase">Est. Profit</div>
                      <div className="text-[11px] font-bold text-secondary">
                        +${positionMetrics.estimatedProfit.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted pt-1">
                    <span>
                      Target: <span className="text-secondary font-semibold">+{positionMetrics.targetPercent.toFixed(2)}% (+${positionMetrics.targetDiff.toFixed(2)})</span>
                    </span>
                    <span>
                      Stop: <span className="text-tertiary font-semibold">-{positionMetrics.stopPercent.toFixed(2)}% (-${positionMetrics.stopDiff.toFixed(2)})</span>
                    </span>
                  </div>
                </div>
              )}

              <label className="flex items-center justify-between text-muted text-[11px]">
                <span>{isPositionTool ? "Entry Price ($):" : "Start Price ($):"}</span>
                <input
                  type="number"
                  step="any"
                  value={startPrice}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setStartPrice(val);
                    handleLiveChange({ startPrice: val });
                  }}
                  className="w-28 bg-surface px-2 py-1 rounded border border-border text-right text-on-surface font-mono"
                />
              </label>

              {isPositionTool ? (
                <>
                  <label className="flex items-center justify-between text-muted text-[11px]">
                    <span>Take Profit Target ($):</span>
                    <input
                      type="number"
                      step="any"
                      value={targetPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setTargetPrice(val);
                        handleLiveChange({ targetPrice: val, endPrice: val });
                      }}
                      className="w-28 bg-surface px-2 py-1 rounded border border-secondary text-right text-secondary font-mono"
                    />
                  </label>
                  <label className="flex items-center justify-between text-muted text-[11px]">
                    <span>Stop Loss Price ($):</span>
                    <input
                      type="number"
                      step="any"
                      value={stopPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setStopPrice(val);
                        handleLiveChange({ stopPrice: val });
                      }}
                      className="w-28 bg-surface px-2 py-1 rounded border border-tertiary text-right text-tertiary font-mono"
                    />
                  </label>
                </>
              ) : (
                <label className="flex items-center justify-between text-muted text-[11px]">
                  <span>End Price ($):</span>
                  <input
                    type="number"
                    step="any"
                    value={endPrice}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEndPrice(val);
                      handleLiveChange({ endPrice: val });
                    }}
                    className="w-28 bg-surface px-2 py-1 rounded border border-border text-right text-on-surface font-mono"
                  />
                </label>
              )}

              <div className="pt-2 border-t border-border flex flex-col gap-1 text-[10px] text-muted">
                <span>Start Time: {new Date(drawing.startTime).toLocaleString()}</span>
                <span>End Time: {new Date(drawing.endTime).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* TAB 3: TEXT & VISIBILITY */}
          {activeTab === "text" && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-muted text-[11px]">
                <span>Annotation Text Note:</span>
                <input
                  type="text"
                  placeholder="e.g. Order Block / Liquidity Pool / Target"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    handleLiveChange({ text: e.target.value });
                  }}
                  className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface focus:border-primary outline-hidden"
                />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px]">Font Size:</span>
                <div className="flex gap-1 bg-surface p-1 rounded border border-border">
                  {[10, 11, 12, 14].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => {
                        setFontSize(sz);
                        handleLiveChange({ fontSize: sz });
                      }}
                      className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                        fontSize === sz ? "bg-primary text-white" : "text-muted hover:text-on-surface"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Alignment (DEC-061) */}
              <div className="pt-2 border-t border-border flex flex-col gap-2">
                <span className="text-muted text-[11px] font-semibold">Text Alignment:</span>
                <div className="grid grid-cols-2 gap-3 bg-surface p-2 rounded border border-border">
                  <div>
                    <span className="text-[10px] text-muted block mb-1">Horizontal:</span>
                    <div className="flex gap-1">
                      {(["left", "center", "right"] as const).map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => {
                            setTextAlign(h);
                            handleLiveChange({ textAlign: h });
                          }}
                          className={`flex-1 py-1 rounded capitalize text-[10px] cursor-pointer transition-colors ${
                            textAlign === h
                              ? "bg-primary text-white font-semibold"
                              : "bg-surface-container text-muted hover:text-on-surface"
                          }`}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block mb-1">Vertical:</span>
                    <div className="flex gap-1">
                      {(["top", "middle", "bottom"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            setTextVAlign(v);
                            handleLiveChange({ textVAlign: v });
                          }}
                          className={`flex-1 py-1 rounded capitalize text-[10px] cursor-pointer transition-colors ${
                            textVAlign === v
                              ? "bg-primary text-white font-semibold"
                              : "bg-surface-container text-muted hover:text-on-surface"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex flex-col gap-2">
                <label className="flex items-center gap-2 text-on-surface cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={showMetrics}
                    onChange={(e) => {
                      setShowMetrics(e.target.checked);
                      handleLiveChange({ showMetrics: e.target.checked });
                    }}
                    className="accent-primary rounded"
                  />
                  <span>Show Metrics Telemetry Badge (ΔP, Δ%, Bars)</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Templates Dropdown + Actions (DEC-051) */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-container-lowest shrink-0 relative">
          {/* Template Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsTemplateMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface hover:bg-surface-container border border-border text-muted hover:text-on-surface cursor-pointer transition-colors text-[11px]"
            >
              <Bookmark size={13} className="text-primary" />
              <span>Template</span>
              <ChevronDown size={12} />
            </button>

            {/* Template Popover (DEC-051) */}
            {isTemplateMenuOpen && (
              <div className="absolute left-0 bottom-10 z-50 bg-surface-container-low border border-border rounded-lg shadow-2xl p-2 w-64 backdrop-blur-md flex flex-col gap-2 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                  <span className="font-semibold text-on-surface text-[11px] uppercase">
                    Saved Templates
                  </span>
                  <button
                    onClick={handleApplyDefaultTemplate}
                    className="text-[10px] text-muted hover:text-primary flex items-center gap-1 cursor-pointer"
                    title="Reset to Factory Defaults"
                  >
                    <RotateCcw size={10} />
                    <span>Defaults</span>
                  </button>
                </div>

                {/* Save As Inline Form */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Template name..."
                    value={templateNameInput}
                    onChange={(e) => setTemplateNameInput(e.target.value)}
                    className="flex-1 bg-surface px-2 py-1 rounded border border-border text-[11px] text-on-surface outline-hidden"
                  />
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!templateNameInput.trim()}
                    className="px-2.5 py-1 rounded bg-primary text-white font-semibold text-[10px] hover:bg-primary-hover disabled:opacity-40 cursor-pointer"
                  >
                    Save
                  </button>
                </div>

                {/* Saved Templates List */}
                <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pt-1">
                  {savedTemplates.length === 0 ? (
                    <span className="text-muted text-[10px] italic py-1 text-center">
                      No saved templates for this tool
                    </span>
                  ) : (
                    savedTemplates.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        onClick={() => handleApplyTemplate(tmpl)}
                        className="flex items-center justify-between px-2 py-1 rounded hover:bg-surface-container cursor-pointer group text-[11px] text-on-surface"
                      >
                        <span className="truncate">{tmpl.name}</span>
                        <button
                          onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-muted hover:text-tertiary p-0.5"
                          title="Delete Template"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Delete & Cancel / Apply Actions */}
          <div className="flex items-center gap-2">
            {onDeleteDrawing && !drawing.isLocked && (
              <button
                onClick={() => {
                  onDeleteDrawing(drawing.id);
                  onClose();
                }}
                className="text-tertiary hover:bg-tertiary/10 p-1.5 rounded transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                title="Delete Drawing"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-muted hover:text-on-surface hover:bg-surface transition-colors cursor-pointer text-[11px]"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 rounded bg-primary text-white font-semibold hover:bg-primary-hover transition-colors cursor-pointer shadow-xs text-[11px]"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
