import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import Patient from "@/models/Patient";

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    // Verify user is Tier 2
    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        {
          success: false,
          message: "This endpoint is only for Tier 2 users",
        },
        { status: 403 }
      );
    }

    // Get clinic ID
    const clinicId = authUser.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        {
          success: false,
          message: "Clinic not found for this user",
        },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      name,
      age,
      gender,
      phone,
      email,
      address,
      medicalHistory,
      allergies,
    } = body;

    // Validate required fields
    if (!name || !age || !gender || !phone) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: name, age, gender, phone",
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Auto-generate Patient ID
    // Format: P{clinic-specific-number} e.g., P001, P002, etc.
    const patientCount = await Patient.countDocuments({ clinicId: clinicId });
    const patientId = `P${String(patientCount + 1).padStart(4, "0")}`;

    // Check if phone number already exists in this clinic
    const existingPhone = await Patient.findOne({
      clinicId: clinicId,
      phone: phone,
    });

    if (existingPhone) {
      return NextResponse.json(
        {
          success: false,
          message: "Phone number already registered in this clinic",
        },
        { status: 409 }
      );
    }

    // Create new patient
    const patient = await Patient.create({
      clinicId: clinicId,
      patientId,
      name,
      age,
      gender,
      phone,
      email: email || undefined,
      address: address || undefined,
      medicalHistory: medicalHistory || undefined,
      allergies: allergies || [],
    });

    return NextResponse.json({
      success: true,
      message: "Patient added successfully",
      data: {
        patient: {
          _id: patient._id,
          patientId: patient.patientId,
          name: patient.name,
          age: patient.age,
          gender: patient.gender,
          phone: patient.phone,
          email: patient.email,
          createdAt: patient.createdAt,
        },
      },
    });
  } catch (error: any) {
    console.error("Add patient error:", error);

    // Handle mongoose validation errors
    if (error.name === "ValidationError") {
      return NextResponse.json(
        {
          success: false,
          message: "Validation error",
          error: error.message,
        },
        { status: 400 }
      );
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "Patient with this ID or phone already exists",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to add patient",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
