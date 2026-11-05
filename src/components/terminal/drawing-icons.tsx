"use client";

import React from "react";
import { Crosshair } from "lucide-react";
import { DrawingToolType } from "./DrawingRail";

export function TrendlineIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="3" cy="13" r="1.5" fill="currentColor" />
      <circle cx="13" cy="3" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function HorizontalLineIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function VerticalLineIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function FibRetracementIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <line x1="1.5" y1="2.5" x2="14.5" y2="2.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.8" />
      <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="1.5" y1="10" x2="14.5" y2="10" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="1.5" y1="13.5" x2="14.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.8" />
      <line x1="3" y1="13.5" x2="13" y2="2.5" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5" />
      <circle cx="3" cy="13.5" r="1.2" fill="currentColor" />
      <circle cx="13" cy="2.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function TrendFibIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <line x1="2" y1="12" x2="6" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="6" y1="4" x2="10" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="10" y1="4" x2="15" y2="4" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="1 1" />
      <line x1="10" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="1 1" />
      <line x1="10" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1" strokeOpacity="0.8" />
      <circle cx="2" cy="12" r="1.3" fill="currentColor" />
      <circle cx="6" cy="4" r="1.3" fill="currentColor" />
      <circle cx="10" cy="9" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function GannBoxIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.2" rx="0.5" />
      <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
      <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="1.5 1.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

export function RectangleIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="2" y="3.5" width="12" height="9" stroke="currentColor" strokeWidth="1.3" rx="0.5" />
    </svg>
  );
}

export function CircleIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function PathIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <polyline points="2.5,12.5 6,5 10.5,11 13.5,3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="2.5" cy="12.5" r="1.3" fill="currentColor" />
      <circle cx="6" cy="5" r="1.3" fill="currentColor" />
      <circle cx="10.5" cy="11" r="1.3" fill="currentColor" />
      <circle cx="13.5" cy="3.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function BrushIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3.5 12.5C5.5 11.5 6.5 8 8 6.5C9.5 5 12 4 12 4C12 4 11 6.5 9.5 8C8 9.5 7 11 4.5 12.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.5 12.5C2.5 13.5 3 14 4 13.5C5 13 4.5 12 3.5 12.5Z" fill="currentColor" />
    </svg>
  );
}

export function TextIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2.5 3h11v2.5h-4.25v7.5h-2.5v-7.5h-4.25z" />
    </svg>
  );
}

export function LongPositionIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="2.5" y="2.5" width="11" height="5" fill="#089981" fillOpacity="0.45" stroke="#089981" strokeWidth="1" rx="0.5" />
      <rect x="2.5" y="7.5" width="11" height="6" fill="#f23645" fillOpacity="0.45" stroke="#f23645" strokeWidth="1" rx="0.5" />
      <line x1="1.5" y1="7.5" x2="14.5" y2="7.5" stroke="#ffffff" strokeWidth="1.3" />
    </svg>
  );
}

export function ShortPositionIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="2.5" y="2.5" width="11" height="6" fill="#f23645" fillOpacity="0.45" stroke="#f23645" strokeWidth="1" rx="0.5" />
      <rect x="2.5" y="8.5" width="11" height="5" fill="#089981" fillOpacity="0.45" stroke="#089981" strokeWidth="1" rx="0.5" />
      <line x1="1.5" y1="8.5" x2="14.5" y2="8.5" stroke="#ffffff" strokeWidth="1.3" />
    </svg>
  );
}

export function DateRangeIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <line x1="2.5" y1="3" x2="2.5" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="13.5" y1="3" x2="13.5" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="3.5" y1="8" x2="12.5" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <polyline points="5.5,6 3.5,8 5.5,10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="10.5,6 12.5,8 10.5,10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FixedRangeVolumeProfileIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <line x1="2.5" y1="2.5" x2="2.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="2.5" cy="2.5" r="1.3" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="2.5" cy="13.5" r="1.3" stroke="currentColor" strokeWidth="1.1" />
      <rect x="4.2" y="3.4" width="4.8" height="1.6" rx="0.4" fill="currentColor" opacity="0.65" />
      <rect x="4.2" y="5.7" width="7.4" height="1.6" rx="0.4" fill="currentColor" opacity="0.85" />
      <rect x="4.2" y="8.0" width="10.0" height="1.8" rx="0.4" fill="currentColor" />
      <rect x="4.2" y="10.5" width="6.2" height="1.6" rx="0.4" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

export function CrosshairIcon({ size = 16 }: { size?: number }) {
  return <Crosshair size={size} />;
}

export function getDrawingToolIcon(tool: DrawingToolType, size = 16): React.ReactNode {
  switch (tool) {
    case "crosshair":
      return <CrosshairIcon size={size} />;
    case "trendline":
      return <TrendlineIcon size={size} />;
    case "horizontal_line":
      return <HorizontalLineIcon size={size} />;
    case "vertical_line":
      return <VerticalLineIcon size={size} />;
    case "fibonacci":
      return <FibRetracementIcon size={size} />;
    case "trend_fib":
      return <TrendFibIcon size={size} />;
    case "gann_box":
      return <GannBoxIcon size={size} />;
    case "rectangle":
      return <RectangleIcon size={size} />;
    case "circle":
      return <CircleIcon size={size} />;
    case "path":
      return <PathIcon size={size} />;
    case "brush":
      return <BrushIcon size={size} />;
    case "text":
      return <TextIcon size={size} />;
    case "long_position":
      return <LongPositionIcon size={size} />;
    case "short_position":
      return <ShortPositionIcon size={size} />;
    case "date_range":
      return <DateRangeIcon size={size} />;
    case "fixed_range_volume_profile":
      return <FixedRangeVolumeProfileIcon size={size} />;
    default:
      return null;
  }
}
