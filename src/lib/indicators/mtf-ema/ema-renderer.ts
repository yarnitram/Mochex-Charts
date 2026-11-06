/**
 * Multi-Timeframe EMA Canvas Overlay Renderer
 *
 * Renders:
 * - High-DPI canvas line paths for active EMAs (progressive width 1px-4px)
 * - Step-like staircase lines for confirmed higher-timeframe EMAs
 * - Dashed provisional lines for developing HTF EMAs
 * - Right-edge label badges with collision avoidance and leader connection lines
 */

import { EmaPeriod, MtfEmaLabelItem, MtfEmaSeriesData, MtfEmaSettings } from "./types";
import { getLabelFontSize, resolveLabelCollisions, formatEmaLabel } from "./label-manager";
import { getTimeframeMeta, resolutionToMs } from "./timeframe-manager";

export interface RenderMtfEmaParams {
  ctx: CanvasRenderingContext2D;
  seriesList: MtfEmaSeriesData[];
  settings: MtfEmaSettings;
  timeToCoordinate: (timeMs: number) => number | null;
  priceToCoordinate: (price: number) => number | null;
  chartWidth: number;
  chartHeight: number;
  barSpacingPx?: number;
  currentResolution: string;
  lastBarTimeMs?: number;
}

/**
 * Main render function called from chart animation / draw loop
 */
export function renderMtfEma(params: RenderMtfEmaParams): void {
  const {
    ctx,
    seriesList,
    settings,
    timeToCoordinate,
    priceToCoordinate,
    chartWidth,
    chartHeight,
    barSpacingPx = 8,
    currentResolution,
    lastBarTimeMs,
  } = params;

  if (!settings.showIndicator || seriesList.length === 0) {
    return;
  }

  const chartDurationMs = resolutionToMs(currentResolution);

  // 1. Draw EMA Lines
  for (const series of seriesList) {
    if (series.points.length === 0) continue;

    const isHtf =
      series.timeframeId !== "current" &&
      (getTimeframeMeta(series.timeframeId)?.durationMs || 0) > chartDurationMs;

    ctx.save();
    ctx.strokeStyle = series.color;
    ctx.lineWidth = series.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let inPath = false;
    let prevX: number | null = null;
    let prevY: number | null = null;
    let prevDeveloping = false;

    for (let i = 0; i < series.points.length; i++) {
      const pt = series.points[i];
      const x = timeToCoordinate(pt.time);
      const y = priceToCoordinate(pt.value);

      if (x === null || y === null || isNaN(x) || isNaN(y)) {
        if (inPath) {
          ctx.stroke();
          inPath = false;
        }
        prevX = null;
        prevY = null;
        continue;
      }

      // Check if entering a developing point
      const isDeveloping = !!pt.isDeveloping;
      if (isDeveloping !== prevDeveloping && inPath) {
        ctx.stroke();
        ctx.beginPath();
        if (prevX !== null && prevY !== null) {
          ctx.moveTo(prevX, prevY);
        }
        if (isDeveloping) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
      }

      if (!inPath) {
        ctx.beginPath();
        if (isDeveloping) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.moveTo(x, y);
        inPath = true;
      } else {
        if (isHtf && prevY !== null && prevX !== null) {
          // HTF Step line: hold horizontal to x, then step to y
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        } else {
          // Standard smooth line
          ctx.lineTo(x, y);
        }
      }

      prevX = x;
      prevY = y;
      prevDeveloping = isDeveloping;
    }

    if (inPath) {
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Prepare and Render Labels
  const showAnyLabels = settings.showCurrentLabels || settings.showMtfLabels;
  if (!showAnyLabels) {
    return;
  }

  const rawLabels: MtfEmaLabelItem[] = [];

  for (const series of seriesList) {
    const isCurrent = series.timeframeId === "current";
    if (isCurrent && !settings.showCurrentLabels) continue;
    if (!isCurrent && !settings.showMtfLabels) continue;

    if (series.latestValue === null || isNaN(series.latestValue)) continue;

    const y = priceToCoordinate(series.latestValue);
    if (y === null || isNaN(y)) continue;

    const tfLabel = isCurrent ? currentResolution.toUpperCase() : series.timeframeLabel;
    const text = formatEmaLabel({
      abbreviated: settings.abbreviatedLabels,
      timeframeLabel: tfLabel,
      period: series.period,
    });

    rawLabels.push({
      id: `${series.timeframeId}-${series.period}`,
      text,
      price: series.latestValue,
      originalY: y,
      adjustedY: y,
      color: series.color,
      timeframeId: series.timeframeId,
      period: series.period,
      isCurrent,
    });
  }

  if (rawLabels.length === 0) return;

  const minY = 14;
  const maxY = Math.max(minY + 20, chartHeight - 24);

  const resolvedLabels = resolveLabelCollisions(
    rawLabels,
    settings.minLabelSpacingPx,
    minY,
    maxY,
    settings.smartLabelSpacing
  );

  // Compute label X position based on labelOffsetBars or right boundary
  let baseX = chartWidth - 75;
  if (lastBarTimeMs !== undefined) {
    const lastBarX = timeToCoordinate(lastBarTimeMs);
    if (lastBarX !== null && !isNaN(lastBarX)) {
      const offsetPx = (settings.labelOffsetBars ?? 5) * barSpacingPx;
      baseX = Math.min(chartWidth - 65, Math.max(lastBarX + offsetPx, 60));
    }
  }

  const fontSize = getLabelFontSize(settings.textSize);
  ctx.save();
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = "middle";

  for (const item of resolvedLabels) {
    const metrics = ctx.measureText(item.text);
    const textWidth = metrics.width;
    const paddingX = 6;
    const badgeHeight = fontSize + 6;
    const badgeWidth = textWidth + paddingX * 2;

    const labelX = Math.max(8, Math.min(chartWidth - badgeWidth - 8, baseX));
    const labelY = item.adjustedY;

    // Leader line / tick if collision avoidance displaced the label vertically
    if (settings.smartLabelSpacing && Math.abs(item.adjustedY - item.originalY) > 2) {
      ctx.beginPath();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.moveTo(labelX - 10, item.originalY);
      ctx.lineTo(labelX - 3, item.adjustedY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Badge Background
    if (!settings.transparentLabelBg) {
      ctx.fillStyle = `rgba(18, 22, 34, ${settings.labelBgOpacity})`;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1;

      const r = 3; // border radius
      const bx = labelX - paddingX;
      const by = labelY - badgeHeight / 2;

      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + badgeWidth - r, by);
      ctx.quadraticCurveTo(bx + badgeWidth, by, bx + badgeWidth, by + r);
      ctx.lineTo(bx + badgeWidth, by + badgeHeight - r);
      ctx.quadraticCurveTo(
        bx + badgeWidth,
        by + badgeHeight,
        bx + badgeWidth - r,
        by + badgeHeight
      );
      ctx.lineTo(bx + r, by + badgeHeight);
      ctx.quadraticCurveTo(bx, by + badgeHeight, bx, by + badgeHeight - r);
      ctx.lineTo(bx, by + r);
      ctx.quadraticCurveTo(bx, by, bx + r, by);
      ctx.closePath();

      ctx.fill();
      ctx.stroke();
    }

    // Badge Text
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, labelX, labelY);
  }

  ctx.restore();
}
