import { NextRequest } from "next/server";
import { verifyToken, UserPayload } from "./jwt";

/**
 * Resolves the authenticated trader identity from cookies, bearer token,
 * dev override header, or falls back to "default-trader" for local workspace usage.
 */
export async function getRequestUser(request: NextRequest): Promise<UserPayload> {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload && payload.userId) return payload;
    } catch {
      // Ignore expired/invalid tokens and fall through to default trader
    }
  }

  const devUserId = request.headers.get("X-User-Id");
  if (devUserId) {
    return {
      userId: devUserId,
      username: devUserId,
      email: `${devUserId}@local`,
      role: "TRADER",
    };
  }

  return {
    userId: "default-trader",
    username: "Trader",
    email: "trader@mochex.local",
    role: "TRADER",
  };
}
