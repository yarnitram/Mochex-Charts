import { CandlestickBar } from "@/lib/mexc/types";
import {
  computeValidatedOrderBlocks,
  ValidatedOrderBlock,
  OrderBlockTouchLevel,
} from "./validated-ob-engine";
import { computeUnmitigatedFvgs } from "./fvg-engine";
import {
  detectAllSandwichPatterns,
} from "./sandwich/detector";
import { detectSrZones } from "./sandwich/sr-detector";
import { applyConfluenceToZones } from "./sandwich/confluence";
import { applyMitigationToZones } from "./sandwich/mitigation";
import { DEFAULT_SANDWICH_SETTINGS } from "./sandwich/settings";
import { SandwichTimeframeId, SandwichZone } from "./sandwich/types";
import { Bar } from "@/types/tradingview.d";
import {
  SupportedExchange,
  SUPPORTED_EXCHANGES,
} from "@/lib/screener/multi-exchange-client";
import {
  PoiHistoricalMetrics,
  calculateHistoricalPoiMetrics,
} from "./poi-backtest-metrics";
import {
  LiquiditySweepInfo,
  detectPoiLiquiditySweep,
} from "./liquidity-sweep-engine";
import { PoiConfluenceInfo } from "./poi-confluence-matrix";
import { PoiLiquiditySummary } from "./poi-liquidity-heatmap";
import { PoiBreakTelemetry } from "./poi-invalidation-engine";

export type PoiCategory = "order_block" | "sandwich_zone" | "fvg";
export type PoiDirection = "BULLISH" | "BEARISH";
export type PoiStatus = "fresh" | "testing" | "sweep" | "mitigated" | "broken";

export interface RadarPoiItem {
  id: string;
  symbol: string;
  timeframe: string;
  category: PoiCategory;
  type: PoiDirection;
  label: string;
  pattern?: string; // "GRGG" (Bullish Demand) or "RGRR" (Bearish Supply)
  isPlus?: boolean; // Sandwich ++ with higher-timeframe S/R confluence
  // Price boundaries
  top: number;
  bottom: number;
  meanThreshold: number; // 50% equilibrium level
  entryPrice: number;    // Bullish: top, Bearish: bottom
  fullRetestPrice: number; // Bullish: bottom, Bearish: top
  invalidationPrice?: number; // Bullish: bottom, Bearish: top (or stop-out buffer)
  fvgGapPct?: number;
  // Status and proximity
  status: PoiStatus;
  isInsideZone: boolean;
  distanceToEntryPct: number;
  distanceToMtPct: number;
  currentPrice: number;
  time: number;
  // Multi-Exchange metadata (DEC-143)
  exchange?: SupportedExchange;
  exchangeLabel?: string;
  // Historical reaction backtest metrics (DEC-144)
  metrics?: PoiHistoricalMetrics;
  // Real-time Liquidity Sweep / Fakeout (DEC-145)
  sweep?: LiquiditySweepInfo | null;
  // Multi-Timeframe Confluence Cluster (DEC-146)
  confluence?: PoiConfluenceInfo | null;
  // Multi-Timeframe Liquidity Density Ribbon & Heatmap (DEC-149)
  liquidity?: PoiLiquiditySummary | null;
  // Real-Time Invalidation & Stop-Out Telemetry (DEC-150)
  breakTelemetry?: PoiBreakTelemetry | null;
}

function mapTimeframeToSandwichTf(tf: string): { tfId: SandwichTimeframeId; label: string } {
  const norm = tf.trim().toLowerCase();
  if (norm === "15" || norm === "15m") return { tfId: "15m", label: "15m" };
  if (norm === "60" || norm === "1h") return { tfId: "1h", label: "1H" };
  if (norm === "240" || norm === "4h") return { tfId: "4h", label: "4H" };
  if (norm === "1d" || norm === "d") return { tfId: "1d", label: "1D" };
  return { tfId: "4h", label: "4H" };
}

/**
 * Computes all active Points of Interest (both Validated Order Blocks and Sandwich Zones ++)
 * for a pair on a given timeframe.
 */
export function computeRadarPois(
  bars: CandlestickBar[],
  symbol: string,
  timeframe: string,
  exchange: SupportedExchange = "mexc"
): RadarPoiItem[] {
  if (!bars || bars.length < 4) return [];

  const currentBar = bars[bars.length - 1];
  const currentPrice = currentBar.close;
  const { tfId, label: tfLabel } = mapTimeframeToSandwichTf(timeframe);
  const items: RadarPoiItem[] = [];
  const exchangeConfig = SUPPORTED_EXCHANGES[exchange];
  const exchangeLabel = exchangeConfig?.badgeLabel || exchange.toUpperCase();

  // Compute empirical historical reaction win-rate & statistical metrics (DEC-144)
  const historicalMetrics = calculateHistoricalPoiMetrics(bars, {
    targetRr: 1.5,
    touchLevel: "fifty_pct",
  });

  // 1. COMPUTE VALIDATED ORDER BLOCKS (OB + 2C FVG)
  const orderBlocks = computeValidatedOrderBlocks(bars, symbol, timeframe, {
    minGapPct: 0.05,
    includeMitigated: true,
    includeBroken: true,
  });

  for (const ob of orderBlocks) {
    const poiId = exchange !== "mexc" ? `${exchange}-${ob.id}` : ob.id;
    const isBullish = ob.type === "BULLISH";
    const isBroken = isBullish ? currentPrice < ob.bottom : currentPrice > ob.top;

    const sweep = detectPoiLiquiditySweep(bars, {
      type: ob.type,
      top: ob.top,
      bottom: ob.bottom,
      meanThreshold: ob.meanThreshold,
      candleTime: ob.fvgTime || ob.obTime,
    });

    const status: PoiStatus = isBroken
      ? "broken"
      : sweep
      ? "sweep"
      : ob.isInsideZone
      ? "testing"
      : ob.status === "mitigated"
      ? "mitigated"
      : "fresh";

    if (status === "broken") continue;

    items.push({
      id: poiId,
      symbol: ob.symbol,
      timeframe: ob.timeframe,
      category: "order_block",
      type: ob.type,
      label: `${ob.type} OB (+2C FVG)`,
      top: ob.top,
      bottom: ob.bottom,
      meanThreshold: ob.meanThreshold,
      entryPrice: ob.entryPrice,
      fullRetestPrice: ob.fullRetestPrice,
      invalidationPrice: ob.fullRetestPrice,
      fvgGapPct: ob.fvgGapPct,
      status,
      isInsideZone: ob.isInsideZone,
      distanceToEntryPct: ob.distanceToEntryPct,
      distanceToMtPct: ob.distanceToMtPct,
      currentPrice,
      time: ob.obTime,
      exchange,
      exchangeLabel,
      metrics: historicalMetrics,
      sweep: sweep || null,
    });
  }

  // 2. COMPUTE SANDWICH ZONES ++ (Supply & Demand 4-Candle Structure)
  try {
    const tvBars: Bar[] = bars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    // Detect 4-candle Sandwich patterns (RGRR for Supply, GRGG for Demand)
    const rawSandwich = detectAllSandwichPatterns(
      tvBars,
      symbol,
      tfId,
      tfLabel,
      DEFAULT_SANDWICH_SETTINGS,
      0.01
    );

    if (rawSandwich.length > 0) {
      // Evaluate Higher-Timeframe S/R Confluence for Sandwich ++ upgrade
      const srZones = detectSrZones(tvBars, "4h", 3, 3);
      const confluenced = applyConfluenceToZones(rawSandwich, srZones, "directional");

      // Apply chronological mitigation lifecycle
      const { updatedZones } = applyMitigationToZones(
        confluenced,
        tvBars,
        DEFAULT_SANDWICH_SETTINGS.mitigationMode
      );

      for (const sz of updatedZones) {
        const top = sz.top;
        const bottom = sz.bottom;
        const meanThreshold = (top + bottom) / 2;
        const isBullish = sz.direction === "bullish";
        const entryPrice = isBullish ? top : bottom;
        const fullRetestPrice = isBullish ? bottom : top;
        const isInsideZone = currentPrice >= bottom && currentPrice <= top;

        const distanceToEntryPct =
          currentPrice > entryPrice
            ? ((currentPrice - entryPrice) / currentPrice) * 100
            : currentPrice < entryPrice
            ? ((entryPrice - currentPrice) / currentPrice) * 100
            : 0;

        const distanceToMtPct =
          (Math.abs(currentPrice - meanThreshold) / currentPrice) * 100;

        const isBroken = isBullish ? currentPrice < bottom : currentPrice > top;
        const poiDirection: PoiDirection = isBullish ? "BULLISH" : "BEARISH";

        const sweep = detectPoiLiquiditySweep(bars, {
          type: poiDirection,
          top,
          bottom,
          meanThreshold,
          candleTime: sz.confirmedAt || sz.sourceCandleTime,
        });

        const status: PoiStatus =
          isBroken
            ? "broken"
            : sweep
            ? "sweep"
            : isInsideZone
            ? "testing"
            : sz.status === "mitigated"
            ? "mitigated"
            : "fresh";

        // Filter out broken zones or far mitigated zones
        if (status === "broken" || (status === "mitigated" && distanceToEntryPct > 5.0)) {
          continue;
        }

        const zoneTitle = isBullish ? "Demand Sandwich (GRGG)" : "Supply Sandwich (RGRR)";
        const label = sz.isPlus ? `${zoneTitle} ++` : zoneTitle;
        const poiId = exchange !== "mexc" ? `${exchange}-${sz.id}` : sz.id;

        items.push({
          id: poiId,
          symbol: symbol.toUpperCase(),
          timeframe,
          category: "sandwich_zone",
          type: poiDirection,
          label,
          pattern: sz.pattern,
          isPlus: sz.isPlus,
          top,
          bottom,
          meanThreshold,
          entryPrice,
          fullRetestPrice,
          invalidationPrice: fullRetestPrice,
          status,
          isInsideZone,
          distanceToEntryPct,
          distanceToMtPct,
          currentPrice,
          time: sz.sourceCandleTime,
          exchange,
          exchangeLabel,
          metrics: historicalMetrics,
          sweep: sweep || null,
        });
      }
    }
  } catch (err) {
    console.warn(`[radar-poi-engine] Error computing sandwich zones for ${symbol}:`, err);
  }

  // 3. Detect Standalone Fair Value Gaps (FVG)
  try {
    const fvgZones = computeUnmitigatedFvgs(bars, {
      timeframe: tfLabel,
      minGapPct: 0.05,
    });

    for (const fvg of fvgZones) {
      const top = fvg.top;
      const bottom = fvg.bottom;
      const meanThreshold = fvg.mid; // 50% Consequent Encroachment (CE)
      const isBullish = fvg.type === "BULLISH";
      const entryPrice = isBullish ? top : bottom;
      const fullRetestPrice = isBullish ? bottom : top;
      const isInsideZone = currentPrice >= bottom && currentPrice <= top;

      const distanceToEntryPct =
        currentPrice > entryPrice
          ? ((currentPrice - entryPrice) / currentPrice) * 100
          : currentPrice < entryPrice
          ? ((entryPrice - currentPrice) / currentPrice) * 100
          : 0;

      const distanceToMtPct =
        (Math.abs(currentPrice - meanThreshold) / currentPrice) * 100;

      const isBroken = isBullish ? currentPrice < bottom : currentPrice > top;

      const sweep = detectPoiLiquiditySweep(bars, {
        type: isBullish ? "BULLISH" : "BEARISH",
        top,
        bottom,
        meanThreshold,
        candleTime: fvg.endTime || fvg.startTime,
      });

      const status: PoiStatus =
        isBroken
          ? "broken"
          : sweep
          ? "sweep"
          : isInsideZone
          ? "testing"
          : "fresh";

      if (status === "broken") continue;

      const poiId =
        exchange !== "mexc"
          ? `${exchange}-fvg-${symbol}-${timeframe}-${fvg.startTime}`
          : `fvg-${symbol}-${timeframe}-${fvg.startTime}`;

      items.push({
        id: poiId,
        symbol: symbol.toUpperCase(),
        timeframe: tfLabel,
        category: "fvg",
        type: isBullish ? "BULLISH" : "BEARISH",
        label: isBullish ? "Bullish FVG (Demand)" : "Bearish FVG (Supply)",
        top,
        bottom,
        meanThreshold,
        entryPrice,
        fullRetestPrice,
        invalidationPrice: fullRetestPrice,
        fvgGapPct: fvg.gapPct,
        status,
        isInsideZone,
        distanceToEntryPct,
        distanceToMtPct,
        currentPrice,
        time: fvg.startTime,
        exchange,
        exchangeLabel,
        metrics: historicalMetrics,
        sweep: sweep || null,
      });
    }
  } catch (err) {
    console.warn(`[radar-poi-engine] Error computing FVGs for ${symbol}:`, err);
  }

  // Sort all POIs by closest proximity to current price
  return items.sort((a, b) => a.distanceToEntryPct - b.distanceToEntryPct);
}

/**
 * Returns the exact target price for any POI given the selected touch level
 */
export function getRadarPoiAlarmTargetPrice(
  poi: RadarPoiItem,
  touchLevel: OrderBlockTouchLevel
): number {
  switch (touchLevel) {
    case "entry":
      return poi.entryPrice;
    case "fifty_pct":
      return poi.meanThreshold;
    case "full":
      return poi.fullRetestPrice;
    default:
      return poi.entryPrice;
  }
}
