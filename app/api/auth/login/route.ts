import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import { generateToken, generateRefreshToken } from "@/lib/auth/jwt";
import { z } from "zod";
import User from "@/models/User";
import { sendAccountLockedEmail } from "@/lib/email/sender";
import { auditLog } from "@/lib/audit";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Validation schema
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const rl = rateLimit(`login:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many login attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = sanitize(await request.json());

    // Validate request body
    const validationResult = loginSchema.safeParse(body);
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

    const { email, password } = validationResult.data;

    // Connect to database
    await connectDB();

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        { success: false, message: `Account locked. Try again in ${minutesLeft} minute(s).` },
        { status: 423 }
      );
    }

    // Check if user is verified
    if (!user.isVerified) {
      return NextResponse.json(
        { success: false, message: "Please verify your email before logging in" },
        { status: 403 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Increment failed attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= MAX_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
        user.loginAttempts = 0;
        await user.save();
        // Send security alert email (non-blocking)
        sendAccountLockedEmail(user.email, user.lockedUntil, ip).catch(() => {});
        auditLog({ userId: user._id.toString(), userEmail: user.email, role: "doctor", action: "ACCOUNT_LOCKED", resourceType: "auth", ipAddress: ip, success: false }).catch(() => {});
        return NextResponse.json(
          { success: false, message: "Too many failed attempts. Account locked for 30 minutes. A security alert has been sent to your email." },
          { status: 423 }
        );
      }
      auditLog({ userId: user._id.toString(), userEmail: user.email, role: "doctor", action: "LOGIN_FAILED", resourceType: "auth", ipAddress: ip, success: false }).catch(() => {});
      await user.save();
      return NextResponse.json(
        { success: false, message: `Invalid email or password. ${MAX_ATTEMPTS - user.loginAttempts} attempt(s) remaining.` },
        { status: 401 }
      );
    }

    // Successful login — reset lockout counters
    user.loginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
    auditLog({ clinicId: user.clinicId?.toString(), userId: user._id.toString(), userEmail: user.email, role: "doctor", action: "LOGIN_SUCCESS", resourceType: "auth", ipAddress: ip }).catch(() => {});

    // Generate access + refresh tokens
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      tier: user.tier,
      clinicId: user.clinicId?.toString(),
    });
    const refreshToken = generateRefreshToken(user._id.toString(), user.email, user.refreshTokenVersion);

    return NextResponse.json(
      {
        success: true,
        message: "Login successful!",
        data: {
          token,
          refreshToken,
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            tier: user.tier,
            clinicId: user.clinicId?.toString(),
            phone: user.phone,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
