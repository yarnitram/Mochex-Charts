import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Role } from "@/lib/auth/jwt";

export interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureDirectory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create .data directory:", err);
  }
}

export function hashPassword(password: string): string {
  const salt = "mochex_salt_2026";
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  const testHash = hashPassword(password);
  return testHash === hash;
}

export function getLocalUsers(): StoredUser[] {
  ensureDirectory();
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Failed to read local users file:", err);
  }
  return [];
}

export function saveLocalUsers(users: StoredUser[]): void {
  ensureDirectory();
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to save local users file:", err);
  }
}

export function findLocalUser(usernameOrEmail: string): StoredUser | null {
  const users = getLocalUsers();
  const lower = usernameOrEmail.toLowerCase().trim();
  const found = users.find(
    (u) => u.username.toLowerCase() === lower || u.email.toLowerCase() === lower
  );
  if (found) return found;

  // Default initial demo user if empty
  if (lower === "trader" || lower === "trader@mochex.io") {
    return {
      id: "trader-default-local-id",
      username: "trader",
      email: "trader@mochex.io",
      passwordHash: hashPassword("password123"),
      role: "TRADER",
      createdAt: new Date().toISOString(),
    };
  }
  if (lower === "admin" || lower === "admin@mochex.io") {
    return {
      id: "admin-default-local-id",
      username: "admin",
      email: "admin@mochex.io",
      passwordHash: hashPassword("admin123"),
      role: "ADMIN",
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}

export function createLocalUser(
  username: string,
  email: string,
  password: string,
  role: Role = "TRADER"
): { user?: StoredUser; error?: string } {
  const users = getLocalUsers();
  const lowerUser = username.toLowerCase().trim();
  const lowerEmail = email.toLowerCase().trim();

  const exists = users.some(
    (u) => u.username.toLowerCase() === lowerUser || u.email.toLowerCase() === lowerEmail
  );

  if (exists) {
    return { error: "Username or email is already taken" };
  }

  const newUser: StoredUser = {
    id: `local-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    username: username.trim(),
    email: email.trim(),
    passwordHash: hashPassword(password),
    role,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveLocalUsers(users);
  return { user: newUser };
}
