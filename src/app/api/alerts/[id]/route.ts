import { NextRequest, NextResponse } from "next/server";
import { verifyToken, UserPayload } from "@/lib/auth/jwt";
import {
  updateServerAlert,
  deleteServerAlert,
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
 * PUT /api/alerts/[id] - Updates alert parameters or active status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updates = (await request.json()) as Partial<PriceAlert>;
    const updated = await updateServerAlert(id, updates, user.userId);

    if (!updated) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    // Notify daemon
    serverAlertDaemon.notifyAlertsChanged().catch(() => {});

    return NextResponse.json({ success: true, alert: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update alert" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/alerts/[id] - Deletes an alert
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await deleteServerAlert(id, user.userId);
    if (!deleted) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    // Notify daemon
    serverAlertDaemon.notifyAlertsChanged().catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete alert" },
      { status: 500 }
    );
  }
}
