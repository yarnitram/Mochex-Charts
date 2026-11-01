import PocketBase from "pocketbase";
import type { Role } from "@/lib/auth/jwt";

export const POCKETBASE_URL =
  process.env.POCKETBASE_URL ||
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  "http://127.0.0.1:8090";

/**
 * Returns a new PocketBase instance.
 * If a user token is provided, loads it into the authStore so that
 * all queries run in the context of that authenticated user.
 */
export function getPocketBase(userToken?: string): PocketBase {
  const pb = new PocketBase(POCKETBASE_URL);
  // Disable auto cancellation to allow concurrent server-side requests
  pb.autoCancellation(false);

  if (userToken) {
    pb.authStore.save(userToken, null);
  }

  return pb;
}

export interface PocketBaseUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  created?: string;
  updated?: string;
}

export interface PocketBaseLayout {
  id: string;
  user: string;
  name: string;
  symbol: string;
  resolution: string;
  content: any;
  is_default: boolean;
  created?: string;
  updated?: string;
}

export interface PocketBaseIndicator {
  id: string;
  user: string;
  name: string;
  description?: string;
  script_code: string;
  inputs_schema?: any;
  is_global: boolean;
  created?: string;
  updated?: string;
}

export interface PocketBaseWatchlist {
  id: string;
  user: string;
  name: string;
  symbols: string[];
  is_default: boolean;
  created?: string;
  updated?: string;
}
