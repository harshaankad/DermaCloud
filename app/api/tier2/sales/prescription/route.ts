import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";

// GET - Fetch consultation prescription for a patient on a given date (defaults to today)
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status || 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");

    if (!patientId) {
      return NextResponse.json(
        { success: false, message: "patientId is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Use the date from the appointment (YYYY-MM-DD) or fall back to today
    const dateParam = searchParams.get("date");
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const dateFilter = { $gte: targetDate, $lt: nextDay };

    // Check both consultation types in parallel
    const [dermConsultation, cosmoConsultation] = await Promise.all([
      ConsultationDermatology.findOne({
        patientId,
        clinicId: auth.clinicId,
        consultationDate: dateFilter,
      })
        .select("treatmentPlan customFields patientInfo")
        .sort({ consultationDate: -1 })
        .lean(),
      ConsultationCosmetology.findOne({
        patientId,
        clinicId: auth.clinicId,
        consultationDate: dateFilter,
      })
        .select("procedure aftercare customFields patientInfo")
        .sort({ consultationDate: -1 })
        .lean(),
    ]);

    if (!dermConsultation && !cosmoConsultation) {
      return NextResponse.json({ success: true, data: null });
    }

    // Prefer dermatology if both exist on the same day
    const type = dermConsultation ? "dermatology" : "cosmetology";
    const consultation = dermConsultation || cosmoConsultation;

    return NextResponse.json({ success: true, data: { type, consultation } });
  } catch (error: any) {
    console.error("Error fetching prescription:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
