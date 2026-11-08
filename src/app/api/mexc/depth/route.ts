import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const limit = searchParams.get("limit") || "20";

  const mexcBase = process.env.NEXT_PUBLIC_MEXC_API_BASE || "https://api.mexc.co";

  try {
    const upstreamUrl = `${mexcBase}/api/v3/depth?symbol=${encodeURIComponent(symbol.toUpperCase())}&limit=${encodeURIComponent(limit)}`;
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 1 }, // 1-second cache
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream MEXC error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch depth from MEXC upstream" },
      { status: 502 }
    );
  }
}
