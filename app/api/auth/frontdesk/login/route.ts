import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { generateFrontdeskToken, generateRefreshToken } from "@/lib/auth/jwt";
import { z } from "zod";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import "@/models/Clinic"; // Ensure Clinic model is registered for populate
import "@/models/User"; // Ensure User model is registered for populate
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
    const rl = rateLimit(`fdlogin:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many login attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

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

    // Find frontdesk staff by email
    const staff = await FrontdeskStaff.findOne({ email })
      .populate("clinicId", "clinicName")
      .populate("doctorId", "name email");

    if (!staff) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (staff.lockedUntil && staff.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((staff.lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        { success: false, message: `Account locked. Try again in ${minutesLeft} minute(s).` },
        { status: 423 }
      );
    }

    // Check if staff account is active
    if (staff.status !== "active") {
      return NextResponse.json(
        { success: false, message: "Your account has been deactivated. Please contact the doctor." },
        { status: 403 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, staff.password);
    if (!isPasswordValid) {
      staff.loginAttempts = (staff.loginAttempts || 0) + 1;
      if (staff.loginAttempts >= MAX_ATTEMPTS) {
        staff.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
        staff.loginAttempts = 0;
        await staff.save();
        sendAccountLockedEmail(staff.email, staff.lockedUntil, ip).catch(() => {});
        auditLog({ userId: staff._id.toString(), userEmail: staff.email, role: "frontdesk", action: "ACCOUNT_LOCKED", resourceType: "auth", ipAddress: ip, success: false }).catch(() => {});
        return NextResponse.json(
          { success: false, message: "Too many failed attempts. Account locked for 30 minutes. A security alert has been sent to your email." },
          { status: 423 }
        );
      }
      auditLog({ userId: staff._id.toString(), userEmail: staff.email, role: "frontdesk", action: "LOGIN_FAILED", resourceType: "auth", ipAddress: ip, success: false }).catch(() => {});
      await staff.save();
      return NextResponse.json(
        { success: false, message: `Invalid email or password. ${MAX_ATTEMPTS - staff.loginAttempts} attempt(s) remaining.` },
        { status: 401 }
      );
    }

    // Successful login — reset lockout counters
    staff.loginAttempts = 0;
    staff.lockedUntil = undefined;
    staff.lastLogin = new Date();
    await staff.save();

    // These were populated at query time
    const clinic = staff.clinicId as any;
    const doctor = staff.doctorId as any;

    auditLog({ clinicId: clinic._id.toString(), userId: staff._id.toString(), userEmail: staff.email, role: "frontdesk", action: "LOGIN_SUCCESS", resourceType: "auth", ipAddress: ip }).catch(() => {});

    const token = generateFrontdeskToken({
      staffId: staff._id.toString(),
      email: staff.email,
      role: "frontdesk",
      clinicId: clinic._id.toString(),
      doctorId: doctor._id.toString(),
    });
    const refreshToken = generateRefreshToken(staff._id.toString(), staff.email, staff.refreshTokenVersion);

    return NextResponse.json(
      {
        success: true,
        message: "Login successful!",
        data: {
          token,
          refreshToken,
          staff: {
            id: staff._id,
            staffId: staff.staffId,
            email: staff.email,
            name: staff.name,
            phone: staff.phone,
            role: "frontdesk",
            clinicId: clinic._id,
            clinicName: clinic.clinicName,
            doctorId: doctor._id,
            doctorName: doctor.name,
            permissions: staff.permissions,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Frontdesk login error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
