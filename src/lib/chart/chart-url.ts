export type ChartIndicatorSlug =
  | "ob"
  | "validated-ob-radar"
  | "ob-fvg"
  | "validated-ob-fvg"
  | "ema"
  | "mtf-ema"
  | "sandwich"
  | "sandwich-zones"
  | "market-structure"
  | "ms";

const INDICATOR_SLUG_TO_NAME: Record<string, string> = {
  ob: "Validated OB (Radar / Alarm)",
  "validated-ob-radar": "Validated OB (Radar / Alarm)",
  "ob-fvg": "Validated OB + FVG (RGG / GRR)",
  "validated-ob-fvg": "Validated OB + FVG (RGG / GRR)",
  ema: "MTF EMA — 20/50/100/200",
  "mtf-ema": "MTF EMA — 20/50/100/200",
  sandwich: "Sandwich Zones ++ (Multi-Timeframe)",
  "sandwich-zones": "Sandwich Zones ++ (Multi-Timeframe)",
  "market-structure": "True Market Structure & Substructure",
  ms: "True Market Structure & Substructure",
};

const VALID_RESOLUTIONS: Record<string, string> = {
  "1": "1",
  "1m": "1",
  "5": "5",
  "5m": "5",
  "15": "15",
  "15m": "15",
  "30": "30",
  "30m": "30",
  "60": "60",
  "60m": "60",
  "1h": "60",
  "120": "120",
  "120m": "120",
  "2h": "120",
  "240": "240",
  "240m": "240",
  "4h": "240",
  d: "1D",
  "1d": "1D",
  "1440": "1D",
  w: "1W",
  "1w": "1W",
  "10080": "1W",
};

const DISPLAY_TF_LABELS: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1H",
  "120": "2H",
  "240": "4H",
  "1D": "1D",
  "1W": "1W",
};

export function normalizeChartSymbolParam(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const clean = raw.toUpperCase().trim().replace(/[\/\-_]/g, "");
  return clean.length >= 3 ? clean : null;
}

export function normalizeChartTimeframeParam(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  return VALID_RESOLUTIONS[key] ?? null;
}

export function formatChartTimeframeQueryLabel(raw?: string | null): string {
  const res = normalizeChartTimeframeParam(raw);
  if (!res) return "1H";
  return DISPLAY_TF_LABELS[res] || res;
}

export function resolveChartIndicatorsParam(raw?: string | null): string[] {
  if (!raw || typeof raw !== "string") return [];
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim().toLowerCase();
    const mapped = INDICATOR_SLUG_TO_NAME[slug];
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
      resolved.push(mapped);
    }
  }
  return resolved;
}

export function getMochexAppBaseUrl(overrideUrl?: string | null): string {
  if (overrideUrl && typeof overrideUrl === "string") {
    const trimmed = overrideUrl.trim().replace(/\/+$/, "");
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }

  if (typeof process !== "undefined" && process.env) {
    const envUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      process.env.MOCHEX_BASE_URL ||
      "";
    if (envUrl.trim()) return envUrl.trim().replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "http://192.168.2.22:3018";
}

export interface BuildMochexChartUrlParams {
  symbol: string;
  timeframe?: string;
  exchange?: string;
  indicator?: ChartIndicatorSlug | string;
  tab?: string;
  targetPrice?: number;
  baseUrl?: string | null;
  absolute?: boolean;
}

/**
 * Builds a Mochex Chart link with URL parameters (?symbol=...&tf=...&exchange=...&indicator=...).
 */
export function buildMochexChartUrl(params: BuildMochexChartUrlParams): string {
  const search = new URLSearchParams();
  const sym = normalizeChartSymbolParam(params.symbol) || "BTCUSDT";
  search.set("symbol", sym);

  if (params.timeframe) {
    search.set("tf", formatChartTimeframeQueryLabel(params.timeframe));
  }
  if (params.exchange) {
    search.set("exchange", params.exchange.toLowerCase().trim());
  }
  if (params.indicator) {
    search.set("indicator", params.indicator.trim());
  }
  if (params.tab) {
    search.set("tab", params.tab.trim());
  }
  if (typeof params.targetPrice === "number" && Number.isFinite(params.targetPrice) && params.targetPrice > 0) {
    search.set("target", String(params.targetPrice));
  }

  const relative = `/chart?${search.toString()}`;
  if (params.absolute || params.baseUrl) {
    return `${getMochexAppBaseUrl(params.baseUrl)}${relative}`;
  }
  return relative;
}

export function buildChartUrlForAlert(
  alert: {
    symbol: string;
    targetPrice?: number;
    exchange?: string;
    poiMetadata?: { category?: string; timeframe?: string; exchange?: string };
    emaMetadata?: { timeframe?: string };
  },
  log?: {
    symbol?: string;
    targetPrice?: number;
    exchange?: string;
    poiMetadata?: { category?: string; timeframe?: string; exchange?: string };
    emaMetadata?: { timeframe?: string };
  } | null,
  baseUrl?: string | null
): string {
  const poiMeta = alert.poiMetadata || log?.poiMetadata;
  const emaMeta = alert.emaMetadata || log?.emaMetadata;
  const timeframe = poiMeta?.timeframe || emaMeta?.timeframe || "1H";
  const exchange = alert.exchange || log?.exchange || poiMeta?.exchange;

  let indicator: ChartIndicatorSlug | undefined;
  if (emaMeta) indicator = "ema";
  else if (poiMeta?.category === "order_block") indicator = "validated-ob-radar";
  else if (poiMeta?.category === "sandwich_zone") indicator = "sandwich";

  return buildMochexChartUrl({
    symbol: alert.symbol || log?.symbol || "BTCUSDT",
    timeframe,
    exchange,
    indicator,
    targetPrice: log?.targetPrice ?? alert.targetPrice,
    baseUrl,
    absolute: true,
  });
}
