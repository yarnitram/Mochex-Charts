import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { getServerBrokerCredentials } from "@/lib/trading/broker-auth-store";
import {
  executeBrokerOrder,
  LiveOrderInput,
  SupportedBrokerExchange,
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
 * POST /api/broker/order
 * Executes a live direct order on the selected exchange.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    const order: LiveOrderInput = await request.json();

    if (!order.exchange || !["mexc", "binance", "bybit"].includes(order.exchange)) {
      return NextResponse.json(
        { error: "Valid exchange (mexc, binance, bybit) is required" },
        { status: 400 }
      );
    }

    if (!order.symbol || !order.side || !order.type || !order.quantity || order.quantity <= 0) {
      return NextResponse.json(
        { error: "Missing required order parameters: symbol, side, type, quantity" },
        { status: 400 }
      );
    }

    const userCreds = await getServerBrokerCredentials(userId);
    const creds = userCreds[order.exchange];

    if (!creds) {
      return NextResponse.json(
        {
          error: `No API credentials found for ${order.exchange.toUpperCase()}. Please configure your API key in Broker Settings.`,
        },
        { status: 404 }
      );
    }

    const result = await executeBrokerOrder(creds, order);

    return NextResponse.json({
      success: true,
      order: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Order execution failed on exchange",
      },
      { status: 500 }
    );
  }
}
