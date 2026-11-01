import { NextRequest, NextResponse } from "next/server";
import { getPocketBase } from "@/lib/db/pocketbase";
import { signToken, type Role } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    const { usernameOrEmail, password } = await request.json();

    if (!usernameOrEmail || !password) {
      return NextResponse.json(
        { error: "Username/email and password are required" },
        { status: 400 }
      );
    }

    const pb = getPocketBase();

    let authData;
    try {
      authData = await pb.collection("users").authWithPassword(usernameOrEmail, password);
    } catch (pbErr: any) {
      return NextResponse.json(
        { error: pbErr?.message || "Invalid credentials" },
        { status: 401 }
      );
    }

    const userRecord = authData.record;
    const role: Role = (userRecord.role as Role) || "TRADER";

    const token = await signToken({
      userId: userRecord.id,
      username: userRecord.username,
      email: userRecord.email,
      role,
      pbToken: authData.token,
    });

    const response = NextResponse.json({
      user: {
        id: userRecord.id,
        username: userRecord.username,
        email: userRecord.email,
        role,
      },
    });

    response.cookies.set({
      name: "mochex_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to log in" },
      { status: 500 }
    );
  }
}
