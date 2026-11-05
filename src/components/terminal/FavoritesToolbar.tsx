"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  GripVertical,
  X,
} from "lucide-react";
import { DrawingToolType } from "./DrawingRail";
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

interface FavoritesToolbarProps {
  favoriteTools: DrawingToolType[];
  activeTool: DrawingToolType;
  onSelectTool: (tool: DrawingToolType) => void;
  onClose: () => void;
}

const TOOL_ICONS: Record<DrawingToolType, React.ReactNode> = {
  crosshair: null,
  trendline: <TrendlineIcon size={15} />,
  horizontal_line: <HorizontalLineIcon size={15} />,
  vertical_line: <VerticalLineIcon size={15} />,
  long_position: <LongPositionIcon size={15} />,
  short_position: <ShortPositionIcon size={15} />,
  date_range: <DateRangeIcon size={15} />,
  fixed_range_volume_profile: <FixedRangeVolumeProfileIcon size={15} />,
  rectangle: <RectangleIcon size={15} />,
  path: <PathIcon size={15} />,
  circle: <CircleIcon size={15} />,
  brush: <BrushIcon size={15} />,
  text: <TextIcon size={15} />,
  fibonacci: <FibRetracementIcon size={15} />,
  trend_fib: <TrendFibIcon size={15} />,
  gann_box: <GannBoxIcon size={15} />,
  none: null,
};

const TOOL_NAMES: Record<DrawingToolType, string> = {
  crosshair: "Crosshair",
  trendline: "Trendline",
  horizontal_line: "Horizontal Line",
  vertical_line: "Vertical Line",
  long_position: "Long Position",
  short_position: "Short Position",
  date_range: "Date Range",
  fixed_range_volume_profile: "Fixed Range Volume Profile",
  rectangle: "Rectangle",
  path: "Path Polyline",
  circle: "Circle",
  brush: "Brush",
  text: "Text Note",
  fibonacci: "Fib Retracement",
  trend_fib: "Trend Fib Extension",
  gann_box: "Gann Box",
  none: "None",
};

export function FavoritesToolbar({
  favoriteTools,
  activeTool,
  onSelectTool,
  onClose,
}: FavoritesToolbarProps) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 80, y: 120 });

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("mochex:favorites_toolbar_pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setPosition(parsed);
        }
      }
    } catch {}
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  const handleMouseDownGrip = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: position.x,
      startY: position.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(10, Math.min(window.innerWidth - 100, dragStartRef.current.startX + dx));
      const newY = Math.max(40, Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        localStorage.setItem("mochex:favorites_toolbar_pos", JSON.stringify(position));
      } catch {}
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, position]);

  if (!mounted || favoriteTools.length === 0) return null;

  return (
    <div
      style={{ left: position.x, top: position.y }}
      className="absolute z-30 flex items-center gap-0.5 bg-surface-container-lowest/95 border border-border/80 px-1 py-1 rounded-lg shadow-2xl backdrop-blur-md select-none font-mono text-xs"
    >
      {/* Draggable Grip Handle */}
      <div
        onMouseDown={handleMouseDownGrip}
        title="Drag to reposition toolbar"
        className="cursor-grab active:cursor-grabbing text-muted/60 hover:text-on-surface px-0.5 py-1.5 flex items-center justify-center transition-colors"
      >
        <GripVertical size={14} />
      </div>

      <div className="h-4 w-px bg-border/60 mx-0.5" />

      {/* Starred Tool Buttons */}
      <div className="flex items-center gap-0.5">
        {favoriteTools.map((tool) => {
          const icon = TOOL_ICONS[tool];
          if (!icon) return null;
          const isSelected = activeTool === tool;

          return (
            <button
              key={tool}
              onClick={() => onSelectTool(isSelected ? "none" : tool)}
              title={TOOL_NAMES[tool] || tool}
              className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                isSelected
                  ? "bg-primary text-white font-semibold shadow-sm"
                  : "text-muted hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              {icon}
            </button>
          );
        })}
      </div>

      <div className="h-4 w-px bg-border/60 mx-0.5" />

      {/* Close Button */}
      <button
        onClick={onClose}
        title="Hide favorites bar"
        className="text-muted/60 hover:text-tertiary p-1 rounded hover:bg-surface-container cursor-pointer transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}
