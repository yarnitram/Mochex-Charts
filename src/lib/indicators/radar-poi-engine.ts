import { CandlestickBar } from "@/lib/mexc/types";
import {
  computeValidatedOrderBlocks,
  ValidatedOrderBlock,
  OrderBlockTouchLevel,
} from "./validated-ob-engine";
import {
  detectAllSandwichPatterns,
} from "./sandwich/detector";
import { detectSrZones } from "./sandwich/sr-detector";
import { applyConfluenceToZones } from "./sandwich/confluence";
import { applyMitigationToZones } from "./sandwich/mitigation";
import { DEFAULT_SANDWICH_SETTINGS } from "./sandwich/settings";
import { SandwichTimeframeId, SandwichZone } from "./sandwich/types";
import { Bar } from "@/types/tradingview.d";

export type PoiCategory = "order_block" | "sandwich_zone";
export type PoiDirection = "BULLISH" | "BEARISH";
export type PoiStatus = "fresh" | "testing" | "mitigated" | "broken";

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
  fvgGapPct?: number;
  // Status and proximity
  status: PoiStatus;
  isInsideZone: boolean;
  distanceToEntryPct: number;
  distanceToMtPct: number;
  currentPrice: number;
  time: number;
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
  timeframe: string
): RadarPoiItem[] {
  if (!bars || bars.length < 4) return [];

  const currentBar = bars[bars.length - 1];
  const currentPrice = currentBar.close;
  const items: RadarPoiItem[] = [];

  // 1. COMPUTE VALIDATED ORDER BLOCKS (OB + 2C FVG)
  const orderBlocks = computeValidatedOrderBlocks(bars, symbol, timeframe, {
    minGapPct: 0.05,
    includeMitigated: true,
  });

  for (const ob of orderBlocks) {
    items.push({
      id: ob.id,
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
      fvgGapPct: ob.fvgGapPct,
      status: ob.status,
      isInsideZone: ob.isInsideZone,
      distanceToEntryPct: ob.distanceToEntryPct,
      distanceToMtPct: ob.distanceToMtPct,
      currentPrice,
      time: ob.obTime,
    });
  }

  // 2. COMPUTE SANDWICH ZONES ++ (Supply & Demand 4-Candle Structure)
  try {
    const { tfId, label: tfLabel } = mapTimeframeToSandwichTf(timeframe);
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

        const status: PoiStatus =
          isBroken
            ? "broken"
            : isInsideZone
            ? "testing"
            : sz.status === "mitigated"
            ? "mitigated"
            : "fresh";

        // Filter out broken zones or far mitigated zones
        if (status === "broken" || (status === "mitigated" && distanceToEntryPct > 5.0)) {
          continue;
        }

        const type: PoiDirection = isBullish ? "BULLISH" : "BEARISH";
        const zoneTitle = isBullish ? "Demand Sandwich (GRGG)" : "Supply Sandwich (RGRR)";
        const label = sz.isPlus ? `${zoneTitle} ++` : zoneTitle;

        items.push({
          id: sz.id,
          symbol: symbol.toUpperCase(),
          timeframe,
          category: "sandwich_zone",
          type,
          label,
          pattern: sz.pattern,
          isPlus: sz.isPlus,
          top,
          bottom,
          meanThreshold,
          entryPrice,
          fullRetestPrice,
          status,
          isInsideZone,
          distanceToEntryPct,
          distanceToMtPct,
          currentPrice,
          time: sz.sourceCandleTime,
        });
      }
    }
  } catch (err) {
    console.warn(`[radar-poi-engine] Error computing sandwich zones for ${symbol}:`, err);
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
