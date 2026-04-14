import { NextRequest, NextResponse } from "next/server";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { connectDB } from "@/lib/db/connection";
import Patient from "@/models/Patient";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import { z } from "zod";

const updatePatientSchema = z.object({
  allergies: z.array(z.string()).optional(),
  medicalHistory: z.string().optional(),
  age: z.number().min(0).max(150).optional(),
  address: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const patientId = id;

    await connectDB();

    // Fetch patient details
    const patient = await Patient.findById(patientId);

    if (!patient) {
      return NextResponse.json(
        {
          success: false,
          message: "Patient not found",
        },
        { status: 404 }
      );
    }

    // Verify patient belongs to the same clinic
    if (patient.clinicId.toString() !== auth.clinicId!.toString()) {
      return NextResponse.json(
        {
          success: false,
          message: "Access denied",
        },
        { status: 403 }
      );
    }

    // Fetch visit history (both dermatology and cosmetology)
    const [dermatologyVisits, cosmetologyVisits] = await Promise.all([
      ConsultationDermatology.find({ patientId: patientId })
        .select("consultationDate status diagnosis")
        .sort({ consultationDate: -1 }),
      ConsultationCosmetology.find({ patientId: patientId })
        .select("consultationDate status assessment procedure")
        .sort({ consultationDate: -1 }),
    ]);

    // Combine and format visits
    const visits = [
      ...dermatologyVisits.map((v) => ({
        _id: v._id,
        visitType: "dermatology" as const,
        consultationDate: v.consultationDate,
        status: v.status,
        diagnosis: v.diagnosis?.provisional,
      })),
      ...cosmetologyVisits.map((v) => ({
        _id: v._id,
        visitType: "cosmetology" as const,
        consultationDate: v.consultationDate,
        status: v.status,
        assessment: v.assessment?.diagnosis,
        procedureName: v.procedure?.name,
        procedureTotal: v.procedure?.totalAmount,
      })),
    ].sort((a, b) => new Date(b.consultationDate).getTime() - new Date(a.consultationDate).getTime());

    return NextResponse.json({
      success: true,
      data: {
        patient: {
          _id: patient._id,
          patientId: patient.patientId,
          name: patient.name,
          age: patient.age,
          gender: patient.gender,
          phone: patient.phone,
          email: patient.email,
          address: patient.address,
          medicalHistory: patient.medicalHistory,
          allergies: patient.allergies,
          createdAt: patient.createdAt,
        },
        visits,
      },
    });
  } catch (error: any) {
    console.error("Get patient error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch patient data",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    // Frontdesk staff must have patients permission
    if (auth.role === "frontdesk" && !auth.permissions?.patients) {
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const validation = updatePatientSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: "Validation failed", errors: validation.error.errors },
        { status: 400 }
      );
    }

    await connectDB();

    const patient = await Patient.findById(id);
    if (!patient) {
      return NextResponse.json(
        { success: false, message: "Patient not found" },
        { status: 404 }
      );
    }

    if (patient.clinicId.toString() !== auth.clinicId!.toString()) {
      return NextResponse.json(
        { success: false, message: "Access denied" },
        { status: 403 }
      );
    }

    const updates = validation.data;
    if (updates.allergies !== undefined) patient.allergies = updates.allergies;
    if (updates.medicalHistory !== undefined) patient.medicalHistory = updates.medicalHistory;
    if (updates.age !== undefined) patient.age = updates.age;
    if (updates.address !== undefined) patient.address = updates.address;
    if (updates.email !== undefined) patient.email = updates.email || undefined;

    await patient.save();

    return NextResponse.json({
      success: true,
      message: "Patient updated successfully",
      data: {
        _id: patient._id,
        patientId: patient.patientId,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        medicalHistory: patient.medicalHistory,
        allergies: patient.allergies,
      },
    });
  } catch (error: any) {
    console.error("Update patient error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update patient", error: error.message },
      { status: 500 }
    );
  }
}
