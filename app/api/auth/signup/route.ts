import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import User from "@/models/User";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import { generateOTP, storeOTP } from "@/lib/auth/otp";
import { sendOTPEmail } from "@/lib/email/sender";
import { z } from "zod";

// Validation schema
const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  tier: z.enum(["tier2"], { required_error: "Tier is required" }),
  phone: z.string().optional(),
  clinicName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 signups per hour per IP
    const ip = getClientIp(request);
    const rl = rateLimit(`signup:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = sanitize(await request.json());

    // Validate request body
    const validationResult = signupSchema.safeParse(body);
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

    const { email, tier, clinicName } = validationResult.data;

    // Connect to database
    await connectDB();

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: "User with this email already exists",
        },
        { status: 409 }
      );
    }

    // For Tier 2, clinicName is required
    if (tier === "tier2" && !clinicName) {
      return NextResponse.json(
        {
          success: false,
          message: "Clinic name is required for Tier 2 users",
        },
        { status: 400 }
      );
    }

    // Generate and store OTP (no user created yet)
    const otp = generateOTP();
    await storeOTP(email, otp);

    // Send OTP email
    try {
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error("Failed to send OTP email:", emailError);
      return NextResponse.json(
        {
          success: false,
          message: "Failed to send verification email. Please try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "OTP sent! Please check your email for verification.",
        data: {
          email,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
