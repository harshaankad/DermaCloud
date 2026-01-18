import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import User from "@/models/User";

/**
 * GET /api/auth/me
 * Get current logged-in user's information
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await authMiddleware(request);

    // If authResult is NextResponse, authentication failed
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: jwtUser } = authResult;

    // Connect to database
    await connectDB();

    // Fetch user details from database
    const user = await User.findById(jwtUser.userId).select("-password");

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            tier: user.tier,
            phone: user.phone,
            clinicId: user.clinicId,
            isVerified: user.isVerified,
            createdAt: user.createdAt,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
