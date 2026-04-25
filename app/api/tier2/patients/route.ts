import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Patient from "@/models/Patient";
import { auditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    // Authenticate user (supports both doctor and frontdesk)
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status || 401 }
      );
    }

    // Check patients permission for frontdesk
    if (auth.role === "frontdesk" && !hasPermission(auth, "patients")) {
      return NextResponse.json(
        { success: false, message: "No permission to add patients" },
        { status: 403 }
      );
    }

    const clinicId = auth.clinicId;

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

    auditLog({ clinicId: auth.clinicId, userId: auth.userId!, userEmail: auth.email!, role: auth.role as "doctor" | "frontdesk", action: "PATIENT_CREATE", resourceType: "patient", resourceId: patient._id.toString(), details: { patientName: patient.name } }).catch(() => {});

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
          message: "Patient with this ID already exists",
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
