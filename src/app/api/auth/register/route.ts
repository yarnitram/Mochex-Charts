import { NextRequest, NextResponse } from "next/server";
import { getPocketBase } from "@/lib/db/pocketbase";
import { signToken, type Role } from "@/lib/auth/jwt";
import { createLocalUser } from "@/lib/auth/local-store";

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: "Username, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    let userId = "";
    let finalUsername = username.trim();
    let finalEmail = email.trim();
    let role: Role = "TRADER";
    let pbToken: string | undefined = undefined;

    // 1. Attempt PocketBase registration if available
    let pbSucceeded = false;
    try {
      const pb = getPocketBase();
      const createdUser = await pb.collection("users").create({
        username: finalUsername,
        email: finalEmail,
        password,
        passwordConfirm: password,
        role: "TRADER",
      });

      const authData = await pb.collection("users").authWithPassword(finalEmail, password);
      userId = createdUser.id;
      finalUsername = createdUser.username;
      finalEmail = createdUser.email;
      role = (createdUser.role as Role) || "TRADER";
      pbToken = authData.token;
      pbSucceeded = true;
    } catch (pbErr: any) {
      const isDuplicate =
        pbErr?.status === 400 &&
        (JSON.stringify(pbErr?.response?.data || "").includes("validation_not_unique") ||
          pbErr?.message?.includes("Failed to create record"));

      if (isDuplicate) {
        return NextResponse.json(
          { error: "Username or email is already taken" },
          { status: 409 }
        );
      }
      // If error is not a duplicate (e.g. connection refused/offline), fall back to local store
      pbSucceeded = false;
    }

    // 2. If PocketBase was offline, register in local store
    if (!pbSucceeded) {
      const localResult = createLocalUser(finalUsername, finalEmail, password, "TRADER");
      if (localResult.error || !localResult.user) {
        return NextResponse.json(
          { error: localResult.error || "Failed to create account" },
          { status: 409 }
        );
      }
      userId = localResult.user.id;
      finalUsername = localResult.user.username;
      finalEmail = localResult.user.email;
      role = localResult.user.role;
    }

    const token = await signToken({
      userId,
      username: finalUsername,
      email: finalEmail,
      role,
      pbToken,
    });

    const response = NextResponse.json({
      user: {
        id: userId,
        userId,
        username: finalUsername,
        email: finalEmail,
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
      { error: error?.message || "Failed to register" },
      { status: 500 }
    );
  }
}
