import { NextRequest, NextResponse } from "next/server";
import { verifyToken, UserPayload } from "@/lib/auth/jwt";
import {
  getServerAlerts,
  saveServerAlert,
  saveServerAlertsBatch,
  deleteServerAlertsBatch,
  updateServerAlertsBatch,
  getServerAlertLogs,
} from "@/lib/alerts/server-alerts-store";
import { serverAlertDaemon } from "@/lib/alerts/server-alert-daemon";
import { PriceAlert } from "@/lib/alerts/alerts-engine";

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
 * GET /api/alerts - Returns current user's alerts and recent logs
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const alerts = await getServerAlerts(user.userId);
    const logs = await getServerAlertLogs(user.userId);
    return NextResponse.json({ alerts, logs });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/alerts - Creates or updates alert(s) in single or batch mode, and triggers daemon subscription
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Check if batch payload: { alerts: PriceAlert[] } or Array.isArray(body)
    const alertList: PriceAlert[] | null = Array.isArray(body)
      ? body
      : Array.isArray(body?.alerts)
      ? body.alerts
      : null;

    if (alertList) {
      if (alertList.length === 0) {
        return NextResponse.json({ success: true, count: 0, alerts: [] });
      }
      const validAlerts = alertList.filter((a) => a && a.symbol && a.id);
      const saved = await saveServerAlertsBatch(validAlerts, user.userId);

      // Notify 24/7 background worker to subscribe to new symbols immediately
      serverAlertDaemon.notifyAlertsChanged().catch(() => {});

      return NextResponse.json({ success: true, count: saved.length, alerts: saved });
    }

    const alertData = body as PriceAlert;
    if (!alertData || !alertData.symbol || !alertData.id) {
      return NextResponse.json(
        { error: "Invalid alert payload. Symbol and ID required." },
        { status: 400 }
      );
    }

    const saved = await saveServerAlert(alertData, user.userId);

    // Notify 24/7 background worker to subscribe to symbol immediately
    serverAlertDaemon.notifyAlertsChanged().catch(() => {});

    return NextResponse.json({ success: true, alert: saved });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save alert" },
      { status: 500 }
    );
  }
}


/**
 * DELETE /api/alerts - Batch deletes alerts by IDs (DEC-158)
 */
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : Array.isArray(body) ? body : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "No alert IDs provided" }, { status: 400 });
    }

    const count = await deleteServerAlertsBatch(ids, user.userId);
    serverAlertDaemon.notifyAlertsChanged().catch(() => {});
    return NextResponse.json({ success: true, count });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to batch delete alerts" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/alerts - Batch updates alerts (e.g. pause/resume) (DEC-158)
 */
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const updates: Partial<PriceAlert> = body?.updates || {};

    if (ids.length === 0) {
      return NextResponse.json({ error: "No alert IDs provided" }, { status: 400 });
    }

    const count = await updateServerAlertsBatch(ids, updates, user.userId);
    serverAlertDaemon.notifyAlertsChanged().catch(() => {});
    return NextResponse.json({ success: true, count });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to batch update alerts" },
      { status: 500 }
    );
  }
}
