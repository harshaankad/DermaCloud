import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db/connection";
import User from "@/models/User";
import { sendPasswordResetEmail } from "@/lib/email/sender";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 reset requests per hour per IP
    const ip = getClientIp(request);
    const rl = rateLimit(`forgot-pwd:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, message: "Email is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always respond with success to prevent email enumeration
    if (!user) {
      return NextResponse.json({
        success: true,
        message: "If an account with that email exists, a reset link has been sent.",
      });
    }

    if (user.authProvider === "google") {
      return NextResponse.json({
        success: false,
        isGoogleAccount: true,
        message: "This account uses Google Sign-In. Please log in with Google instead.",
      });
    }

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    // Store hashed version in DB
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    await sendPasswordResetEmail(user.email, user.name, resetUrl);

    return NextResponse.json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent.",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
