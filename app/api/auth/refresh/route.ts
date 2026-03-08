import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken, generateToken, generateRefreshToken, generateFrontdeskToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db/connection";
import User from "@/models/User";
import FrontdeskStaff from "@/models/FrontdeskStaff";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken, role } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, message: "Refresh token required" },
        { status: 401 }
      );
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired refresh token" },
        { status: 401 }
      );
    }

    await connectDB();

    // Frontdesk staff refresh
    if (role === "frontdesk") {
      const staff = await FrontdeskStaff.findById(payload.userId);
      if (!staff || staff.status !== "active") {
        return NextResponse.json(
          { success: false, message: "Account not found or deactivated" },
          { status: 401 }
        );
      }

      // Version check — if token version doesn't match, it was already rotated (replay attack)
      if ((payload.version ?? 0) !== staff.refreshTokenVersion) {
        return NextResponse.json(
          { success: false, message: "Refresh token already used. Please log in again." },
          { status: 401 }
        );
      }

      // Rotate: increment version
      staff.refreshTokenVersion += 1;
      await staff.save();

      const newToken = generateFrontdeskAccessToken(staff);
      const newRefreshToken = generateRefreshToken(staff._id.toString(), staff.email, staff.refreshTokenVersion);

      return NextResponse.json({
        success: true,
        data: { token: newToken, refreshToken: newRefreshToken },
      });
    }

    // Doctor refresh (default)
    const user = await User.findById(payload.userId);
    if (!user || !user.isVerified) {
      return NextResponse.json(
        { success: false, message: "User not found or not verified" },
        { status: 401 }
      );
    }

    // Version check
    if ((payload.version ?? 0) !== user.refreshTokenVersion) {
      return NextResponse.json(
        { success: false, message: "Refresh token already used. Please log in again." },
        { status: 401 }
      );
    }

    // Rotate: increment version
    user.refreshTokenVersion += 1;
    await user.save();

    const newToken = generateToken({
      userId: user._id.toString(),
      email: user.email,
      tier: user.tier,
      clinicId: user.clinicId?.toString(),
    });
    const newRefreshToken = generateRefreshToken(user._id.toString(), user.email, user.refreshTokenVersion);

    return NextResponse.json({
      success: true,
      data: { token: newToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

function generateFrontdeskAccessToken(staff: any): string {
  return generateFrontdeskToken({
    staffId: staff._id.toString(),
    email: staff.email,
    role: "frontdesk",
    clinicId: staff.clinicId.toString(),
    doctorId: staff.doctorId.toString(),
  });
}
