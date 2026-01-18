import { NextRequest, NextResponse } from "next/server";
import { verifyToken, extractTokenFromHeader, JWTPayload } from "./jwt";

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

/**
 * Middleware to verify JWT token and attach user data to request
 */
export async function authMiddleware(
  request: NextRequest
): Promise<{ user: JWTPayload } | NextResponse> {
  try {
    // Get authorization header
    const authHeader = request.headers.get("authorization");

    // Extract token
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return NextResponse.json(
        {
          success: false,
          message: "No authentication token provided",
        },
        { status: 401 }
      );
    }

    // Verify token
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired token",
        },
        { status: 401 }
      );
    }

    // Return user data
    return { user };
  } catch (error) {
    console.error("Auth middleware error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Authentication failed",
      },
      { status: 401 }
    );
  }
}

/**
 * Middleware to check if user has specific tier
 */
export async function requireTier(
  request: NextRequest,
  requiredTier: "tier1" | "tier2"
): Promise<{ user: JWTPayload } | NextResponse> {
  const authResult = await authMiddleware(request);

  // If authResult is NextResponse, it means authentication failed
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { user } = authResult;

  // Check tier
  if (user.tier !== requiredTier) {
    return NextResponse.json(
      {
        success: false,
        message: `This endpoint requires ${requiredTier} access`,
      },
      { status: 403 }
    );
  }

  return { user };
}

/**
 * Middleware to check if user belongs to tier2 (clinic)
 */
export async function requireClinic(
  request: NextRequest
): Promise<{ user: JWTPayload } | NextResponse> {
  const authResult = await authMiddleware(request);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { user } = authResult;

  if (user.tier !== "tier2" || !user.clinicId) {
    return NextResponse.json(
      {
        success: false,
        message: "This endpoint requires clinic access",
      },
      { status: 403 }
    );
  }

  return { user };
}
