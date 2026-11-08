import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "mochex-super-secret-jwt-key-2026-production-min32chars"
);

// Define route matching criteria
const PUBLIC_FILE_PATTERN = /\.(?:ico|png|jpg|jpeg|svg|gif|webp|css|js|woff|woff2|ttf|eot)$/i;

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return Boolean(payload && payload.userId);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Bypass static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE_PATTERN.test(pathname)
  ) {
    return NextResponse.next();
  }

  const authenticated = await isAuthenticated(request);

  // 2. Public Landing Page at "/"
  if (pathname === "/") {
    return NextResponse.next();
  }

  // 3. Login / Register Page at "/login"
  if (pathname === "/login") {
    if (authenticated) {
      // If already logged in, redirect to workstation
      const callbackUrl = request.nextUrl.searchParams.get("callbackUrl") || "/chart";
      return NextResponse.redirect(new URL(callbackUrl, request.url));
    }
    return NextResponse.next();
  }

  // 4. Protected Workstation Terminal ("/chart" and all other application routes)
  if (!authenticated) {
    // If it's an API route (other than /api/auth/* which was bypassed above), return 401
    // Note: Allow public market data read routes like /api/mexc/* if needed, or protect everything else
    if (pathname.startsWith("/api/")) {
      // Allow public MEXC read-only price feeds if necessary, or keep strict
      if (pathname.startsWith("/api/mexc")) {
        return NextResponse.next();
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // For any page other than "/" and "/login", redirect to "/login"
    const loginUrl = new URL("/login", request.url);
    const callbackTarget = pathname + search;
    loginUrl.searchParams.set("callbackUrl", callbackTarget);

    const response = NextResponse.redirect(loginUrl);
    // If an invalid token cookie exists, clear it
    if (request.cookies.has("mochex_token")) {
      response.cookies.delete("mochex_token");
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
