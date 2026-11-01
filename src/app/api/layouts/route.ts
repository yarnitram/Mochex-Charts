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
    const records = await pb.collection("chart_layouts").getFullList({
      filter: pb.filter("user = {:userId}", { userId: user.userId }),
      sort: "-updated",
    });

    const layouts = records.map((r) => ({
      id: r.id,
      name: r.name,
      symbol: r.symbol,
      resolution: r.resolution,
      isDefault: Boolean(r.is_default),
      updatedAt: r.updated,
    }));

    return NextResponse.json(layouts);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch layouts" },
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
    const { name, symbol = "BTCUSDT", resolution = "15", content, isDefault = false } =
      await request.json();

    if (!name || !content) {
      return NextResponse.json(
        { error: "Name and content are required" },
        { status: 400 }
      );
    }

    const pb = getPocketBase(user.pbToken);

    if (isDefault) {
      try {
        const existingDefaults = await pb.collection("chart_layouts").getFullList({
          filter: pb.filter("user = {:userId} && is_default = true", { userId: user.userId }),
        });
        for (const record of existingDefaults) {
          await pb.collection("chart_layouts").update(record.id, { is_default: false });
        }
      } catch (err) {
        console.warn("Error unsetting default layouts:", err);
      }
    }

    const created = await pb.collection("chart_layouts").create({
      user: user.userId,
      name,
      symbol,
      resolution,
      content,
      is_default: Boolean(isDefault),
    });

    return NextResponse.json(
      {
        id: created.id,
        userId: user.userId,
        name: created.name,
        symbol: created.symbol,
        resolution: created.resolution,
        content: created.content,
        isDefault: Boolean(created.is_default),
        updatedAt: created.updated,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save layout" },
      { status: 500 }
    );
  }
}
