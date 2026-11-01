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

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pb = getPocketBase(user.pbToken);
    const records = await pb.collection("watchlists").getFullList({
      filter: pb.filter("user = {:userId}", { userId: user.userId }),
      sort: "-updated",
    });

    const watchlists = records.map((r) => ({
      id: r.id,
      userId: r.user,
      name: r.name,
      symbols: r.symbols,
      isDefault: Boolean(r.is_default),
      updatedAt: r.updated,
    }));

    return NextResponse.json(watchlists);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch watchlists" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      name = "Main Watchlist",
      symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
      isDefault = true,
    } = await request.json();

    const pb = getPocketBase(user.pbToken);

    if (isDefault) {
      try {
        const existingDefaults = await pb.collection("watchlists").getFullList({
          filter: pb.filter("user = {:userId} && is_default = true", { userId: user.userId }),
        });
        for (const record of existingDefaults) {
          await pb.collection("watchlists").update(record.id, { is_default: false });
        }
      } catch (err) {
        console.warn("Error unsetting default watchlists:", err);
      }
    }

    const created = await pb.collection("watchlists").create({
      user: user.userId,
      name,
      symbols,
      is_default: Boolean(isDefault),
    });

    return NextResponse.json(
      {
        id: created.id,
        userId: created.user,
        name: created.name,
        symbols: created.symbols,
        isDefault: Boolean(created.is_default),
        updatedAt: created.updated,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create watchlist" },
      { status: 500 }
    );
  }
}
