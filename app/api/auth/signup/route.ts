import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { generateOTP, storeOTP } from "@/lib/auth/otp";
import { sendOTPEmail } from "@/lib/email/sender";
import { z } from "zod";

// Validation schema
const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  tier: z.enum(["tier1", "tier2"], { required_error: "Tier is required" }),
  phone: z.string().optional(),
  clinicName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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

    const { email, password, name, tier, phone, clinicName } = validationResult.data;

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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user (but not verified yet)
    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      tier,
      phone,
      isVerified: false,
    });

    // Generate and store OTP
    const otp = generateOTP();
    await storeOTP(email, otp);

    // Send OTP email
    try {
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error("Failed to send OTP email:", emailError);
      // Rollback user creation if email fails
      await User.deleteOne({ _id: user._id });
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
        message: "Signup successful! Please check your email for OTP verification.",
        data: {
          userId: user._id,
          email: user.email,
        },
      },
      { status: 201 }
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
