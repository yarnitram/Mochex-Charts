/**
 * Validated Order Block + FVG Canvas Renderer
 *
 * Renders:
 * - Separately identifiable FVG rectangles (translucent green for Bullish RGG, translucent red for Bearish GRR)
 * - Active OB rectangles (green / red, extending right when `extendUnmitigatedOb` is enabled)
 * - Mitigated OB rectangles (gray, frozen at the exact touching candle `mitigatedTime`)
 * - Optional OB and FVG pill labels
 */

import { ObFvgSettings, ValidatedOrderBlock } from "./validated-ob-engine";
import { hexToRgba } from "./sandwich/renderer";

export interface RenderObFvgParams {
  ctx: CanvasRenderingContext2D;
  blocks: ValidatedOrderBlock[];
  settings: ObFvgSettings;
  timeToCoordinate: (timeMs: number) => number | null;
  priceToCoordinate: (price: number) => number | null;
  chartWidth: number;
  chartHeight: number;
  lastBarTimeMs?: number;
}

function drawBadgeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  startX: number,
  boxY: number,
  boxH: number,
  chartWidth: number,
  chartHeight: number,
  borderColor: string,
  textColor: string,
  verticalAlign: "center" | "top" = "center"
) {
  ctx.font = "bold 9px monospace";
  const metrics = ctx.measureText(text);
  const padX = 5;
  const badgeH = 14;
  const badgeW = metrics.width + padX * 2;
  const labelX = Math.max(8, Math.min(chartWidth - badgeW - 10, startX + 6));
  const rawY = verticalAlign === "top" ? boxY + 9 : boxY + boxH / 2;
  const labelY = Math.max(12, Math.min(chartHeight - 12, rawY));

  ctx.fillStyle = "rgba(18, 22, 34, 0.86)";
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.fillRect(labelX - padX, labelY - badgeH / 2, badgeW, badgeH);
  ctx.strokeRect(labelX - padX, labelY - badgeH / 2, badgeW, badgeH);

  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.fillText(text, labelX, labelY);
}

/**
 * Renders 3-Candle RGG/GRR Order Blocks and their paired FVG rectangles onto the chart canvas.
 */
export function renderObFvgZones(params: RenderObFvgParams): void {
  const {
    ctx,
    blocks,
    settings,
    timeToCoordinate,
    priceToCoordinate,
    chartWidth,
    chartHeight,
    lastBarTimeMs,
  } = params;

  if (!settings.showIndicator || blocks.length === 0) return;

  let defaultRightX = chartWidth + 50;
  if (lastBarTimeMs !== undefined) {
    const lastX = timeToCoordinate(lastBarTimeMs);
    if (lastX !== null && !isNaN(lastX)) {
      defaultRightX = Math.max(lastX + 60, chartWidth + 50);
    }
  }

  for (const ob of blocks) {
    const isMitigated = Boolean(ob.touched || ob.lifecycleState === "MITIGATED");
    if (isMitigated && !settings.showMitigatedObs) continue;

    const obStartX = timeToCoordinate(ob.obTime);
    const obTopY = priceToCoordinate(ob.top);
    const obBottomY = priceToCoordinate(ob.bottom);
    if (obStartX === null || isNaN(obStartX) || obTopY === null || obBottomY === null) {
      continue;
    }

    const confirmCoordX = ob.confirmTime ? timeToCoordinate(ob.confirmTime) : null;
    const isBullish = ob.type === "BULLISH";
    const patternLabel = ob.pattern || (isBullish ? "RGG" : "GRR");

    // Right edge: stop at touching candle if mitigated, or extend right if unmitigated & enabled
    let obEndX: number;
    if (isMitigated && ob.mitigatedTime !== undefined) {
      const mitX = timeToCoordinate(ob.mitigatedTime);
      obEndX = mitX !== null && !isNaN(mitX) ? Math.max(mitX, obStartX + 20) : obStartX + 40;
    } else if (!settings.extendUnmitigatedOb) {
      obEndX =
        confirmCoordX !== null && !isNaN(confirmCoordX)
          ? Math.max(confirmCoordX + 24, obStartX + 36)
          : obStartX + 48;
    } else {
      obEndX = defaultRightX;
    }

    if (obEndX < 0 || obStartX > chartWidth + 50) continue;

    // 1. Render separately identifiable FVG rectangle first (behind OB border)
    const fvgTopY = priceToCoordinate(ob.fvgTop);
    const fvgBottomY = priceToCoordinate(ob.fvgBottom);
    const fvgAnchorX =
      ob.fvgStartTime !== undefined ? timeToCoordinate(ob.fvgStartTime) : obStartX;

    if (
      fvgAnchorX !== null &&
      !isNaN(fvgAnchorX) &&
      fvgTopY !== null &&
      fvgBottomY !== null
    ) {
      const fvgEndX =
        isMitigated && ob.mitigatedTime !== undefined
          ? obEndX
          : settings.extendUnmitigatedOb
          ? Math.min(defaultRightX, Math.max(obStartX + 90, confirmCoordX ? confirmCoordX + 48 : obStartX + 90))
          : Math.max(obStartX + 36, confirmCoordX ? confirmCoordX + 18 : obStartX + 36);

      if (fvgEndX > 0 && fvgAnchorX < chartWidth + 50) {
        const fvgBoxW = Math.max(6, fvgEndX - fvgAnchorX);
        const fvgBoxY = Math.min(fvgTopY, fvgBottomY);
        const fvgBoxH = Math.max(2, Math.abs(fvgBottomY - fvgTopY));
        const fvgBaseColor = isMitigated
          ? settings.mitigatedObColor
          : isBullish
          ? settings.bullishFvgColor
          : settings.bearishFvgColor;

        ctx.save();
        ctx.fillStyle = hexToRgba(
          fvgBaseColor,
          isMitigated ? settings.mitigatedOpacity * 0.75 : settings.fvgFillOpacity
        );
        ctx.strokeStyle = hexToRgba(fvgBaseColor, isMitigated ? 0.35 : 0.65);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(fvgAnchorX, fvgBoxY, fvgBoxW, fvgBoxH);
        ctx.strokeRect(fvgAnchorX, fvgBoxY, fvgBoxW, fvgBoxH);

        if (settings.showFvgLabels && fvgBoxW > 36 && fvgBoxH >= 10) {
          ctx.setLineDash([]);
          const fvgText = `${isBullish ? "Bullish" : "Bearish"} FVG (${ob.fvgGapPct.toFixed(2)}%)`;
          drawBadgeLabel(
            ctx,
            fvgText,
            fvgAnchorX,
            fvgBoxY,
            fvgBoxH,
            chartWidth,
            chartHeight,
            hexToRgba(fvgBaseColor, 0.7),
            fvgBaseColor,
            "top"
          );
        }
        ctx.restore();
      }
    }

    // 2. Render Order Block rectangle
    const boxW = Math.max(8, obEndX - obStartX);
    const boxY = Math.min(obTopY, obBottomY);
    const boxH = Math.max(3, Math.abs(obBottomY - obTopY));

    const obColor = isMitigated
      ? settings.mitigatedObColor
      : isBullish
      ? settings.bullishObColor
      : settings.bearishObColor;

    ctx.save();
    ctx.fillStyle = hexToRgba(
      obColor,
      isMitigated ? settings.mitigatedOpacity : settings.obFillOpacity
    );
    ctx.strokeStyle = obColor;
    ctx.lineWidth = isMitigated ? 1 : 1.5;
    if (isMitigated) {
      ctx.setLineDash([3, 3]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.fillRect(obStartX, boxY, boxW, boxH);
    ctx.strokeRect(obStartX, boxY, boxW, boxH);

    // 50% Mean Threshold hairline on active OBs
    if (!isMitigated && boxH >= 8) {
      const mtY = priceToCoordinate(ob.meanThreshold);
      if (mtY !== null && !isNaN(mtY)) {
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(obColor, 0.5);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.moveTo(obStartX, mtY);
        ctx.lineTo(obStartX + boxW, mtY);
        ctx.stroke();
      }
    }

    if (settings.showObLabels && boxW > 24) {
      ctx.setLineDash([]);
      const statusSuffix = isMitigated ? "MITIGATED" : "ACTIVE";
      const zoneTag = ob.zoneType === "body" ? "Body" : "Full";
      const labelText = `${patternLabel} ${isBullish ? "Bull" : "Bear"} OB [${zoneTag}] · ${statusSuffix}`;
      drawBadgeLabel(
        ctx,
        labelText,
        obStartX,
        boxY,
        boxH,
        chartWidth,
        chartHeight,
        obColor,
        obColor,
        "center"
      );
    }

    ctx.restore();
  }
}
