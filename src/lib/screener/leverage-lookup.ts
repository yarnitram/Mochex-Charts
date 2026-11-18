import { fromMexcContractSymbol, SupportedExchange } from "./multi-exchange-client";

const CACHE_TTL_MS = 30 * 60_000;

interface LeverageCacheEntry {
  fetchedAt: number;
  bySymbol: Map<string, number>;
}

const cache = new Map<SupportedExchange, LeverageCacheEntry>();

function normalizeKey(symbol: string): string {
  return symbol.toUpperCase().trim().replace(/[\/\-_]/g, "");
}

async function fetchWithTimeout(url: string, timeoutMs = 2500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Loads and caches max leverage limits per perpetual contract from public exchange endpoints
 * (MEXC contract/detail & Bybit instruments-info).
 */
export async function getExchangeMaxLeverageMap(
  exchange: SupportedExchange
): Promise<Map<string, number>> {
  const existing = cache.get(exchange);
  if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
    return existing.bySymbol;
  }

  const map = new Map<string, number>();

  try {
    if (exchange === "mexc") {
      const res = await fetchWithTimeout("https://contract.mexc.com/api/v1/contract/detail");
      if (res.ok) {
        const json = await res.json();
        const rows = Array.isArray(json?.data) ? json.data : [];
        for (const item of rows) {
          const rawSym = item?.symbol;
          const lev = Number(item?.maxLeverage);
          if (rawSym && Number.isFinite(lev) && lev > 0) {
            map.set(normalizeKey(fromMexcContractSymbol(String(rawSym))), lev);
          }
        }
      }
    } else if (exchange === "bybit") {
      const res = await fetchWithTimeout(
        "https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000"
      );
      if (res.ok) {
        const json = await res.json();
        const rows = Array.isArray(json?.result?.list) ? json.result.list : [];
        for (const item of rows) {
          const rawSym = item?.symbol;
          const lev = Number(item?.leverageFilter?.maxLeverage);
          if (rawSym && Number.isFinite(lev) && lev > 0) {
            map.set(normalizeKey(String(rawSym)), lev);
          }
        }
      }
    }
  } catch {
    // Non-fatal: keep partial/empty map or previous stale cache
    if (existing) return existing.bySymbol;
  }

  if (map.size > 0) {
    cache.set(exchange, { fetchedAt: Date.now(), bySymbol: map });
  }
  return map;
}

export interface ResolvedMaxLeverage {
  maxLeverage: number;
  source: SupportedExchange;
}

/**
 * Resolves the maximum futures leverage for a symbol, checking its configured exchange first
 * and falling back to MEXC/Bybit public futures contract specs when Binance doesn't expose one publicly.
 */
export async function resolveMaxLeverageInfo(
  symbol: string,
  preferredExchange?: SupportedExchange
): Promise<ResolvedMaxLeverage | null> {
  const clean = normalizeKey(symbol);
  if (!clean) return null;

  const order: SupportedExchange[] =
    preferredExchange === "bybit"
      ? ["bybit", "mexc"]
      : ["mexc", "bybit"];

  for (const ex of order) {
    const map = await getExchangeMaxLeverageMap(ex);
    const val = map.get(clean);
    if (typeof val === "number" && Number.isFinite(val) && val > 0) {
      return { maxLeverage: val, source: ex };
    }
  }

  return null;
}

export function clearMaxLeverageCache(): void {
  cache.clear();
}
