/**
 * Sandwich Zones ++ Canvas Overlay Renderer
 *
 * Renders:
 * - Active & Mitigated Sandwich Zone boxes (RGRR & GRGG)
 * - Sandwich ++ Gold/Yellow highlight boxes
 * - Mitigated frozen gray boxes
 * - Optional 1H/4H/1D Support & Resistance boxes
 * - Crisp text labels and badge pills
 */

import { SandwichSettings, SandwichZone, SrZone } from "./types";

export interface RenderSandwichParams {
  ctx: CanvasRenderingContext2D;
  zones: SandwichZone[];
  srZones?: SrZone[];
  settings: SandwichSettings;
  timeToCoordinate: (timeMs: number) => number | null;
  priceToCoordinate: (price: number) => number | null;
  chartWidth: number;
  chartHeight: number;
  lastBarTimeMs?: number;
}

/**
 * Converts hex color (e.g. #00c087) and opacity (0.2) to rgba string
 */
export function hexToRgba(hex: string, opacity: number): string {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) {
    c = c.split("").map((ch) => ch + ch).join("");
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(128, 128, 128, ${opacity})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Main render function invoked during canvas draw cycle
 */
export function renderSandwichZones(params: RenderSandwichParams): void {
  const {
    ctx,
    zones,
    srZones = [],
    settings,
    timeToCoordinate,
    priceToCoordinate,
    chartWidth,
    chartHeight,
    lastBarTimeMs,
  } = params;

  if (!settings.showIndicator) return;

  // Fallback right edge x coordinate for active zones
  const defaultRightX = chartWidth + 50;

  // 1. Render S/R Zones if enabled
  if (settings.enableSr && settings.showSrBoxes && srZones.length > 0) {
    for (const sr of srZones) {
      const x1 = timeToCoordinate(sr.pivotTime);
      const y1 = priceToCoordinate(sr.top);
      const y2 = priceToCoordinate(sr.bottom);

      if (y1 === null || y2 === null) continue;
      const startX = x1 !== null ? x1 : 0;
      const endX = defaultRightX;
      const boxW = Math.max(10, endX - startX);
      const boxY = Math.min(y1, y2);
      const boxH = Math.max(2, Math.abs(y2 - y1));

      const isSupport = sr.type === "support";
      const color = isSupport ? settings.supportColor : settings.resistanceColor;

      ctx.save();
      ctx.fillStyle = hexToRgba(color, 0.08);
      ctx.strokeStyle = hexToRgba(color, 0.4);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      ctx.fillRect(startX, boxY, boxW, boxH);
      ctx.strokeRect(startX, boxY, boxW, boxH);

      // Label
      if (settings.showLabels) {
        ctx.setLineDash([]);
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = color;
        ctx.fillText(
          `${sr.timeframe.toUpperCase()} ${isSupport ? "SUP" : "RES"}`,
          Math.max(10, startX + 6),
          boxY + boxH / 2 + 3
        );
      }

      ctx.restore();
    }
  }

  // 2. Render Sandwich Zones
  for (const zone of zones) {
    const x1 = timeToCoordinate(zone.sourceCandleTime);
    const yTop = priceToCoordinate(zone.top);
    const yBottom = priceToCoordinate(zone.bottom);

    if (yTop === null || yBottom === null) continue;

    const startX = x1 !== null ? x1 : 0;

    let endX: number;
    const isMitigated = zone.status === "mitigated";

    if (isMitigated && zone.mitigatedAt) {
      const mitX = timeToCoordinate(zone.mitigatedAt);
      endX = mitX !== null ? mitX : startX + 40;
    } else {
      if (lastBarTimeMs !== undefined) {
        const lastX = timeToCoordinate(lastBarTimeMs);
        endX = lastX !== null ? Math.max(lastX + 60, defaultRightX) : defaultRightX;
      } else {
        endX = defaultRightX;
      }
    }

    const boxW = Math.max(6, endX - startX);
    const boxY = Math.min(yTop, yBottom);
    const boxH = Math.max(3, Math.abs(yBottom - yTop));

    // Determine colors
    let borderColor: string;
    let fillColor: string;
    let labelText: string;

    if (isMitigated) {
      borderColor = settings.mitigatedColor;
      fillColor = hexToRgba(settings.mitigatedColor, settings.mitigatedOpacity);
      labelText = `${zone.timeframeLabel} ${zone.pattern} (Mitigated)`;
    } else if (zone.isPlus) {
      borderColor = settings.plusColor;
      fillColor = hexToRgba(settings.plusColor, settings.fillOpacity);
      const matchedStr = zone.matchedSRTimeframes.join(",");
      labelText =
        zone.direction === "bearish"
          ? `Sandwich ++ SHORT [${matchedStr}]`
          : `Sandwich ++ LONG [${matchedStr}]`;
    } else if (zone.direction === "bullish") {
      borderColor = settings.bullishColor;
      fillColor = hexToRgba(settings.bullishColor, settings.fillOpacity);
      labelText = `${zone.timeframeLabel} ${zone.pattern}`;
    } else {
      borderColor = settings.bearishColor;
      fillColor = hexToRgba(settings.bearishColor, settings.fillOpacity);
      labelText = `${zone.timeframeLabel} ${zone.pattern}`;
    }

    ctx.save();

    // Box Fill & Border
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = zone.isPlus && !isMitigated ? 1.8 : 1.2;
    if (isMitigated) {
      ctx.setLineDash([3, 3]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.fillRect(startX, boxY, boxW, boxH);
    ctx.strokeRect(startX, boxY, boxW, boxH);

    // Label Badge
    if (settings.showLabels && boxW > 20) {
      ctx.setLineDash([]);
      ctx.font = zone.isPlus && !isMitigated ? "bold 10px sans-serif" : "9px monospace";
      const metrics = ctx.measureText(labelText);
      const textW = metrics.width;
      const padX = 5;
      const padY = 2;
      const badgeH = 14;
      const badgeW = textW + padX * 2;

      const labelX = Math.max(8, startX + 6);
      const labelY = Math.max(14, Math.min(chartHeight - 14, boxY + boxH / 2));

      // Draw subtle pill background behind text for maximum legibility
      ctx.fillStyle = "rgba(18, 22, 34, 0.85)";
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.fillRect(labelX - padX, labelY - badgeH / 2, badgeW, badgeH);
      ctx.strokeRect(labelX - padX, labelY - badgeH / 2, badgeW, badgeH);

      // Label Text
      ctx.fillStyle = borderColor;
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, labelX, labelY);
    }

    ctx.restore();
  }
}
