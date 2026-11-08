import { describe, it, expect, beforeEach } from "vitest";
import {
  findLocalUser,
  createLocalUser,
  verifyPassword,
  hashPassword,
} from "@/lib/auth/local-store";

describe("Local Offline Auth Store Fallback (DEC-133)", () => {
  it("should find built-in demo trader credentials when offline", () => {
    const user = findLocalUser("trader");
    expect(user).not.toBeNull();
    expect(user?.username).toBe("trader");
    expect(user?.role).toBe("TRADER");
    expect(verifyPassword("password123", user!.passwordHash)).toBe(true);
    expect(verifyPassword("wrongpass", user!.passwordHash)).toBe(false);
  });

  it("should find built-in demo admin credentials when offline", () => {
    const user = findLocalUser("admin");
    expect(user).not.toBeNull();
    expect(user?.username).toBe("admin");
    expect(user?.role).toBe("ADMIN");
    expect(verifyPassword("admin123", user!.passwordHash)).toBe(true);
  });

  it("should create and retrieve new local users", () => {
    const uniqueName = `quant_${Date.now()}`;
    const uniqueEmail = `${uniqueName}@test.mochex.io`;

    const res = createLocalUser(uniqueName, uniqueEmail, "secretpass123", "TRADER");
    expect(res.user).toBeDefined();
    expect(res.user?.username).toBe(uniqueName);
    expect(res.user?.email).toBe(uniqueEmail);

    const found = findLocalUser(uniqueName);
    expect(found).not.toBeNull();
    expect(found?.username).toBe(uniqueName);
    expect(verifyPassword("secretpass123", found!.passwordHash)).toBe(true);
  });

  it("should prevent duplicate registration", () => {
    const uniqueName = `dup_${Date.now()}`;
    const uniqueEmail = `${uniqueName}@test.mochex.io`;

    const res1 = createLocalUser(uniqueName, uniqueEmail, "password123");
    expect(res1.user).toBeDefined();

    const res2 = createLocalUser(uniqueName, uniqueEmail, "password123");
    expect(res2.error).toContain("already taken");
  });
});
