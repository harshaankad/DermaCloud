import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { sendConsultationReport } from "@/lib/whatsapp/sender";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { consultationId, reportUrl, consultationType } = await request.json();

    if (!consultationId || !reportUrl || !consultationType) {
      return NextResponse.json(
        { success: false, message: "consultationId, reportUrl and consultationType are required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Fetch the right consultation model based on type
    const Model =
      consultationType === "cosmetology"
        ? ConsultationCosmetology
        : ConsultationDermatology;

    const consultation = await Model.findById(consultationId).populate(
      "patientId",
      "name phone"
    );

    if (!consultation) {
      return NextResponse.json(
        { success: false, message: "Consultation not found" },
        { status: 404 }
      );
    }

    if (consultation.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 403 }
      );
    }

    const patient = consultation.patientId as any;

    if (!patient?.phone) {
      return NextResponse.json(
        { success: false, message: "Patient phone number not available" },
        { status: 400 }
      );
    }

    await sendConsultationReport({
      patientName:      patient.name,
      patientPhone:     patient.phone,
      consultationType: consultationType === "cosmetology" ? "Cosmetology" : "Dermatology",
      clinicName:       auth.clinicName ?? "Your Clinic",
      doctorName:       auth.name ?? "Doctor",
      reportLink:       reportUrl,
    });

    return NextResponse.json({ success: true, message: "Report sent via WhatsApp" });
  } catch (error: any) {
    console.error("[send-whatsapp-report] Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to send WhatsApp message" },
      { status: 500 }
    );
  }
}
