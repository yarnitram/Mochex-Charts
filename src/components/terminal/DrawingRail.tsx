"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Crosshair,
  Magnet,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  ChevronRight,
  Star,
  Layers,
  Sliders,
} from "lucide-react";
import {
  TrendlineIcon,
  HorizontalLineIcon,
  VerticalLineIcon,
  FibRetracementIcon,
  TrendFibIcon,
  GannBoxIcon,
  RectangleIcon,
  CircleIcon,
  PathIcon,
  BrushIcon,
  TextIcon,
  LongPositionIcon,
  ShortPositionIcon,
  DateRangeIcon,
  FixedRangeVolumeProfileIcon,
} from "./drawing-icons";

export type DrawingToolType =
  | "crosshair"
  | "trendline"
  | "horizontal_line"
  | "vertical_line"
  | "long_position"
  | "short_position"
  | "date_range"
  | "fixed_range_volume_profile"
  | "rectangle"
  | "path"
  | "circle"
  | "brush"
  | "text"
  | "fibonacci"
  | "trend_fib"
  | "gann_box"
  | "none";

interface ToolVariant {
  id: DrawingToolType;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
}

interface ToolGroup {
  groupId: string;
  name: string;
  defaultTool: DrawingToolType;
  variants: ToolVariant[];
}

export interface DrawingRailProps {
  activeTool: DrawingToolType;
  onSelectTool: (tool: DrawingToolType) => void;
  isMagnetActive?: boolean;
  onToggleMagnet?: () => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  isHidden?: boolean;
  onToggleHide?: () => void;
  onClearDrawings?: () => void;
  onClearIndicators?: () => void;
  onClearAll?: () => void;
  favoriteTools?: DrawingToolType[];
  onToggleFavorite?: (tool: DrawingToolType) => void;
  showFavoritesBar?: boolean;
  onToggleFavoritesBar?: () => void;
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    groupId: "lines",
    name: "Lines & Rays",
    defaultTool: "trendline",
    variants: [
      { id: "trendline", label: "Trendline", shortcut: "T", icon: <TrendlineIcon size={16} /> },
      { id: "horizontal_line", label: "Horizontal Line", shortcut: "H", icon: <HorizontalLineIcon size={16} /> },
      { id: "vertical_line", label: "Vertical Line", shortcut: "V", icon: <VerticalLineIcon size={16} /> },
    ],
  },
  {
    groupId: "fib_gann",
    name: "Fibonacci & Gann",
    defaultTool: "fibonacci",
    variants: [
      { id: "fibonacci", label: "Fib Retracement", shortcut: "F", icon: <FibRetracementIcon size={16} /> },
      { id: "trend_fib", label: "Trend-Based Fib Extension", shortcut: "E", icon: <TrendFibIcon size={16} /> },
      { id: "gann_box", label: "Gann Box", shortcut: "G", icon: <GannBoxIcon size={16} /> },
    ],
  },
  {
    groupId: "shapes",
    name: "Geometric Shapes",
    defaultTool: "rectangle",
    variants: [
      { id: "rectangle", label: "Rectangle / Order Block", shortcut: "R", icon: <RectangleIcon size={16} /> },
      { id: "circle", label: "Circle", shortcut: "C", icon: <CircleIcon size={16} /> },
      { id: "path", label: "Path (Polyline)", shortcut: "W", icon: <PathIcon size={16} /> },
      { id: "brush", label: "Brush (Freehand)", shortcut: "B", icon: <BrushIcon size={16} /> },
    ],
  },
  {
    groupId: "annotation",
    name: "Annotations",
    defaultTool: "text",
    variants: [
      { id: "text", label: "Text Note", shortcut: "A", icon: <TextIcon size={16} /> },
    ],
  },
  {
    groupId: "prediction",
    name: "Prediction & Measurement",
    defaultTool: "long_position",
    variants: [
      { id: "long_position", label: "Long Position", shortcut: "L", icon: <LongPositionIcon size={16} /> },
      { id: "short_position", label: "Short Position", shortcut: "S", icon: <ShortPositionIcon size={16} /> },
      { id: "date_range", label: "Date Range Measure", shortcut: "D", icon: <DateRangeIcon size={16} /> },
      { id: "fixed_range_volume_profile", label: "Fixed Range Volume Profile", shortcut: "P", icon: <FixedRangeVolumeProfileIcon size={16} /> },
    ],
  },
];

export function DrawingRail({
  activeTool,
  onSelectTool,
  isMagnetActive: controlledMagnet,
  onToggleMagnet,
  isLocked: controlledLocked,
  onToggleLock,
  isHidden: controlledHidden,
  onToggleHide,
  onClearDrawings,
  onClearIndicators,
  onClearAll,
  favoriteTools = [],
  onToggleFavorite,
  showFavoritesBar = false,
  onToggleFavoritesBar,
}: DrawingRailProps) {
  const [localLocked, setLocalLocked] = useState(false);
  const [localHidden, setLocalHidden] = useState(false);
  const [localMagnet, setLocalMagnet] = useState(true);

  // Group active variants (tracks which sub-tool is displayed on the main rail)
  const [selectedVariants, setSelectedVariants] = useState<Record<string, DrawingToolType>>({
    lines: "trendline",
    fib_gann: "fibonacci",
    shapes: "rectangle",
    annotation: "text",
    prediction: "long_position",
  });

  const [openFlyoutGroupId, setOpenFlyoutGroupId] = useState<string | null>(null);
  const [isTrashMenuOpen, setIsTrashMenuOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);

  const isLocked = controlledLocked !== undefined ? controlledLocked : localLocked;
  const isHidden = controlledHidden !== undefined ? controlledHidden : localHidden;
  const isMagnetActive = controlledMagnet !== undefined ? controlledMagnet : localMagnet;

  const handleToggleMagnet = onToggleMagnet || (() => setLocalMagnet(!localMagnet));
  const handleToggleLock = onToggleLock || (() => setLocalLocked(!localLocked));
  const handleToggleHide = onToggleHide || (() => setLocalHidden(!localHidden));

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setOpenFlyoutGroupId(null);
      }
      if (trashRef.current && !trashRef.current.contains(e.target as Node)) {
        setIsTrashMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectGroupTool = (groupId: string, toolId: DrawingToolType) => {
    setSelectedVariants((prev) => ({ ...prev, [groupId]: toolId }));
    onSelectTool(activeTool === toolId ? "none" : toolId);
    setOpenFlyoutGroupId(null);
  };

  return (
    <aside className="w-12 bg-surface-container-lowest border-r border-border flex flex-col items-center py-2 justify-between select-none shrink-0 z-20 relative">
      {/* Primary Drawing Utilities & Grouped Flyout Rail (DEC-053) */}
      <div className="flex flex-col items-center gap-1 w-full px-1.5" ref={flyoutRef}>
        {/* Crosshair Cursor */}
        <button
          onClick={() => onSelectTool(activeTool === "crosshair" ? "none" : "crosshair")}
          title="Crosshair (C)"
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors relative ${
            activeTool === "crosshair"
              ? "bg-primary-container text-white shadow-xs"
              : "text-muted hover:text-on-surface hover:bg-surface-container"
          }`}
        >
          <Crosshair size={16} />
        </button>

        {/* Grouped Category Buttons */}
        {TOOL_GROUPS.map((group) => {
          const activeVariantId = selectedVariants[group.groupId] || group.defaultTool;
          const currentVariant =
            group.variants.find((v) => v.id === activeVariantId) || group.variants[0];
          const isGroupActive = group.variants.some((v) => v.id === activeTool);
          const isFlyoutOpen = openFlyoutGroupId === group.groupId;

          return (
            <div key={group.groupId} className="relative w-full flex justify-center">
              <div
                className={`w-9 h-9 rounded flex items-center justify-between transition-colors relative group ${
                  isGroupActive
                    ? "bg-primary-container text-white shadow-xs"
                    : "text-muted hover:text-on-surface hover:bg-surface-container"
                }`}
              >
                {/* Main Tool Click */}
                <button
                  onClick={() => handleSelectGroupTool(group.groupId, currentVariant.id)}
                  title={`${currentVariant.label} ${currentVariant.shortcut ? `(${currentVariant.shortcut})` : ""}`}
                  className="w-7 h-9 flex items-center justify-center pl-0.5 cursor-pointer"
                >
                  {currentVariant.icon}
                </button>

                {/* Sub-flyout Arrow Indicator (DEC-053) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenFlyoutGroupId(isFlyoutOpen ? null : group.groupId);
                  }}
                  title="Expand Tool Variants"
                  className={`w-2.5 h-9 flex items-center justify-center hover:opacity-100 cursor-pointer ${
                    isGroupActive ? "text-white/80" : "text-muted/60"
                  }`}
                >
                  <span className="text-[8px] font-mono leading-none">&#9656;</span>
                </button>
              </div>

              {/* Flyout Submenu Popover (DEC-053) */}
              {isFlyoutOpen && (
                <div className="absolute left-11 top-0 z-50 bg-surface-container-low border border-border rounded-lg shadow-2xl py-1.5 px-1 min-w-[210px] backdrop-blur-md flex flex-col gap-0.5 font-mono text-xs">
                  <div className="px-2.5 py-1 text-[10px] text-muted uppercase tracking-wider font-semibold border-b border-border/50 mb-0.5">
                    {group.name}
                  </div>
                  {group.variants.map((v) => {
                    const isSelected = activeTool === v.id;
                    const isFav = favoriteTools?.includes(v.id);
                    return (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors group/item ${
                          isSelected
                            ? "bg-primary text-white font-semibold"
                            : "text-on-surface hover:bg-surface-container hover:text-primary"
                        }`}
                        onClick={() => handleSelectGroupTool(group.groupId, v.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className={isSelected ? "text-white" : "text-primary"}>
                            {v.icon}
                          </span>
                          <span className="text-[11px]">{v.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {v.shortcut && (
                            <span className="text-[10px] text-muted opacity-60">
                              {v.shortcut}
                            </span>
                          )}
                          <button
                            type="button"
                            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite?.(v.id);
                            }}
                            className={`p-0.5 rounded transition-colors ${
                              isFav
                                ? "text-yellow-400"
                                : "text-muted/40 hover:text-yellow-400 opacity-0 group-hover/item:opacity-100"
                            }`}
                          >
                            <Star
                              size={12}
                              fill={isFav ? "currentColor" : "none"}
                              strokeWidth={isFav ? 0 : 2}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Auxiliary Chart Modifiers & Trash Menu (DEC-057) */}
      <div
        className="flex flex-col items-center gap-1 w-full px-1.5 border-t border-border pt-2"
        ref={trashRef}
      >
        {/* Magnet Mode */}
        <button
          onClick={handleToggleMagnet}
          title={`Magnet Mode: ${isMagnetActive ? "ON (Snaps to OHLC)" : "OFF"}`}
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
            isMagnetActive
              ? "text-cyan bg-cyan/10"
              : "text-muted hover:text-on-surface hover:bg-surface-container"
          }`}
        >
          <Magnet size={16} />
        </button>

        {/* Lock Drawings */}
        <button
          onClick={handleToggleLock}
          title={isLocked ? "Unlock All Drawings" : "Lock All Drawings"}
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
            isLocked
              ? "text-gold bg-gold/10"
              : "text-muted hover:text-on-surface hover:bg-surface-container"
          }`}
        >
          {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>

        {/* Hide Drawings */}
        <button
          onClick={handleToggleHide}
          title={isHidden ? "Unhide Drawings" : "Hide Drawings"}
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
            isHidden
              ? "text-error bg-error/10"
              : "text-muted hover:text-on-surface hover:bg-surface-container"
          }`}
        >
          {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>

        {/* Toggle Favorites Floating Bar (DEC-064) */}
        <button
          onClick={onToggleFavoritesBar}
          title={showFavoritesBar ? "Hide Favorites Toolbar" : "Show Favorites Toolbar"}
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
            showFavoritesBar
              ? "text-yellow-400 bg-yellow-400/10"
              : "text-muted hover:text-on-surface hover:bg-surface-container"
          }`}
        >
          <Star size={16} fill={showFavoritesBar ? "currentColor" : "none"} />
        </button>

        {/* Open Object Tree & Layer Manager (DEC-070) */}
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("mochex:open-object-tree"));
            }
          }}
          title="Open Object Tree & Layer Manager"
          className="w-9 h-9 rounded flex items-center justify-center text-muted hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
        >
          <Layers size={16} />
        </button>

        {/* Trash Popover Menu Button (DEC-057) */}
        <div className="relative w-full flex justify-center">
          <button
            onClick={() => setIsTrashMenuOpen((prev) => !prev)}
            title="Remove Objects (Trash)"
            className={`w-9 h-9 rounded flex items-center justify-center text-muted hover:text-tertiary hover:bg-surface-container transition-colors ${
              isTrashMenuOpen ? "text-tertiary bg-tertiary/10" : ""
            }`}
          >
            <Trash2 size={16} />
          </button>

          {/* TradingView Trash Popover Menu (DEC-057) */}
          {isTrashMenuOpen && (
            <div className="absolute left-11 bottom-0 z-50 bg-surface-container-low border border-border rounded-lg shadow-2xl py-1.5 px-1 min-w-[190px] backdrop-blur-md flex flex-col gap-0.5 font-mono text-xs">
              <div className="px-2.5 py-1 text-[10px] text-muted uppercase tracking-wider font-semibold border-b border-border/50 mb-0.5">
                Remove Objects
              </div>
              <button
                onClick={() => {
                  onClearDrawings?.();
                  setIsTrashMenuOpen(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-on-surface hover:text-tertiary hover:bg-surface-container cursor-pointer transition-colors text-[11px]"
              >
                <Trash2 size={13} className="text-tertiary" />
                <span>Remove Drawings</span>
              </button>
              <button
                onClick={() => {
                  onClearIndicators?.();
                  setIsTrashMenuOpen(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-on-surface hover:text-gold hover:bg-surface-container cursor-pointer transition-colors text-[11px]"
              >
                <Sliders size={13} className="text-gold" />
                <span>Remove Indicators</span>
              </button>
              <div className="h-px bg-border/50 my-0.5" />
              <button
                onClick={() => {
                  onClearAll?.();
                  setIsTrashMenuOpen(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-tertiary font-semibold hover:bg-tertiary/10 cursor-pointer transition-colors text-[11px]"
              >
                <Trash2 size={13} />
                <span>Remove All</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
