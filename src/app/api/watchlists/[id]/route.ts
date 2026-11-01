import { NextRequest, NextResponse } from "next/server";
import { getPocketBase } from "@/lib/db/pocketbase";
import { verifyToken } from "@/lib/auth/jwt";

async function getAuthUser(request: NextRequest) {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
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
    let watchlist;
    try {
      watchlist = await pb.collection("watchlists").getOne(id);
    } catch {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    if (watchlist.user !== user.userId) {
      return NextResponse.json(
        { error: "Forbidden: Owner only" },
        { status: 403 }
      );
    }

    const { name, symbols, isDefault } = await request.json();

    if (isDefault) {
      try {
        const existingDefaults = await pb.collection("watchlists").getFullList({
          filter: pb.filter("user = {:userId} && is_default = true", { userId: watchlist.user }),
        });
        for (const record of existingDefaults) {
          if (record.id !== id) {
            await pb.collection("watchlists").update(record.id, { is_default: false });
          }
        }
      } catch (err) {
        console.warn("Error unsetting default watchlists:", err);
      }
    }

    const updateData: Record<string, any> = {};
    if (name) updateData.name = name;
    if (symbols) updateData.symbols = symbols;
    if (isDefault !== undefined) updateData.is_default = Boolean(isDefault);

    const updated = await pb.collection("watchlists").update(id, updateData);

    return NextResponse.json({
      id: updated.id,
      userId: updated.user,
      name: updated.name,
      symbols: updated.symbols,
      isDefault: Boolean(updated.is_default),
      updatedAt: updated.updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update watchlist" },
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
    let watchlist;
    try {
      watchlist = await pb.collection("watchlists").getOne(id);
    } catch {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    if (watchlist.user !== user.userId) {
      return NextResponse.json(
        { error: "Forbidden: Owner only" },
        { status: 403 }
      );
    }

    await pb.collection("watchlists").delete(id);
    return NextResponse.json({ success: true, message: "Watchlist deleted" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete watchlist" },
      { status: 500 }
    );
  }
}
