import { NextRequest, NextResponse } from "next/server";
import { verifyToken, UserPayload } from "@/lib/auth/jwt";
import {
  getServerWebhooks,
  saveServerWebhooks,
} from "@/lib/alerts/server-alerts-store";
import { serverAlertDaemon } from "@/lib/alerts/server-alert-daemon";
import { AlertWebhookConfig } from "@/lib/alerts/webhook-dispatcher";

export const dynamic = "force-dynamic";

async function getAuthUser(request: NextRequest): Promise<UserPayload> {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload && payload.userId) return payload;
    } catch {}
  }

  const devUserId = request.headers.get("X-User-Id");
  if (devUserId) {
    return {
      userId: devUserId,
      username: devUserId,
      email: `${devUserId}@local`,
      role: "TRADER",
    };
  }

  return {
    userId: "default-trader",
    username: "Trader",
    email: "trader@mochex.local",
    role: "TRADER",
  };
}

/**
 * GET /api/alerts/webhooks - Returns user's saved webhook configuration
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = (await getServerWebhooks(user.userId)) || {};
    return NextResponse.json({ config });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch webhooks" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/alerts/webhooks - Saves user's webhook configuration and refreshes daemon context
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = (await request.json()) as AlertWebhookConfig;
    const saved = await saveServerWebhooks(user.userId, config);

    // Refresh active daemon alerts with new webhook credentials
    serverAlertDaemon.notifyAlertsChanged().catch(() => {});

    return NextResponse.json({ success: true, config: saved });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save webhooks" },
      { status: 500 }
    );
  }
}
