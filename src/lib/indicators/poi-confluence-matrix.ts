import { RadarPoiItem } from "./radar-poi-engine";

export type ConfluenceTier = "3x_PLUS" | "2x" | "1x";

export interface PoiConfluenceInfo {
  score: number;                // Distinct overlapping timeframes count (1, 2, 3+)
  tier: ConfluenceTier;         // "3x_PLUS" | "2x" | "1x"
  timeframes: string[];         // Normalized timeframes e.g. ["15m", "1H", "4H"]
  label: string;                // e.g. "🔥 3x MTF" | "⚡ 2x MTF" | "1x"
  contributingPoisCount: number;
  description: string;          // e.g. "15m Bullish OB + 1H FVG + 4H Demand Sandwich"
  clusterTop: number;           // Upper boundary of overlapping price cluster
  clusterBottom: number;        // Lower boundary of overlapping price cluster
  isNested: boolean;            // True if this zone is physically nested inside a HTF zone
}

export interface ConfluenceDetectionOptions {
  bufferPct?: number; // Tolerance buffer % beyond exact overlap (default: 0.25%)
}

/**
 * Normalizes timeframe strings into standard canonical labels (15m, 30m, 1H, 2H, 4H, 1D, 1W)
 */
export function normalizeTfLabel(tf: string): string {
  const t = tf.trim().toLowerCase();
  if (t === "15" || t === "15m") return "15m";
  if (t === "30" || t === "30m") return "30m";
  if (t === "60" || t === "1h") return "1H";
  if (t === "120" || t === "2h") return "2H";
  if (t === "240" || t === "4h") return "4H";
  if (t === "1d" || t === "d") return "1D";
  if (t === "1w" || t === "w") return "1W";
  return tf.toUpperCase();
}

/**
 * Checks whether two price ranges overlap or touch within a small buffer %
 */
export function doZonesOverlap(
  topA: number,
  bottomA: number,
  topB: number,
  bottomB: number,
  bufferPct = 0.25
): boolean {
  const tolerance = (Math.max(topA, topB) * bufferPct) / 100;
  return bottomA <= topB + tolerance && topA >= bottomB - tolerance;
}

/**
 * Evaluates Multi-Timeframe Confluence for a single POI against a pool of POIs
 * for the same symbol.
 */
export function computePoiConfluence(
  targetPoi: RadarPoiItem,
  allPois: RadarPoiItem[],
  options: ConfluenceDetectionOptions = {}
): PoiConfluenceInfo | null {
  if (!targetPoi || !allPois || allPois.length === 0) return null;

  const bufferPct = options.bufferPct ?? 0.25;

  // Filter candidate POIs: must have matching direction (BULLISH vs BEARISH)
  const matchingPois = allPois.filter(
    (p) =>
      p.symbol.toUpperCase() === targetPoi.symbol.toUpperCase() &&
      p.type === targetPoi.type &&
      p.status !== "broken"
  );

  // Find all POIs that overlap in price with the target POI
  const overlapping = matchingPois.filter((p) =>
    doZonesOverlap(targetPoi.top, targetPoi.bottom, p.top, p.bottom, bufferPct)
  );

  if (overlapping.length <= 1) {
    return null; // Only target POI itself, no confluence
  }

  // Extract distinct normalized timeframes
  const distinctTfs = Array.from(
    new Set(overlapping.map((p) => normalizeTfLabel(p.timeframe)))
  ).sort((a, b) => {
    const order = ["15m", "30m", "1H", "2H", "4H", "1D", "1W"];
    return order.indexOf(a) - order.indexOf(b);
  });

  const score = distinctTfs.length;
  if (score < 2) {
    return null; // Overlapping POIs exist on the SAME timeframe, not multi-timeframe
  }

  const tier: ConfluenceTier = score >= 3 ? "3x_PLUS" : "2x";
  const label = score >= 3 ? `🔥 ${score}x MTF` : `⚡ ${score}x MTF`;

  // Calculate cluster boundaries (intersection overlap)
  const clusterTop = Math.min(...overlapping.map((p) => p.top));
  const clusterBottom = Math.max(...overlapping.map((p) => p.bottom));

  // Determine if target POI is physically nested inside a higher-timeframe zone
  const targetTfNorm = normalizeTfLabel(targetPoi.timeframe);
  const tfRank: Record<string, number> = {
    "15m": 1,
    "30m": 2,
    "1H": 3,
    "2H": 4,
    "4H": 5,
    "1D": 6,
    "1W": 7,
  };
  const targetRank = tfRank[targetTfNorm] || 1;

  const isNested = overlapping.some((p) => {
    const pRank = tfRank[normalizeTfLabel(p.timeframe)] || 1;
    return (
      pRank > targetRank &&
      targetPoi.bottom >= p.bottom - (p.bottom * bufferPct) / 100 &&
      targetPoi.top <= p.top + (p.top * bufferPct) / 100
    );
  });

  // Unique descriptions of contributing zone types
  const descriptions = overlapping.map(
    (p) => `${normalizeTfLabel(p.timeframe)} ${p.label}`
  );
  const uniqueDescriptions = Array.from(new Set(descriptions)).join(" + ");

  return {
    score,
    tier,
    timeframes: distinctTfs,
    label,
    contributingPoisCount: overlapping.length,
    description: uniqueDescriptions,
    clusterTop: clusterBottom <= clusterTop ? clusterTop : Math.max(...overlapping.map((p) => p.top)),
    clusterBottom: clusterBottom <= clusterTop ? clusterBottom : Math.min(...overlapping.map((p) => p.bottom)),
    isNested,
  };
}

/**
 * Attaches Multi-Timeframe Confluence metadata to each POI in the collection.
 */
export function attachConfluenceToPois(
  pois: RadarPoiItem[],
  options: ConfluenceDetectionOptions = {}
): RadarPoiItem[] {
  if (!pois || pois.length === 0) return [];

  // Group POIs by symbol
  const bySymbol = new Map<string, RadarPoiItem[]>();
  for (const p of pois) {
    const sym = p.symbol.toUpperCase();
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(p);
  }

  return pois.map((poi) => {
    const symbolPool = bySymbol.get(poi.symbol.toUpperCase()) || [];
    const confluence = computePoiConfluence(poi, symbolPool, options);
    return {
      ...poi,
      confluence,
    };
  });
}
