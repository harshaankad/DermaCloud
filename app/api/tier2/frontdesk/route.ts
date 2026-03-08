import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyToken, extractTokenFromHeader } from "@/lib/auth/jwt";
import { z } from "zod";
import bcrypt from "bcryptjs";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import Clinic from "@/models/Clinic";

// Validation schema for creating frontdesk staff
const createStaffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().regex(/^[0-9]{10}$/, "Please enter a valid 10-digit phone number"),
  permissions: z.object({
    appointments: z.boolean().optional(),
    patients: z.boolean().optional(),
    pharmacy: z.boolean().optional(),
    sales: z.boolean().optional(),
    reports: z.boolean().optional(),
  }).optional(),
});

// GET - List all frontdesk staff for the doctor
export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromHeader(request.headers.get("Authorization"));
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Authorization token required" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload || payload.tier !== "tier2") {
      return NextResponse.json(
        { success: false, message: "Invalid or expired token" },
        { status: 401 }
      );
    }

    await connectDB();

    // Get clinic for the doctor
    const clinic = await Clinic.findOne({ doctorId: payload.userId });
    if (!clinic) {
      return NextResponse.json(
        { success: false, message: "Clinic not found" },
        { status: 404 }
      );
    }

    // Get all frontdesk staff for this clinic
    const staff = await FrontdeskStaff.find({ clinicId: clinic._id })
      .select("-password")
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error("Error fetching frontdesk staff:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new frontdesk staff
export async function POST(request: NextRequest) {
  try {
    const token = extractTokenFromHeader(request.headers.get("Authorization"));
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Authorization token required" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload || payload.tier !== "tier2") {
      return NextResponse.json(
        { success: false, message: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validationResult = createStaffSchema.safeParse(body);
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

    await connectDB();

    // Get clinic for the doctor
    const clinic = await Clinic.findOne({ doctorId: payload.userId });
    if (!clinic) {
      return NextResponse.json(
        { success: false, message: "Clinic not found. Please set up your clinic first." },
        { status: 404 }
      );
    }

    // Check if email already exists
    const existingStaff = await FrontdeskStaff.findOne({ email: validationResult.data.email });
    if (existingStaff) {
      return NextResponse.json(
        { success: false, message: "A staff member with this email already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validationResult.data.password, 10);

    // Create frontdesk staff
    const staff = new FrontdeskStaff({
      ...validationResult.data,
      password: hashedPassword,
      clinicId: clinic._id,
      doctorId: payload.userId,
      permissions: validationResult.data.permissions || {
        appointments: true,
        patients: true,
        pharmacy: true,
        sales: true,
        reports: false,
      },
    });

    await staff.save();

    // Return staff without password
    const staffResponse = staff.toObject();
    delete staffResponse.password;

    return NextResponse.json(
      {
        success: true,
        message: "Frontdesk staff created successfully",
        data: staffResponse,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating frontdesk staff:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
