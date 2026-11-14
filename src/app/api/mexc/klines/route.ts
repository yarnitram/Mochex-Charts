import { NextRequest, NextResponse } from "next/server";
import {
  toMexcContractSymbol,
  normalizeMexcContractInterval,
} from "@/lib/screener/multi-exchange-client";

function aggregateRawMexcKlines(raw: any[]): any[] {
  if (!Array.isArray(raw) || raw.length === 0) return raw;
  const bucketMs = 2 * 3600 * 1000;
  const map = new Map<number, any[]>();
  for (const k of raw) {
    const time = Number(k[0]);
    const bucketTime = Math.floor(time / bucketMs) * bucketMs;
    const existing = map.get(bucketTime);
    if (!existing) {
      map.set(bucketTime, [
        bucketTime,
        k[1], // open
        parseFloat(k[2]), // high
        parseFloat(k[3]), // low
        k[4], // close
        parseFloat(k[5]), // volume
        bucketTime + bucketMs - 1,
        parseFloat(k[7] || 0), // quoteVolume
      ]);
    } else {
      existing[2] = Math.max(existing[2], parseFloat(k[2]));
      existing[3] = Math.min(existing[3], parseFloat(k[3]));
      existing[4] = k[4]; // latest close
      existing[5] = existing[5] + parseFloat(k[5]);
      existing[7] = existing[7] + parseFloat(k[7] || 0);
    }
  }
  return Array.from(map.values()).map((k) => [
    k[0],
    k[1],
    k[2].toString(),
    k[3].toString(),
    k[4],
    k[5].toString(),
    k[6],
    k[7].toString(),
  ]);
}

async function fetchMexcContractKlinesRaw(
  symbol: string,
  interval: string,
  numericLimit: number,
  startTime: string | null,
  endTime: string | null
): Promise<any[] | null> {
  const contractSym = toMexcContractSymbol(symbol);
  const contractIv = normalizeMexcContractInterval(interval);
  const contractParams = new URLSearchParams({ interval: contractIv });
  if (startTime) {
    contractParams.set("start", Math.floor(Number(startTime) / 1000).toString());
  }
  if (endTime) {
    contractParams.set("end", Math.floor(Number(endTime) / 1000).toString());
  }

  const res = await fetch(
    `https://contract.mexc.com/api/v1/contract/kline/${encodeURIComponent(contractSym)}?${contractParams.toString()}`,
    { method: "GET", headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;

  const json = await res.json();
  const data = json?.data;
  if (!json?.success || !data || !Array.isArray(data.time) || data.time.length === 0) {
    return null;
  }

  const len = data.time.length;
  const rows: any[] = [];
  for (let i = 0; i < len; i++) {
    const timeMs = Number(data.time[i]) * 1000;
    rows.push([
      timeMs,
      String(data.open?.[i] ?? 0),
      String(data.high?.[i] ?? 0),
      String(data.low?.[i] ?? 0),
      String(data.close?.[i] ?? 0),
      String(data.vol?.[i] ?? 0),
      timeMs,
      String(data.amount?.[i] ?? 0),
    ]);
  }
  return !startTime && !endTime && rows.length > numericLimit
    ? rows.slice(-numericLimit)
    : rows;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const rawInterval = searchParams.get("interval") || "15m";
  const startTime = searchParams.get("startTime");
  const endTime = searchParams.get("endTime");
  const market = (searchParams.get("market") || "").toLowerCase();
  const rawLimit = parseInt(searchParams.get("limit") || "500", 10);

  const is2h = rawInterval.toLowerCase() === "2h" || rawInterval === "120" || rawInterval === "120m";
  const interval = is2h ? "60m" : rawInterval;
  const numericLimit = is2h ? rawLimit * 2 : rawLimit;
  const limit = numericLimit.toString();

  if (market === "futures") {
    try {
      const futuresRaw = await fetchMexcContractKlinesRaw(
        symbol,
        interval,
        numericLimit,
        startTime,
        endTime
      );
      if (futuresRaw && futuresRaw.length > 0) {
        return NextResponse.json(is2h ? aggregateRawMexcKlines(futuresRaw) : futuresRaw);
      }
    } catch {
      // Fall through to Spot endpoint
    }
  }

  const mexcBase = process.env.NEXT_PUBLIC_MEXC_API_BASE || "https://api.mexc.co";
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval,
    limit,
  });

  if (startTime) params.set("startTime", startTime);
  if (endTime) params.set("endTime", endTime);

  try {
    const upstreamUrl = `${mexcBase}/api/v3/klines?${params.toString()}`;
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (market !== "futures") {
        const futuresRaw = await fetchMexcContractKlinesRaw(
          symbol,
          interval,
          numericLimit,
          startTime,
          endTime
        ).catch(() => null);
        if (futuresRaw && futuresRaw.length > 0) {
          return NextResponse.json(is2h ? aggregateRawMexcKlines(futuresRaw) : futuresRaw);
        }
      }
      return NextResponse.json(
        { error: `Upstream MEXC error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(is2h ? aggregateRawMexcKlines(data) : data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch from MEXC upstream" },
      { status: 502 }
    );
  }
}
