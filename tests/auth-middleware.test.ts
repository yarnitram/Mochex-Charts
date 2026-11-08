import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { signToken, UserPayload } from "@/lib/auth/jwt";

describe("Route Protection & Auth Middleware (DEC-131 & DEC-133)", () => {
  const mockTrader: UserPayload = {
    userId: "user-123-abc",
    username: "institutional_trader",
    email: "trader@mochex.io",
    role: "TRADER",
  };

  it("should allow public access to the Landing Page ('/') without authentication", async () => {
    const req = new NextRequest("http://localhost:3000/");
    const res = await middleware(req);
    expect(res.status).toBe(200);
    // Should NOT redirect
    expect(res.headers.get("location")).toBeNull();
  });

  it("should allow unauthenticated access to '/login'", async () => {
    const req = new NextRequest("http://localhost:3000/login");
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("should redirect unauthenticated users trying to visit '/chart' to '/login?callbackUrl=/chart'", async () => {
    const req = new NextRequest("http://localhost:3000/chart");
    const res = await middleware(req);
    expect(res.status).toBe(307); // NextResponse.redirect default is 307
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("callbackUrl=%2Fchart");
  });

  it("should allow authenticated users with a valid mochex_token to visit '/chart'", async () => {
    const token = await signToken(mockTrader);
    const req = new NextRequest("http://localhost:3000/chart", {
      headers: {
        cookie: `mochex_token=${token}`,
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("should redirect authenticated users who visit '/login' directly to '/chart'", async () => {
    const token = await signToken(mockTrader);
    const req = new NextRequest("http://localhost:3000/login", {
      headers: {
        cookie: `mochex_token=${token}`,
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("http://localhost:3000/chart");
  });

  it("should honor custom callbackUrl when authenticated user visits '/login'", async () => {
    const token = await signToken(mockTrader);
    const req = new NextRequest("http://localhost:3000/login?callbackUrl=%2Fchart%3Fsymbol%3DETHUSDT", {
      headers: {
        cookie: `mochex_token=${token}`,
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/chart?symbol=ETHUSDT");
  });

  it("should sanitize callbackUrl when pointing to /login to prevent infinite redirect loops", async () => {
    const token = await signToken(mockTrader);
    const req = new NextRequest("http://localhost:3000/login?callbackUrl=%2Flogin", {
      headers: {
        cookie: `mochex_token=${token}`,
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    // Must redirect to /chart, NEVER to /login
    expect(location).toBe("http://localhost:3000/chart");
  });

  it("should reject tampered or invalid mochex_token on '/chart' and redirect to '/login'", async () => {
    const req = new NextRequest("http://localhost:3000/chart", {
      headers: {
        cookie: "mochex_token=invalid.tampered.token",
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
  });

  it("should block unauthenticated access to protected data APIs and return 401 JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/layouts");
    const res = await middleware(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should bypass Next.js static asset requests", async () => {
    const reqStatic = new NextRequest("http://localhost:3000/_next/static/chunks/main.js");
    const resStatic = await middleware(reqStatic);
    expect(resStatic.status).toBe(200);

    const reqFavicon = new NextRequest("http://localhost:3000/favicon.ico");
    const resFavicon = await middleware(reqFavicon);
    expect(resFavicon.status).toBe(200);
  });
});
