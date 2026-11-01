import { NextRequest, NextResponse } from "next/server";
import { getPocketBase } from "@/lib/db/pocketbase";
import { canPublishGlobalIndicator, verifyToken } from "@/lib/auth/jwt";

async function getAuthUser(request: NextRequest) {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);

  try {
    const pb = getPocketBase(user?.pbToken);
    let filter = "is_global = true";
    if (user) {
      filter = pb.filter("is_global = true || user = {:userId}", { userId: user.userId });
    }

    const records = await pb.collection("indicators").getFullList({
      filter,
      sort: "-created",
    });

    const indicators = records.map((r) => ({
      id: r.id,
      userId: r.user,
      name: r.name,
      description: r.description || null,
      scriptCode: r.script_code,
      inputsSchema: r.inputs_schema || {},
      isGlobal: Boolean(r.is_global),
      createdAt: r.created,
      updatedAt: r.updated,
    }));

    return NextResponse.json(indicators);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch indicators" },
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
    const { name, description, scriptCode, inputsSchema, isGlobal = false } =
      await request.json();

    if (!name || !scriptCode) {
      return NextResponse.json(
        { error: "Name and scriptCode are required" },
        { status: 400 }
      );
    }

    if (isGlobal && !canPublishGlobalIndicator(user.role)) {
      return NextResponse.json(
        { error: "Forbidden: Only ADMIN role can publish global indicators" },
        { status: 403 }
      );
    }

    const pb = getPocketBase(user.pbToken);
    const created = await pb.collection("indicators").create({
      user: user.userId,
      name,
      description: description || null,
      script_code: scriptCode,
      inputs_schema: inputsSchema || {},
      is_global: Boolean(isGlobal),
    });

    return NextResponse.json(
      {
        id: created.id,
        userId: created.user,
        name: created.name,
        description: created.description,
        scriptCode: created.script_code,
        inputsSchema: created.inputs_schema,
        isGlobal: Boolean(created.is_global),
        createdAt: created.created,
        updatedAt: created.updated,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create indicator" },
      { status: 500 }
    );
  }
}
