import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import Appointment from "@/models/Appointment";

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
    const appointmentId = searchParams.get("appointmentId");

    if (!patientId) {
      return NextResponse.json(
        { success: false, message: "patientId is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // If appointmentId is provided, look up the linked consultation directly
    if (appointmentId) {
      const appointment = await Appointment.findById(appointmentId).select("consultationId").lean();
      if (appointment?.consultationId) {
        const consultationId = appointment.consultationId;
        // Try both consultation types
        const [dermConsultation, cosmoConsultation] = await Promise.all([
          ConsultationDermatology.findById(consultationId)
            .select("treatmentPlan customFields patientInfo")
            .lean(),
          ConsultationCosmetology.findById(consultationId)
            .select("procedure aftercare customFields patientInfo")
            .lean(),
        ]);
        if (dermConsultation) {
          return NextResponse.json({ success: true, data: { type: "dermatology", consultation: dermConsultation } });
        }
        if (cosmoConsultation) {
          return NextResponse.json({ success: true, data: { type: "cosmetology", consultation: cosmoConsultation } });
        }
      }
    }

    // Fallback: search by patient + date
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

    // Prefer dermatology if both exist on the same day (fallback only)
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
