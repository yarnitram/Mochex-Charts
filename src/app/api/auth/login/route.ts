import { NextRequest, NextResponse } from "next/server";
import { getPocketBase } from "@/lib/db/pocketbase";
import { signToken, type Role } from "@/lib/auth/jwt";
import { findLocalUser, verifyPassword } from "@/lib/auth/local-store";

export async function POST(request: NextRequest) {
  try {
    const { usernameOrEmail, password } = await request.json();

    if (!usernameOrEmail || !password) {
      return NextResponse.json(
        { error: "Username/email and password are required" },
        { status: 400 }
      );
    }

    let userId = "";
    let username = "";
    let email = "";
    let role: Role = "TRADER";
    let pbToken: string | undefined = undefined;

    // 1. Attempt PocketBase authentication if reachable
    let pbAuthenticated = false;
    try {
      const pb = getPocketBase();
      const authData = await pb.collection("users").authWithPassword(usernameOrEmail, password);
      if (authData && authData.record) {
        userId = authData.record.id;
        username = authData.record.username;
        email = authData.record.email;
        role = (authData.record.role as Role) || "TRADER";
        pbToken = authData.token;
        pbAuthenticated = true;
      }
    } catch (_pbErr: any) {
      pbAuthenticated = false;
    }

    // 2. If PocketBase is not reachable or user was not authenticated via PB, check local store
    if (!pbAuthenticated) {
      const localUser = findLocalUser(usernameOrEmail);
      if (localUser && verifyPassword(password, localUser.passwordHash)) {
        userId = localUser.id;
        username = localUser.username;
        email = localUser.email;
        role = localUser.role;
      } else {
        return NextResponse.json(
          { error: "Invalid username, email, or password" },
          { status: 401 }
        );
      }
    }

    const token = await signToken({
      userId,
      username,
      email,
      role,
      pbToken,
    });

    const response = NextResponse.json({
      user: {
        id: userId,
        userId,
        username,
        email,
        role,
      },
    });

    const isHttps =
      request.nextUrl.protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https";

    response.cookies.set({
      name: "mochex_token",
      value: token,
      httpOnly: true,
      secure: isHttps,
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
