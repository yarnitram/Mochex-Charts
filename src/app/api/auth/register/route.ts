import { NextRequest, NextResponse } from "next/server";
import { getPocketBase } from "@/lib/db/pocketbase";
import { signToken, type Role } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: "Username, email, and password are required" },
        { status: 400 }
      );
    }

    const pb = getPocketBase();

    let createdUser;
    try {
      createdUser = await pb.collection("users").create({
        username,
        email,
        password,
        passwordConfirm: password,
        role: "TRADER",
      });
    } catch (pbErr: any) {
      const isDuplicate =
        pbErr?.status === 400 &&
        (JSON.stringify(pbErr?.response?.data || "").includes("validation_not_unique") ||
          pbErr?.message?.includes("Failed to create record"));

      return NextResponse.json(
        {
          error: isDuplicate
            ? "Username or email is already taken"
            : pbErr?.message || "Failed to create user",
        },
        { status: isDuplicate ? 409 : pbErr?.status || 400 }
      );
    }

    // Authenticate the newly created user to obtain auth token
    const authData = await pb.collection("users").authWithPassword(email, password);
    const role: Role = (createdUser.role as Role) || "TRADER";

    const token = await signToken({
      userId: createdUser.id,
      username: createdUser.username,
      email: createdUser.email,
      role,
      pbToken: authData.token,
    });

    const response = NextResponse.json({
      user: {
        id: createdUser.id,
        username: createdUser.username,
        email: createdUser.email,
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
      { error: error?.message || "Failed to register" },
      { status: 500 }
    );
  }
}
