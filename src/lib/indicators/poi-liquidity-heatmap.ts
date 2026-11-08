/**
 * Institutional Multi-Timeframe POI Liquidity Heatmap & Density Ribbon Engine (DEC-149)
 *
 * Models institutional liquidity concentrations by distributing timeframe-weighted,
 * confluence-weighted, and freshness-weighted liquidity volume across price bins.
 * Identifies institutional liquidity magnets, density tiers, and overall market demand/supply bias.
 */

import { RadarPoiItem, PoiDirection } from "./radar-poi-engine";
import { normalizeTfLabel } from "./poi-confluence-matrix";

export type DensityTier = "ultra" | "high" | "moderate" | "light";

export type LiquiditySentimentBias =
  | "STRONG_DEMAND"
  | "MODERATE_DEMAND"
  | "NEUTRAL"
  | "MODERATE_SUPPLY"
  | "STRONG_SUPPLY";

export interface LiquidityPriceBin {
  priceBottom: number;
  priceTop: number;
  priceMid: number;
  densityScore: number;
  densityPercentile: number; // 0 to 100
  tier: DensityTier;
  poiCount: number;
  bullishWeight: number;
  bearishWeight: number;
}

export interface PeakLiquidityMagnet {
  price: number;
  priceRange: { bottom: number; top: number };
  densityPercentile: number;
  tier: DensityTier;
  bias: "BULLISH_DEMAND" | "BEARISH_SUPPLY" | "CONTESTED";
  label: string;
  contributingTimeframes: string[];
}

export interface PoiLiquiditySummary {
  densityPercentile: number;
  tier: DensityTier;
  isPeakMagnet: boolean;
  demandDominancePct: number;
  sentimentBias: LiquiditySentimentBias;
}

export interface SymbolLiquidityHeatmap {
  symbol: string;
  minPrice: number;
  maxPrice: number;
  binsCount: number;
  bins: LiquidityPriceBin[];
  peaks: PeakLiquidityMagnet[];
  totalBullishWeight: number;
  totalBearishWeight: number;
  demandDominancePct: number;
  supplyDominancePct: number;
  sentimentBias: LiquiditySentimentBias;
  currentPriceTier?: DensityTier;
}

export interface HeatmapOptions {
  binsCount?: number; // default: 40
  bufferPct?: number; // expansion beyond min/max price (default: 0.5%)
}

/**
 * Calculates the liquidity weighting of a POI based on timeframe, category, confluence, and status.
 */
export function calculatePoiLiquidityWeight(poi: RadarPoiItem): {
  totalWeight: number;
  direction: PoiDirection;
} {
  // 1. Timeframe multiplier
  const tf = normalizeTfLabel(poi.timeframe);
  let tfMultiplier = 1.0;
  if (tf === "1D") tfMultiplier = 4.0;
  else if (tf === "4H") tfMultiplier = 2.8;
  else if (tf === "1H") tfMultiplier = 1.8;
  else if (tf === "15m") tfMultiplier = 1.0;

  // 2. Category multiplier
  let catMultiplier = 1.0;
  if (poi.category === "sandwich_zone") {
    catMultiplier = poi.isPlus ? 2.5 : 1.8;
  } else if (poi.category === "order_block") {
    catMultiplier = 1.6;
  } else if (poi.category === "fvg") {
    catMultiplier = 1.2;
  }

  // 3. Confluence cluster multiplier (DEC-146)
  let confluenceMultiplier = 1.0;
  if (poi.confluence) {
    if (poi.confluence.score >= 3 || poi.confluence.tier === "3x_PLUS") confluenceMultiplier = 3.0;
    else if (poi.confluence.score >= 2 || poi.confluence.tier === "2x") confluenceMultiplier = 1.8;
  }

  // 4. Status multiplier
  let statusMultiplier = 1.0;
  if (poi.status === "fresh") statusMultiplier = 1.0;
  else if (poi.status === "testing") statusMultiplier = 0.95;
  else if (poi.status === "sweep") statusMultiplier = 1.3; // Reversal stop hunt indicates heavy institutional orders
  else if (poi.status === "mitigated") statusMultiplier = 0.4;
  else if (poi.status === "broken") statusMultiplier = 0.0;

  const totalWeight = tfMultiplier * catMultiplier * confluenceMultiplier * statusMultiplier;
  return { totalWeight, direction: poi.type };
}

/**
 * Convenience getter for total POI weight.
 */
export function computePoiWeight(poi: RadarPoiItem): number {
  return calculatePoiLiquidityWeight(poi).totalWeight;
}

/**
 * Maps density percentile to standardized density tier.
 */
export function getDensityTier(percentile: number): DensityTier {
  if (percentile >= 75) return "ultra";
  if (percentile >= 50) return "high";
  if (percentile >= 25) return "moderate";
  return "light";
}

/**
 * Computes a multi-timeframe POI liquidity heatmap distribution for a collection of POIs.
 */
export function computePoiLiquidityHeatmap(
  symbol: string,
  pois: RadarPoiItem[],
  currentPriceOrOptions?: number | HeatmapOptions,
  maybeOptions?: HeatmapOptions
): SymbolLiquidityHeatmap {
  let currentPrice: number | undefined;
  let options: HeatmapOptions = {};

  if (typeof currentPriceOrOptions === "object" && currentPriceOrOptions !== null) {
    options = currentPriceOrOptions;
  } else if (typeof currentPriceOrOptions === "number") {
    currentPrice = currentPriceOrOptions;
    if (maybeOptions) options = maybeOptions;
  }

  const activePois = pois.filter((p) => p.status !== "broken" && p.bottom > 0 && p.top > 0);

  if (activePois.length === 0) {
    const fallbackPrice = currentPrice || 100;
    return {
      symbol,
      minPrice: fallbackPrice * 0.98,
      maxPrice: fallbackPrice * 1.02,
      binsCount: 0,
      bins: [],
      peaks: [],
      totalBullishWeight: 0,
      totalBearishWeight: 0,
      demandDominancePct: 50,
      supplyDominancePct: 50,
      sentimentBias: "NEUTRAL",
      currentPriceTier: "light",
    };
  }

  const binsCount = options.binsCount || 40;
  const bufferPct = options.bufferPct ?? 0.5;

  let minP = Math.min(...activePois.map((p) => p.bottom));
  let maxP = Math.max(...activePois.map((p) => p.top));

  if (currentPrice && currentPrice > 0) {
    minP = Math.min(minP, currentPrice);
    maxP = Math.max(maxP, currentPrice);
  }

  // Add buffer padding
  const padding = ((maxP - minP) * bufferPct) / 100 || minP * 0.01;
  const rangeMin = Math.max(0.000001, minP - padding);
  const rangeMax = maxP + padding;
  const binStep = (rangeMax - rangeMin) / binsCount;

  // Initialize price bins
  const bins: LiquidityPriceBin[] = [];
  for (let i = 0; i < binsCount; i++) {
    const bottom = rangeMin + i * binStep;
    const top = bottom + binStep;
    bins.push({
      priceBottom: bottom,
      priceTop: top,
      priceMid: (bottom + top) / 2,
      densityScore: 0,
      densityPercentile: 0,
      tier: "light",
      poiCount: 0,
      bullishWeight: 0,
      bearishWeight: 0,
    });
  }

  let totalBullish = 0;
  let totalBearish = 0;

  // Distribute weights across bins
  for (const poi of activePois) {
    const { totalWeight, direction } = calculatePoiLiquidityWeight(poi);
    if (totalWeight <= 0) continue;

    if (direction === "BULLISH") totalBullish += totalWeight;
    else totalBearish += totalWeight;

    // Distribute among overlapping bins
    for (const bin of bins) {
      if (poi.bottom <= bin.priceTop && poi.top >= bin.priceBottom) {
        bin.densityScore += totalWeight;
        bin.poiCount += 1;
        if (direction === "BULLISH") {
          bin.bullishWeight += totalWeight;
        } else {
          bin.bearishWeight += totalWeight;
        }
      }
    }
  }

  // Calculate percentiles and tiers
  const maxScore = Math.max(...bins.map((b) => b.densityScore), 0.0001);
  for (const bin of bins) {
    const pct = Math.min(100, Math.round((bin.densityScore / maxScore) * 100));
    bin.densityPercentile = pct;
    bin.tier = getDensityTier(pct);
  }

  // Peak detection (local maxima with >= 55% density)
  const peaks: PeakLiquidityMagnet[] = [];
  for (let i = 0; i < bins.length; i++) {
    const curr = bins[i];
    if (curr.densityPercentile < 55) continue;

    const prevScore = i > 0 ? bins[i - 1].densityScore : 0;
    const nextScore = i < bins.length - 1 ? bins[i + 1].densityScore : 0;

    if (curr.densityScore >= prevScore && curr.densityScore >= nextScore) {
      const isBull = curr.bullishWeight > curr.bearishWeight * 1.5;
      const isBear = curr.bearishWeight > curr.bullishWeight * 1.5;
      const bias = isBull ? "BULLISH_DEMAND" : isBear ? "BEARISH_SUPPLY" : "CONTESTED";

      const tfs = Array.from(
        new Set(
          activePois
            .filter((p) => p.bottom <= curr.priceTop && p.top >= curr.priceBottom)
            .map((p) => normalizeTfLabel(p.timeframe))
        )
      );

      const priceFmt =
        curr.priceMid >= 1
          ? `$${curr.priceMid.toFixed(2)}`
          : `$${curr.priceMid.toFixed(4)}`;

      peaks.push({
        price: curr.priceMid,
        priceRange: { bottom: curr.priceBottom, top: curr.priceTop },
        densityPercentile: curr.densityPercentile,
        tier: curr.tier,
        bias,
        label: `${curr.tier === "ultra" ? "🔥 Ultra" : "⚡ High"} ${bias === "BULLISH_DEMAND" ? "Demand" : bias === "BEARISH_SUPPLY" ? "Supply" : "Liquidity"} Magnet (${priceFmt})`,
        contributingTimeframes: tfs,
      });
    }
  }

  // Overall liquidity sentiment bias
  const combinedWeight = totalBullish + totalBearish || 1;
  const demandDominancePct = Math.round((totalBullish / combinedWeight) * 100);
  const supplyDominancePct = 100 - demandDominancePct;

  let sentimentBias: LiquiditySentimentBias = "NEUTRAL";
  if (demandDominancePct >= 65) sentimentBias = "STRONG_DEMAND";
  else if (demandDominancePct >= 55) sentimentBias = "MODERATE_DEMAND";
  else if (supplyDominancePct >= 65) sentimentBias = "STRONG_SUPPLY";
  else if (supplyDominancePct >= 55) sentimentBias = "MODERATE_SUPPLY";

  let currentPriceTier: DensityTier = "light";
  if (currentPrice && currentPrice > 0) {
    const currentBin = bins.find(
      (b) => currentPrice >= b.priceBottom && currentPrice <= b.priceTop
    );
    if (currentBin) {
      currentPriceTier = currentBin.tier;
    }
  }

  return {
    symbol,
    minPrice: rangeMin,
    maxPrice: rangeMax,
    binsCount,
    bins,
    peaks,
    totalBullishWeight: Number(totalBullish.toFixed(2)),
    totalBearishWeight: Number(totalBearish.toFixed(2)),
    demandDominancePct,
    supplyDominancePct,
    sentimentBias,
    currentPriceTier,
  };
}

/**
 * Computes and attaches liquidity summary metadata to a POI.
 */
export function attachLiquidityToPoi(
  poi: RadarPoiItem,
  heatmap?: SymbolLiquidityHeatmap
): PoiLiquiditySummary {
  const activeHeatmap = heatmap || computePoiLiquidityHeatmap(poi.symbol, [poi], poi.entryPrice);

  // Find bins overlapping with this POI
  const overlappingBins = activeHeatmap.bins.filter(
    (b) => poi.bottom <= b.priceTop && poi.top >= b.priceBottom
  );

  let maxPercentile = 0;
  for (const b of overlappingBins) {
    if (b.densityPercentile > maxPercentile) {
      maxPercentile = b.densityPercentile;
    }
  }

  const isPeakMagnet = activeHeatmap.peaks.some(
    (pk) => poi.bottom <= pk.priceRange.top && poi.top >= pk.priceRange.bottom
  );

  const tier = getDensityTier(maxPercentile);

  return {
    densityPercentile: maxPercentile,
    tier,
    isPeakMagnet,
    demandDominancePct: activeHeatmap.demandDominancePct,
    sentimentBias: activeHeatmap.sentimentBias,
  };
}

/**
 * Computes heatmap and attaches liquidity summaries to a collection of POIs.
 */
export function attachLiquidityToPois(
  pois: RadarPoiItem[],
  heatmap?: SymbolLiquidityHeatmap
): RadarPoiItem[] {
  if (pois.length === 0) return pois;
  const hm = heatmap || computePoiLiquidityHeatmap(pois[0].symbol, pois);
  return pois.map((p) => ({
    ...p,
    liquidity: attachLiquidityToPoi(p, hm),
  }));
}
