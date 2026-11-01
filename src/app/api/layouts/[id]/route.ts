import { NextRequest, NextResponse } from "next/server";
import { getPocketBase } from "@/lib/db/pocketbase";
import { canDeleteAnyLayout, verifyToken } from "@/lib/auth/jwt";

async function getAuthUser(request: NextRequest) {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pb = getPocketBase(user.pbToken);
    let layout;
    try {
      layout = await pb.collection("chart_layouts").getOne(id);
    } catch {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }

    if (layout.user !== user.userId && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      id: layout.id,
      userId: layout.user,
      name: layout.name,
      symbol: layout.symbol,
      resolution: layout.resolution,
      content: layout.content,
      isDefault: Boolean(layout.is_default),
      updatedAt: layout.updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to retrieve layout" },
      { status: 500 }
    );
  }
}

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
    const pb = getPocketBase(user.pbToken);
    let layout;
    try {
      layout = await pb.collection("chart_layouts").getOne(id);
    } catch {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }

    if (layout.user !== user.userId && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, symbol, resolution, content, isDefault } = await request.json();

    if (isDefault) {
      try {
        const existingDefaults = await pb.collection("chart_layouts").getFullList({
          filter: pb.filter("user = {:userId} && is_default = true", { userId: layout.user }),
        });
        for (const record of existingDefaults) {
          if (record.id !== id) {
            await pb.collection("chart_layouts").update(record.id, { is_default: false });
          }
        }
      } catch (err) {
        console.warn("Error unsetting default layout:", err);
      }
    }

    const updateData: Record<string, any> = {};
    if (name) updateData.name = name;
    if (symbol) updateData.symbol = symbol;
    if (resolution) updateData.resolution = resolution;
    if (content) updateData.content = content;
    if (isDefault !== undefined) updateData.is_default = Boolean(isDefault);

    const updated = await pb.collection("chart_layouts").update(id, updateData);

    return NextResponse.json({
      id: updated.id,
      userId: updated.user,
      name: updated.name,
      symbol: updated.symbol,
      resolution: updated.resolution,
      content: updated.content,
      isDefault: Boolean(updated.is_default),
      updatedAt: updated.updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update layout" },
      { status: 500 }
    );
  }
}

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
    const pb = getPocketBase(user.pbToken);
    let layout;
    try {
      layout = await pb.collection("chart_layouts").getOne(id);
    } catch {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }

    if (layout.user !== user.userId && !canDeleteAnyLayout(user.role)) {
      return NextResponse.json(
        { error: "Forbidden: Cannot delete other user's layout" },
        { status: 403 }
      );
    }

    await pb.collection("chart_layouts").delete(id);
    return NextResponse.json({ success: true, message: "Layout deleted" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete layout" },
      { status: 500 }
    );
  }
}
