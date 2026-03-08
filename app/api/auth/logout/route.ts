import { NextRequest, NextResponse } from "next/server";
import { verifyToken, verifyFrontdeskToken, extractTokenFromHeader } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db/connection";
import TokenBlacklist from "@/models/TokenBlacklist";
import User from "@/models/User";
import FrontdeskStaff from "@/models/FrontdeskStaff";

export async function POST(request: NextRequest) {
  try {
    const token = extractTokenFromHeader(request.headers.get("Authorization"));

    if (!token) {
      return NextResponse.json(
        { success: false, message: "No token provided" },
        { status: 400 }
      );
    }

    await connectDB();

    // Try to decode as doctor token
    const doctorPayload = verifyToken(token);
    if (doctorPayload?.jti) {
      // Blacklist the access token JTI (expires when the token would have expired)
      const expiresAt = new Date((doctorPayload as any).exp * 1000);
      await TokenBlacklist.findOneAndUpdate(
        { jti: doctorPayload.jti },
        { jti: doctorPayload.jti, expiresAt },
        { upsert: true }
      );

      // Increment refreshTokenVersion to invalidate any outstanding refresh tokens
      await User.findByIdAndUpdate(doctorPayload.userId, {
        $inc: { refreshTokenVersion: 1 },
      });

      return NextResponse.json({ success: true, message: "Logged out successfully" });
    }

    // Try as frontdesk token
    const frontdeskPayload = verifyFrontdeskToken(token);
    if (frontdeskPayload?.jti) {
      const expiresAt = new Date((frontdeskPayload as any).exp * 1000);
      await TokenBlacklist.findOneAndUpdate(
        { jti: frontdeskPayload.jti },
        { jti: frontdeskPayload.jti, expiresAt },
        { upsert: true }
      );

      await FrontdeskStaff.findByIdAndUpdate(frontdeskPayload.staffId, {
        $inc: { refreshTokenVersion: 1 },
      });

      return NextResponse.json({ success: true, message: "Logged out successfully" });
    }

    // Token invalid or already expired — still treat as successful logout
    return NextResponse.json({ success: true, message: "Logged out" });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
