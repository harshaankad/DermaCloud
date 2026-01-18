import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import Patient from "@/models/Patient";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const patientId = params.id;

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
    if (patient.clinicId.toString() !== authUser.clinicId.toString()) {
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
        .select("consultationDate status assessment")
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
