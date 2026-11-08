import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { getServerBrokerCredentials } from "@/lib/trading/broker-auth-store";
import {
  testBrokerConnection,
  SupportedBrokerExchange,
  BrokerCredentials,
  validateBrokerCredentials,
} from "@/lib/trading/multi-broker-client";

export const dynamic = "force-dynamic";

async function getAuthUserId(request: NextRequest): Promise<string> {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (token) {
    const payload = await verifyToken(token);
    if (payload?.userId) return payload.userId;
  }
  const devUserId = request.headers.get("X-User-Id");
  if (devUserId) return devUserId;
  return "default-trader";
}

/**
 * POST /api/broker/balance
 * Tests connection and fetches current balance summary for the specified exchange.
 * Can accept stored credentials or ad-hoc credentials in the body for instant testing.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    const body = await request.json();
    const exchange = body.exchange as SupportedBrokerExchange;

    if (!exchange || !["mexc", "binance", "bybit"].includes(exchange)) {
      return NextResponse.json(
        { error: "Valid exchange (mexc, binance, bybit) is required" },
        { status: 400 }
      );
    }

    let creds: BrokerCredentials | undefined;

    // Ad-hoc testing if API key/secret provided in body
    if (body.apiKey && body.apiSecret) {
      creds = {
        exchange,
        apiKey: body.apiKey,
        apiSecret: body.apiSecret,
        testnet: Boolean(body.testnet),
      };
    } else {
      // Lookup stored credentials
      const userCreds = await getServerBrokerCredentials(userId);
      creds = userCreds[exchange];
    }

    if (!creds) {
      return NextResponse.json(
        { error: `No credentials configured for ${exchange.toUpperCase()}` },
        { status: 404 }
      );
    }

    const res = await testBrokerConnection(creds);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error, latencyMs: res.latencyMs },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      latencyMs: res.latencyMs,
      balance: res.balance,
      exchange,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch broker balance" },
      { status: 500 }
    );
  }
}
