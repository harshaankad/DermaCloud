import { NextRequest, NextResponse } from "next/server";
import { verifyOTP } from "@/lib/auth/otp";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Validation schema
const verifyOTPSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 OTP attempts per 15 minutes per IP (prevents brute force)
    const ip = getClientIp(request);
    const rl = rateLimit(`otp:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many verification attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validationResult = verifyOTPSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Validation failed",
          errors: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { email, otp } = validationResult.data;

    // Verify OTP (connectDB is called inside verifyOTP)
    const isValid = await verifyOTP(email, otp);
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired OTP",
        },
        { status: 400 }
      );
    }

    // OTP verified — no user created yet, that happens after payment
    return NextResponse.json(
      {
        success: true,
        message: "Email verified successfully!",
        data: {
          email,
          emailVerified: true,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("OTP verification error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
