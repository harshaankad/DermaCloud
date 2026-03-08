/**
 * API endpoint to save doctor-edited patient explanation
 */

import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ConsultationDermatology from "@/models/ConsultationDermatology";

export async function POST(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user: authUser } = authResult;
    if (authUser.tier !== "tier2") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { consultationId, doctorEdited } = body;

    if (!consultationId || doctorEdited === undefined) {
      return NextResponse.json(
        { success: false, message: "consultationId and doctorEdited are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const consultation = await ConsultationDermatology.findById(consultationId);
    if (!consultation) {
      return NextResponse.json({ success: false, message: "Consultation not found" }, { status: 404 });
    }

    consultation.patientSummary = {
      aiGenerated: consultation.patientSummary?.aiGenerated,
      doctorEdited: doctorEdited.trim(),
      translations: consultation.patientSummary?.translations, // preserve saved translations
    };

    await consultation.save();

    return NextResponse.json({
      success: true,
      message: "Explanation saved successfully",
      doctorEdited: consultation.patientSummary.doctorEdited,
    });
  } catch (error: any) {
    console.error("Save explanation error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save explanation", error: error.message },
      { status: 500 }
    );
  }
}
