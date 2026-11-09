import { NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const rawInterval = searchParams.get("interval") || "15m";
  const startTime = searchParams.get("startTime");
  const endTime = searchParams.get("endTime");
  const rawLimit = parseInt(searchParams.get("limit") || "500", 10);

  const is2h = rawInterval.toLowerCase() === "2h" || rawInterval === "120" || rawInterval === "120m";
  const interval = is2h ? "60m" : rawInterval;
  const limit = (is2h ? rawLimit * 2 : rawLimit).toString();

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
