import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import {
  getMaskedBrokerCredentials,
  saveServerBrokerCredentials,
  deleteServerBrokerCredentials,
} from "@/lib/trading/broker-auth-store";
import {
  validateBrokerCredentials,
  SupportedBrokerExchange,
  BrokerCredentials,
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
 * GET /api/broker/credentials
 * Returns masked credentials for all configured exchanges.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    const credentials = await getMaskedBrokerCredentials(userId);
    return NextResponse.json({ credentials });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to retrieve broker credentials" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/broker/credentials
 * Saves or updates API credentials for an exchange.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    const body: BrokerCredentials = await request.json();

    const validation = validateBrokerCredentials(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    await saveServerBrokerCredentials(userId, body);
    const updated = await getMaskedBrokerCredentials(userId);

    return NextResponse.json({
      success: true,
      credentials: updated,
      savedExchange: body.exchange,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to save broker credentials" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/broker/credentials
 * Removes API credentials for a specific exchange.
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get("exchange") as SupportedBrokerExchange;

    if (!exchange || !["mexc", "binance", "bybit"].includes(exchange)) {
      return NextResponse.json(
        { error: "Must specify a valid exchange query parameter (mexc, binance, or bybit)" },
        { status: 400 }
      );
    }

    await deleteServerBrokerCredentials(userId, exchange);
    const updated = await getMaskedBrokerCredentials(userId);

    return NextResponse.json({
      success: true,
      credentials: updated,
      deletedExchange: exchange,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete broker credentials" },
      { status: 500 }
    );
  }
}
