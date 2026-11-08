/**
 * Multi-Asset Portfolio Risk Heat & Correlated POI Exposure Monitor (DEC-155)
 * Analyzes market-wide directional skew, pairwise/benchmark Pearson correlation with BTC,
 * sector concentration (AI, Memes, Layer 1, DeFi), and simultaneous proximity concurrence
 * to protect traders from cascading correlated drawdowns.
 */

import { CandlestickBar } from "@/lib/mexc/types";

export type CryptoSectorId =
  | "majors_l1"
  | "ai"
  | "memes"
  | "defi"
  | "infra_depin"
  | "gaming_meta"
  | "other";

export interface CryptoSectorMeta {
  id: CryptoSectorId;
  label: string;
  badge: string;
  color: string;
  description: string;
}

export const CRYPTO_SECTOR_CATALOG: Record<CryptoSectorId, CryptoSectorMeta> = {
  majors_l1: {
    id: "majors_l1",
    label: "Layer 1 / Majors",
    badge: "🏛️ L1/Majors",
    color: "#2962ff",
    description: "Benchmark Layer 1 protocols and market-cap leaders",
  },
  ai: {
    id: "ai",
    label: "Artificial Intelligence",
    badge: "🤖 AI Tokens",
    color: "#9333ea",
    description: "Decentralized AI compute, agentic protocols, and data layers",
  },
  memes: {
    id: "memes",
    label: "Meme Assets",
    badge: "🐶 Meme Coins",
    color: "#f59e0b",
    description: "High-beta community momentum and speculative viral tokens",
  },
  defi: {
    id: "defi",
    label: "Decentralized Finance",
    badge: "🏦 DeFi",
    color: "#00c087",
    description: "DEXs, lending markets, yield aggregators, and liquid staking",
  },
  infra_depin: {
    id: "infra_depin",
    label: "Infra & DePIN",
    badge: "🌐 Infra/DePIN",
    color: "#06b6d4",
    description: "Oracles, decentralized physical infrastructure, and storage",
  },
  gaming_meta: {
    id: "gaming_meta",
    label: "Gaming & Metaverse",
    badge: "🎮 GameFi",
    color: "#ec4899",
    description: "Play-to-earn gaming economies and metaverse infrastructure",
  },
  other: {
    id: "other",
    label: "Other Assets",
    badge: "🪙 Altcoins",
    color: "#848e9c",
    description: "Diversified unclassified alternative cryptocurrency pairs",
  },
};

export type RiskHeatTier = "LOW" | "MODERATE" | "ELEVATED" | "EXTREME";
export type DirectionalBias =
  | "HEAVY_BULLISH"
  | "MODERATE_BULLISH"
  | "NEUTRAL"
  | "MODERATE_BEARISH"
  | "HEAVY_BEARISH";
export type CorrelationTier = "HIGH" | "MODERATE" | "LOW" | "INVERSE";

export interface PoiCorrelationRiskInfo {
  btcCorrelation: number; // -1.00 to +1.00
  correlationTier: CorrelationTier;
  sector: CryptoSectorId;
  sectorLabel: string;
  sectorBadge: string;
  clusterExposureScore: number; // 0 - 100 risk score for this asset within portfolio
  correlatedPeersCount: number; // how many other coins share direction and sector
}

export interface SectorRiskMetrics {
  sector: CryptoSectorId;
  label: string;
  badge: string;
  color: string;
  totalCoins: number;
  bullishCount: number;
  bearishCount: number;
  nearProximityCount: number; // < 1.5% distance
  averageBtcCorrelation: number;
  sectorHeatScore: number; // 0 - 100
  heatTier: RiskHeatTier;
}

export interface PortfolioRiskHeatSummary {
  overallRiskScore: number; // 0 - 100
  riskTier: RiskHeatTier;
  directionalBias: DirectionalBias;
  directionalSkewPct: number; // e.g. +75% (heavy bullish) or -60% (heavy bearish)
  bullishPoisCount: number;
  bearishPoisCount: number;
  totalActivePois: number;
  nearProximityPoisCount: number; // < 1.5% proximity
  inZonePoisCount: number; // testing in-zone
  averageBtcCorrelation: number;
  sectorBreakdown: Record<CryptoSectorId, SectorRiskMetrics>;
  dominantSector: CryptoSectorId | null;
  warningMessages: string[];
  sizingRecommendation: string;
}

/**
 * Classifies an asset symbol into an institutional sector.
 */
export function classifyCryptoSector(symbol: string): CryptoSectorMeta {
  const norm = symbol.toUpperCase().replace(/USDT|USDC|USD|BUSD/g, "");

  // 1. Majors & Layer 1s
  const majors = [
    "BTC", "ETH", "SOL", "BNB", "XRP", "AVAX", "SUI", "NEAR", "ADA", "DOT",
    "TRX", "TON", "APT", "SEI", "KAS", "TIA", "INJ", "ALGO", "HBAR", "POL",
    "MATIC", "ATOM", "FTM", "SONIC", "LTC", "BCH", "ETC", "XLM", "MONERO", "XMR",
  ];
  if (majors.includes(norm)) return CRYPTO_SECTOR_CATALOG.majors_l1;

  // 2. AI Tokens
  const aiTokens = [
    "TAO", "RENDER", "FET", "ICP", "VIRTUAL", "ACT", "GOAT", "GRT", "AKT",
    "PRIME", "ARKM", "GLM", "IO", "NOS", "AIOZ", "ATH", "PAAL", "WLD",
    "RSR", "OCEAN", "AGIX", "SPEC", "PHB", "NMR", "ALI", "ORAI", "PROMPT",
  ];
  if (aiTokens.includes(norm)) return CRYPTO_SECTOR_CATALOG.ai;

  // 3. Meme Coins
  const memeCoins = [
    "DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI", "BRETT", "POPCAT",
    "NEIRO", "SPX", "MEW", "TURBO", "BABYDOGE", "MOG", "BOME", "MOODENG",
    "PNUT", "SLERF", "COQ", "MYRO", "WEN", "TOSHI", "LUCE", "CHILLGUY",
    "DEGEN", "SUNDOG", "MEME", "ELON", "KCS", "SAMO",
  ];
  if (memeCoins.includes(norm)) return CRYPTO_SECTOR_CATALOG.memes;

  // 4. DeFi
  const defiTokens = [
    "UNI", "AAVE", "MKR", "CRV", "LDO", "PENDLE", "JUP", "RAY", "ENA",
    "SUSHI", "COMP", "SNX", "DYDX", "GMX", "1INCH", "CAKE", "CVX", "BAL",
    "RUNE", "COW", "DRIFT", "MORPHO", "AERO", "VELO", "KMNO",
  ];
  if (defiTokens.includes(norm)) return CRYPTO_SECTOR_CATALOG.defi;

  // 5. Infra & DePIN
  const infraDepin = [
    "FIL", "AR", "HNT", "PYTH", "LINK", "STX", "ORDI", "SATS", "THETA",
    "JASMY", "MOBILE", "IOTX", "HONEY", "DIMO", "W", "EIGEN", "ETHFI",
    "REZ", "STRK", "ZK", "ZRO", "BLAST",
  ];
  if (infraDepin.includes(norm)) return CRYPTO_SECTOR_CATALOG.infra_depin;

  // 6. Gaming & Metaverse
  const gamingMeta = [
    "GALA", "AXS", "SAND", "MANA", "BEAM", "RONIN", "PIXEL", "ILV",
    "YGG", "IMX", "SUPER", "BIGTIME", "PORTAL", "ALICE", "ENJ",
  ];
  if (gamingMeta.includes(norm)) return CRYPTO_SECTOR_CATALOG.gaming_meta;

  return CRYPTO_SECTOR_CATALOG.other;
}

/**
 * Calculates Pearson Correlation Coefficient rho between two numeric series.
 * Returns value in range [-1.00, +1.00].
 */
export function calculatePearsonCorrelation(seriesA: number[], seriesB: number[]): number {
  if (!seriesA || !seriesB) return 0;
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < 5) return 0;

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += seriesA[i];
    sumB += seriesB[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = seriesA[i] - meanA;
    const diffB = seriesB[i] - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  }

  const denominator = Math.sqrt(denomA * denomB);
  if (denominator === 0 || isNaN(denominator)) return 0;

  const corr = numerator / denominator;
  return Math.max(-1, Math.min(1, Math.round(corr * 100) / 100));
}

/**
 * Calculates percentage returns from an array of close prices.
 */
export function calculateReturnsSeries(closes: number[]): number[] {
  if (!closes || closes.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev <= 0 || isNaN(prev) || isNaN(curr)) {
      returns.push(0);
    } else {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

/**
 * Computes exact Pearson correlation against BTC candle series.
 */
export function calculateBtcCorrelationFromBars(
  targetBars: CandlestickBar[],
  btcBars: CandlestickBar[]
): number {
  if (!targetBars || !btcBars || targetBars.length < 5 || btcBars.length < 5) return 0;

  const targetCloses = targetBars.map((b) => b.close);
  const btcCloses = btcBars.map((b) => b.close);

  const targetReturns = calculateReturnsSeries(targetCloses);
  const btcReturns = calculateReturnsSeries(btcCloses);

  return calculatePearsonCorrelation(targetReturns, btcReturns);
}

/**
 * Baseline fallback correlation to BTC based on sector & 24h market momentum.
 * Used when full historical candle series for both pairs are not loaded concurrently.
 */
export function estimateBtcCorrelation(
  symbol: string,
  target24hChangePct: number,
  btc24hChangePct: number = 0
): number {
  const norm = symbol.toUpperCase().replace(/USDT|USDC/g, "");
  if (norm === "BTC") return 1.0;

  const sector = classifyCryptoSector(symbol);

  // Sector baseline correlations
  let baseCorr = 0.75;
  switch (sector.id) {
    case "majors_l1":
      baseCorr = norm === "ETH" ? 0.88 : 0.82;
      break;
    case "ai":
      baseCorr = 0.74;
      break;
    case "memes":
      baseCorr = 0.68;
      break;
    case "defi":
      baseCorr = 0.72;
      break;
    case "infra_depin":
      baseCorr = 0.70;
      break;
    case "gaming_meta":
      baseCorr = 0.65;
      break;
    default:
      baseCorr = 0.60;
  }

  // Adjust correlation based on directional alignment in 24h change
  if (btc24hChangePct !== 0) {
    const sameDirection = Math.sign(target24hChangePct) === Math.sign(btc24hChangePct);
    if (sameDirection) {
      baseCorr = Math.min(0.96, baseCorr + 0.08);
    } else {
      // Divergent asset decoupling from BTC
      baseCorr = Math.max(-0.4, baseCorr - 0.45);
    }
  }

  return Math.round(baseCorr * 100) / 100;
}

/**
 * Maps a numeric Pearson correlation to a qualitative tier.
 */
export function getCorrelationTier(corr: number): CorrelationTier {
  if (corr >= 0.7) return "HIGH";
  if (corr >= 0.35) return "MODERATE";
  if (corr >= -0.2) return "LOW";
  return "INVERSE";
}

/**
 * Evaluates individual POI item correlation and exposure telemetry.
 */
export function evaluatePoiCorrelationRisk(
  symbol: string,
  direction: "BULLISH" | "BEARISH",
  distancePct: number,
  btcCorrelation: number,
  sectorPeersCount: number
): PoiCorrelationRiskInfo {
  const sectorMeta = classifyCryptoSector(symbol);
  const corrTier = getCorrelationTier(btcCorrelation);

  // Cluster risk score combines correlation strength, peer count, and proximity
  const corrFactor = Math.max(0, btcCorrelation); // 0 to 1
  const peerFactor = Math.min(1, sectorPeersCount / 5); // 0 to 1
  const proximityFactor = distancePct < 1.0 ? 1.0 : distancePct < 2.0 ? 0.75 : 0.5;

  const score = Math.round((corrFactor * 0.45 + peerFactor * 0.35 + proximityFactor * 0.2) * 100);

  return {
    btcCorrelation,
    correlationTier: corrTier,
    sector: sectorMeta.id,
    sectorLabel: sectorMeta.label,
    sectorBadge: sectorMeta.badge,
    clusterExposureScore: Math.min(100, Math.max(0, score)),
    correlatedPeersCount: sectorPeersCount,
  };
}

export interface ScannedCandidateForRisk {
  symbol: string;
  direction?: "BULLISH" | "BEARISH" | null;
  distancePct?: number;
  isInZone?: boolean;
  change24h?: number;
  btcCorrelation?: number;
}

/**
 * Evaluates comprehensive multi-asset portfolio risk heat and directional exposure.
 */
export function evaluatePortfolioRiskHeat(
  candidates: ScannedCandidateForRisk[],
  btcChange24h: number = 0
): PortfolioRiskHeatSummary {
  const total = candidates.length;

  // Initialize sector breakdowns
  const sectorMetricsMap: Record<CryptoSectorId, SectorRiskMetrics> = {
    majors_l1: {
      sector: "majors_l1",
      label: CRYPTO_SECTOR_CATALOG.majors_l1.label,
      badge: CRYPTO_SECTOR_CATALOG.majors_l1.badge,
      color: CRYPTO_SECTOR_CATALOG.majors_l1.color,
      totalCoins: 0,
      bullishCount: 0,
      bearishCount: 0,
      nearProximityCount: 0,
      averageBtcCorrelation: 0,
      sectorHeatScore: 0,
      heatTier: "LOW",
    },
    ai: {
      sector: "ai",
      label: CRYPTO_SECTOR_CATALOG.ai.label,
      badge: CRYPTO_SECTOR_CATALOG.ai.badge,
      color: CRYPTO_SECTOR_CATALOG.ai.color,
      totalCoins: 0,
      bullishCount: 0,
      bearishCount: 0,
      nearProximityCount: 0,
      averageBtcCorrelation: 0,
      sectorHeatScore: 0,
      heatTier: "LOW",
    },
    memes: {
      sector: "memes",
      label: CRYPTO_SECTOR_CATALOG.memes.label,
      badge: CRYPTO_SECTOR_CATALOG.memes.badge,
      color: CRYPTO_SECTOR_CATALOG.memes.color,
      totalCoins: 0,
      bullishCount: 0,
      bearishCount: 0,
      nearProximityCount: 0,
      averageBtcCorrelation: 0,
      sectorHeatScore: 0,
      heatTier: "LOW",
    },
    defi: {
      sector: "defi",
      label: CRYPTO_SECTOR_CATALOG.defi.label,
      badge: CRYPTO_SECTOR_CATALOG.defi.badge,
      color: CRYPTO_SECTOR_CATALOG.defi.color,
      totalCoins: 0,
      bullishCount: 0,
      bearishCount: 0,
      nearProximityCount: 0,
      averageBtcCorrelation: 0,
      sectorHeatScore: 0,
      heatTier: "LOW",
    },
    infra_depin: {
      sector: "infra_depin",
      label: CRYPTO_SECTOR_CATALOG.infra_depin.label,
      badge: CRYPTO_SECTOR_CATALOG.infra_depin.badge,
      color: CRYPTO_SECTOR_CATALOG.infra_depin.color,
      totalCoins: 0,
      bullishCount: 0,
      bearishCount: 0,
      nearProximityCount: 0,
      averageBtcCorrelation: 0,
      sectorHeatScore: 0,
      heatTier: "LOW",
    },
    gaming_meta: {
      sector: "gaming_meta",
      label: CRYPTO_SECTOR_CATALOG.gaming_meta.label,
      badge: CRYPTO_SECTOR_CATALOG.gaming_meta.badge,
      color: CRYPTO_SECTOR_CATALOG.gaming_meta.color,
      totalCoins: 0,
      bullishCount: 0,
      bearishCount: 0,
      nearProximityCount: 0,
      averageBtcCorrelation: 0,
      sectorHeatScore: 0,
      heatTier: "LOW",
    },
    other: {
      sector: "other",
      label: CRYPTO_SECTOR_CATALOG.other.label,
      badge: CRYPTO_SECTOR_CATALOG.other.badge,
      color: CRYPTO_SECTOR_CATALOG.other.color,
      totalCoins: 0,
      bullishCount: 0,
      bearishCount: 0,
      nearProximityCount: 0,
      averageBtcCorrelation: 0,
      sectorHeatScore: 0,
      heatTier: "LOW",
    },
  };

  let bullishCount = 0;
  let bearishCount = 0;
  let nearCount = 0;
  let inZoneCount = 0;
  let sumBtcCorr = 0;
  const sectorCorrSums: Record<CryptoSectorId, number> = {
    majors_l1: 0,
    ai: 0,
    memes: 0,
    defi: 0,
    infra_depin: 0,
    gaming_meta: 0,
    other: 0,
  };

  candidates.forEach((c) => {
    const sectorMeta = classifyCryptoSector(c.symbol);
    const sm = sectorMetricsMap[sectorMeta.id];
    sm.totalCoins++;

    const btcCorr =
      typeof c.btcCorrelation === "number"
        ? c.btcCorrelation
        : estimateBtcCorrelation(c.symbol, c.change24h || 0, btcChange24h);

    sumBtcCorr += btcCorr;
    sectorCorrSums[sectorMeta.id] += btcCorr;

    if (c.direction === "BULLISH") {
      bullishCount++;
      sm.bullishCount++;
    } else if (c.direction === "BEARISH") {
      bearishCount++;
      sm.bearishCount++;
    }

    const dist = c.distancePct ?? 999;
    if (dist < 1.5 || c.isInZone) {
      nearCount++;
      sm.nearProximityCount++;
    }
    if (c.isInZone) {
      inZoneCount++;
    }
  });

  // Calculate sector averages and heat scores
  let maxSectorCoins = 0;
  let dominantSector: CryptoSectorId | null = null;

  (Object.keys(sectorMetricsMap) as CryptoSectorId[]).forEach((sec) => {
    const sm = sectorMetricsMap[sec];
    if (sm.totalCoins > 0) {
      sm.averageBtcCorrelation =
        Math.round((sectorCorrSums[sec] / sm.totalCoins) * 100) / 100;

      // Sector heat based on near proximity ratio & correlation
      const nearRatio = sm.nearProximityCount / sm.totalCoins;
      const directionalCrowding =
        sm.totalCoins > 1
          ? Math.abs(sm.bullishCount - sm.bearishCount) / sm.totalCoins
          : 0;

      const heat = Math.round(
        (nearRatio * 45 + directionalCrowding * 35 + Math.max(0, sm.averageBtcCorrelation) * 20)
      );
      sm.sectorHeatScore = Math.min(100, Math.max(0, heat));
      sm.heatTier =
        sm.sectorHeatScore >= 75
          ? "EXTREME"
          : sm.sectorHeatScore >= 50
          ? "ELEVATED"
          : sm.sectorHeatScore >= 25
          ? "MODERATE"
          : "LOW";

      if (sm.totalCoins > maxSectorCoins) {
        maxSectorCoins = sm.totalCoins;
        dominantSector = sec;
      }
    }
  });

  const avgBtcCorr = total > 0 ? Math.round((sumBtcCorr / total) * 100) / 100 : 0.75;
  const directionalSkewPct =
    bullishCount + bearishCount > 0
      ? Math.round(((bullishCount - bearishCount) / (bullishCount + bearishCount)) * 100)
      : 0;

  // Directional bias classification
  let directionalBias: DirectionalBias = "NEUTRAL";
  if (directionalSkewPct >= 60) directionalBias = "HEAVY_BULLISH";
  else if (directionalSkewPct >= 20) directionalBias = "MODERATE_BULLISH";
  else if (directionalSkewPct <= -60) directionalBias = "HEAVY_BEARISH";
  else if (directionalSkewPct <= -20) directionalBias = "MODERATE_BEARISH";

  // Overall multi-factor portfolio risk heat score (0 - 100)
  // Factor 1: Directional Skew Magnitude (0 - 35 pts)
  const skewPts = (Math.abs(directionalSkewPct) / 100) * 35;

  // Factor 2: Concurrence of near proximity POIs (0 - 30 pts)
  const nearRatio = total > 0 ? Math.min(1, nearCount / Math.max(3, total * 0.4)) : 0;
  const nearPts = nearRatio * 30;

  // Factor 3: High BTC Correlation Intensity (0 - 20 pts)
  const corrPts = Math.max(0, avgBtcCorr) * 20;

  // Factor 4: Sector Concentration (0 - 15 pts)
  let sectorMaxHeat = 0;
  Object.values(sectorMetricsMap).forEach((sm) => {
    if (sm.sectorHeatScore > sectorMaxHeat) sectorMaxHeat = sm.sectorHeatScore;
  });
  const sectorPts = (sectorMaxHeat / 100) * 15;

  const rawScore = Math.round(skewPts + nearPts + corrPts + sectorPts);
  const overallRiskScore = Math.min(100, Math.max(0, rawScore));

  let riskTier: RiskHeatTier = "LOW";
  if (overallRiskScore >= 75) riskTier = "EXTREME";
  else if (overallRiskScore >= 55) riskTier = "ELEVATED";
  else if (overallRiskScore >= 35) riskTier = "MODERATE";

  // Institutional Risk Advisories & Warnings
  const warningMessages: string[] = [];

  if (Math.abs(directionalSkewPct) >= 60 && total >= 3) {
    const dir = directionalSkewPct > 0 ? "Bullish Demand" : "Bearish Supply";
    warningMessages.push(
      `⚠️ Heavy Directional Crowding: ${Math.abs(directionalSkewPct)}% of scanned POIs are on ${dir}. A sudden market reversal will hit multiple stop-outs simultaneously.`
    );
  }

  if (nearCount >= 3) {
    warningMessages.push(
      `⚡ Simultaneous Exposure Alert: ${nearCount} correlated pairs are within < 1.5% of POIs. Concurrent execution creates aggregate leverage risk.`
    );
  }

  // Check specific sector crowding
  Object.values(sectorMetricsMap).forEach((sm) => {
    if (sm.nearProximityCount >= 3 && sm.sectorHeatScore >= 60) {
      warningMessages.push(
        `🚨 ${sm.label} Sector Cluster: ${sm.nearProximityCount} tokens approaching zones in unison. Cap cumulative sector allocation to <= 3% portfolio risk.`
      );
    }
  });

  if (warningMessages.length === 0) {
    warningMessages.push(
      `🛡️ Balanced Market Heat: Directional skew is within safe tolerance and POI touches are non-clustered.`
    );
  }

  // Institutional Sizing Recommendation
  let sizingRecommendation = "Full 1.0x standard position sizing. Portfolio risk is well-distributed.";
  if (riskTier === "EXTREME") {
    sizingRecommendation =
      "DEFENSIVE ACTION: 0.33x - 0.50x reduced sizing recommended. Strong multi-asset correlation and heavy directional clustering present cascade drawdown risk.";
  } else if (riskTier === "ELEVATED") {
    sizingRecommendation =
      "CAUTION ADVISED: 0.60x - 0.75x sizing recommended. High BTC correlation and simultaneous sector touches suggest scaling back correlated risk.";
  } else if (riskTier === "MODERATE") {
    sizingRecommendation =
      "MODERATE HEAT: 0.85x sizing suggested. Watch for BTC directional sweeps before executing multiple same-direction orders.";
  }

  return {
    overallRiskScore,
    riskTier,
    directionalBias,
    directionalSkewPct,
    bullishPoisCount: bullishCount,
    bearishPoisCount: bearishCount,
    totalActivePois: total,
    nearProximityPoisCount: nearCount,
    inZonePoisCount: inZoneCount,
    averageBtcCorrelation: avgBtcCorr,
    sectorBreakdown: sectorMetricsMap,
    dominantSector,
    warningMessages,
    sizingRecommendation,
  };
}
