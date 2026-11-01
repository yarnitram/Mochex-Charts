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
    let existing;
    try {
      existing = await pb.collection("indicators").getOne(id);
    } catch {
      return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
    }

    if (existing.user !== user.userId && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Not owner or admin" },
        { status: 403 }
      );
    }

    const { name, description, scriptCode, inputsSchema, isGlobal } =
      await request.json();

    if (
      isGlobal !== undefined &&
      isGlobal !== existing.is_global &&
      !canPublishGlobalIndicator(user.role)
    ) {
      return NextResponse.json(
        { error: "Forbidden: Only ADMIN can change global status" },
        { status: 403 }
      );
    }

    const updateData: Record<string, any> = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (scriptCode) updateData.script_code = scriptCode;
    if (inputsSchema) updateData.inputs_schema = inputsSchema;
    if (isGlobal !== undefined) updateData.is_global = Boolean(isGlobal);

    const updated = await pb.collection("indicators").update(id, updateData);

    return NextResponse.json({
      id: updated.id,
      userId: updated.user,
      name: updated.name,
      description: updated.description,
      scriptCode: updated.script_code,
      inputsSchema: updated.inputs_schema,
      isGlobal: Boolean(updated.is_global),
      createdAt: updated.created,
      updatedAt: updated.updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update indicator" },
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
    let existing;
    try {
      existing = await pb.collection("indicators").getOne(id);
    } catch {
      return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
    }

    if (existing.user !== user.userId && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Not owner or admin" },
        { status: 403 }
      );
    }

    await pb.collection("indicators").delete(id);
    return NextResponse.json({ success: true, message: "Indicator deleted" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete indicator" },
      { status: 500 }
    );
  }
}
