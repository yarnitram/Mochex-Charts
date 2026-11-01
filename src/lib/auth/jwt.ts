import { SignJWT, jwtVerify } from "jose";

export type Role = "TRADER" | "ADMIN";

export interface UserPayload {
  userId: string;
  username: string;
  email: string;
  role: Role;
  pbToken?: string;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "mochex-super-secret-jwt-key-2026-production-min32chars"
);

export async function signToken(payload: UserPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      email: payload.email as string,
      role: payload.role as Role,
      pbToken: (payload.pbToken as string) || undefined,
    };
  } catch (_err) {
    return null;
  }
}

// RBAC Permissions Specification Helper Functions
export function canPublishGlobalIndicator(role: Role): boolean {
  return role === "ADMIN";
}

export function canDeleteAnyLayout(role: Role): boolean {
  return role === "ADMIN";
}

export function canManagePersonalLayout(userId: string, ownerId: string, role: Role): boolean {
  return userId === ownerId || role === "ADMIN";
}

export function canManagePersonalWatchlist(userId: string, ownerId: string): boolean {
  return userId === ownerId;
}
