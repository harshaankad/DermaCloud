import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://dermacloud.in",
  "https://www.dermacloud.in",
  ...(process.env.NEXT_PUBLIC_APP_URL
    ? [process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")]
    : []),
];

/**
 * Next.js Edge Middleware — runs before every request.
 * Handles CORS: only allows API calls from the app's own origin.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply CORS logic to API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin") ?? "";

  // Allow same-origin requests (no Origin header) and the configured origins
  const isAllowed =
    !origin || // server-to-server / same-origin
    ALLOWED_ORIGINS.includes(origin) ||
    // Allow localhost in development
    /^https?:\/\/localhost(:\d+)?$/.test(origin);

  // Handle preflight (OPTIONS) requests
  if (request.method === "OPTIONS") {
    if (!isAllowed) {
      return new NextResponse(null, { status: 403 });
    }
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // For actual requests: if Origin is present and not allowed → reject
  if (origin && !isAllowed) {
    return NextResponse.json(
      { success: false, message: "CORS: origin not allowed" },
      { status: 403 }
    );
  }

  const response = NextResponse.next();

  // Add CORS headers to the response for allowed origins
  if (origin && isAllowed) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
