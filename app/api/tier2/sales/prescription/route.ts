import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import Appointment from "@/models/Appointment";
import { startOfDayIST, addDaysIST } from "@/lib/dates";

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

    // "latest=true" mode: ignore date, return the most recent consultation
    // (across derm + cosmo) for this patient. Used by the "Add Previous
    // Prescription" button on the Sales pages.
    const latest = searchParams.get("latest") === "true";

    let dateFilter: any = undefined;
    if (!latest) {
      const dateParam = searchParams.get("date");
      const targetDate = startOfDayIST(dateParam ? new Date(dateParam) : new Date());
      const nextDay = addDaysIST(targetDate, 1);
      dateFilter = { $gte: targetDate, $lt: nextDay };
    }

    const baseFilter: any = { patientId, clinicId: auth.clinicId };
    if (dateFilter) baseFilter.consultationDate = dateFilter;

    const [dermConsultation, cosmoConsultation] = await Promise.all([
      ConsultationDermatology.findOne(baseFilter)
        .select("treatmentPlan customFields patientInfo consultationDate")
        .sort({ consultationDate: -1 })
        .lean(),
      ConsultationCosmetology.findOne(baseFilter)
        .select("procedure aftercare customFields patientInfo consultationDate")
        .sort({ consultationDate: -1 })
        .lean(),
    ]);

    if (!dermConsultation && !cosmoConsultation) {
      return NextResponse.json({ success: true, data: null });
    }

    // Pick the newer of the two when latest mode is requested; otherwise
    // (same-day fallback) prefer dermatology as before.
    let type: "dermatology" | "cosmetology";
    let consultation: any;
    if (latest && dermConsultation && cosmoConsultation) {
      const dermDate = new Date((dermConsultation as any).consultationDate).getTime();
      const cosmoDate = new Date((cosmoConsultation as any).consultationDate).getTime();
      if (cosmoDate > dermDate) {
        type = "cosmetology";
        consultation = cosmoConsultation;
      } else {
        type = "dermatology";
        consultation = dermConsultation;
      }
    } else {
      type = dermConsultation ? "dermatology" : "cosmetology";
      consultation = dermConsultation || cosmoConsultation;
    }

    return NextResponse.json({ success: true, data: { type, consultation } });
  } catch (error: any) {
    console.error("Error fetching prescription:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
