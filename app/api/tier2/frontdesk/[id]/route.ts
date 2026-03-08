import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyToken, extractTokenFromHeader } from "@/lib/auth/jwt";
import { z } from "zod";
import bcrypt from "bcryptjs";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import Clinic from "@/models/Clinic";

// Validation schema for updating frontdesk staff
const updateStaffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  phone: z.string().regex(/^[0-9]{10}$/, "Please enter a valid 10-digit phone number").optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  status: z.enum(["active", "inactive"]).optional(),
  permissions: z.object({
    appointments: z.boolean().optional(),
    patients: z.boolean().optional(),
    pharmacy: z.boolean().optional(),
    sales: z.boolean().optional(),
    reports: z.boolean().optional(),
  }).optional(),
});

// GET - Get single frontdesk staff
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const staff = await FrontdeskStaff.findById(id)
      .select("-password")
      .populate("clinicId", "clinicName");

    if (!staff) {
      return NextResponse.json(
        { success: false, message: "Staff not found" },
        { status: 404 }
      );
    }

    // Verify the staff belongs to this doctor
    if (staff.doctorId.toString() !== payload.userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

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

// PUT - Update frontdesk staff
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
    const validationResult = updateStaffSchema.safeParse(body);
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

    const staff = await FrontdeskStaff.findById(id);

    if (!staff) {
      return NextResponse.json(
        { success: false, message: "Staff not found" },
        { status: 404 }
      );
    }

    // Verify the staff belongs to this doctor
    if (staff.doctorId.toString() !== payload.userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    // Update fields
    const updateData = { ...validationResult.data };

    // Hash password if provided
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    // Update permissions if provided
    if (updateData.permissions) {
      updateData.permissions = {
        ...staff.permissions,
        ...updateData.permissions,
      };
    }

    const updatedStaff = await FrontdeskStaff.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).select("-password");

    return NextResponse.json({
      success: true,
      message: "Staff updated successfully",
      data: updatedStaff,
    });
  } catch (error) {
    console.error("Error updating frontdesk staff:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Deactivate frontdesk staff (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const staff = await FrontdeskStaff.findById(id);

    if (!staff) {
      return NextResponse.json(
        { success: false, message: "Staff not found" },
        { status: 404 }
      );
    }

    // Verify the staff belongs to this doctor
    if (staff.doctorId.toString() !== payload.userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    // Soft delete - just deactivate
    staff.status = "inactive";
    await staff.save();

    return NextResponse.json({
      success: true,
      message: "Staff deactivated successfully",
    });
  } catch (error) {
    console.error("Error deactivating frontdesk staff:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
