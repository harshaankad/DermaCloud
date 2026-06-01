import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { isValidObjectId } from "@/lib/sanitize";
import { istHHMM, startOfDayIST, endOfDayIST } from "@/lib/dates";
import Appointment from "@/models/Appointment";
import Patient from "@/models/Patient";
import CosmetologyProcedure from "@/models/CosmetologyProcedure";

// POST - Create a walk-in. Skips "scheduled" entirely: the patient lands
// directly in "checked-in" (waiting) status.
//
// Body shape (mutually exclusive reasons):
//   { patientId, reason: "consultation" | "follow-up", consultationFee }
//   { patientId, reason: "cosmetology", procedureId }
// Server snapshots procedure name/price/GST so analytics survive future edits.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    if (!hasPermission(auth, "appointments")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to create appointments" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { patientId, reason, consultationFee, procedureId, notes, paymentMode } = body;

    if (!patientId) {
      return NextResponse.json(
        { success: false, message: "Patient ID is required" },
        { status: 400 }
      );
    }
    if (!reason || !["consultation", "follow-up", "cosmetology"].includes(reason)) {
      return NextResponse.json(
        { success: false, message: "reason must be one of: consultation, follow-up, cosmetology" },
        { status: 400 }
      );
    }
    // paymentMode is optional — validate only if provided
    const validPaymentModes = ["cash", "card", "upi", "insurance", "credit"];
    if (paymentMode && !validPaymentModes.includes(paymentMode)) {
      return NextResponse.json(
        { success: false, message: "Invalid payment mode" },
        { status: 400 }
      );
    }
    if ((reason === "consultation" || reason === "follow-up") && (consultationFee == null || consultationFee === "")) {
      return NextResponse.json(
        { success: false, message: "Consultation fee is required" },
        { status: 400 }
      );
    }
    if (reason === "cosmetology" && (!procedureId || !isValidObjectId(procedureId))) {
      return NextResponse.json(
        { success: false, message: "Valid procedure is required for cosmetology walk-in" },
        { status: 400 }
      );
    }

    await connectDB();

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return NextResponse.json(
        { success: false, message: "Patient not found" },
        { status: 404 }
      );
    }
    if (patient.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Patient does not belong to this clinic" },
        { status: 403 }
      );
    }

    // Look up procedure (server-side compute to prevent client tampering).
    let procedureSnapshot: {
      procedureId?: any;
      procedureName?: string;
      basePrice?: number;
      gstRate?: number;
      gstAmount?: number;
      totalAmount?: number;
    } = {};
    if (reason === "cosmetology") {
      const proc = await CosmetologyProcedure.findOne({
        _id: procedureId,
        clinicId: auth.clinicId,
      });
      if (!proc) {
        return NextResponse.json(
          { success: false, message: "Procedure not found" },
          { status: 404 }
        );
      }
      const basePrice = Number(proc.basePrice) || 0;
      const gstRate = Number(proc.gstRate) || 0;
      const gstAmount = +((basePrice * gstRate) / 100).toFixed(2);
      const totalAmount = +(basePrice + gstAmount).toFixed(2);
      procedureSnapshot = {
        procedureId: proc._id,
        procedureName: proc.name,
        basePrice,
        gstRate,
        gstAmount,
        totalAmount,
      };
    }

    const now = new Date();
    const dayStart = startOfDayIST(now);
    const dayEnd = endOfDayIST(now);

    // Token: separate time-based sequences per queue. Consultations + follow-ups
    // share one queue; cosmetology procedures have their own. So a clinic running
    // both tracks in parallel will have e.g. consultation tokens 1..N and
    // procedure tokens 1..M independently.
    const queueTypes =
      reason === "cosmetology"
        ? ["cosmetology"]
        : ["consultation", "follow-up"];
    const maxToken = await Appointment.findOne(
      {
        clinicId: auth.clinicId,
        appointmentDate: { $gte: dayStart, $lte: dayEnd },
        walkIn: true,
        type: { $in: queueTypes },
        tokenNumber: { $exists: true, $ne: null },
        status: { $nin: ["cancelled"] },
      },
      { tokenNumber: 1 },
      { sort: { tokenNumber: -1 } }
    ).lean() as { tokenNumber?: number } | null;
    const tokenNumber = (maxToken?.tokenNumber || 0) + 1;

    const appointmentTime = istHHMM(now);

    // Map our app-level reason → the model's `type` enum.
    // consultation     → "consultation"
    // follow-up        → "follow-up"
    // cosmetology      → "cosmetology"
    const apptType =
      reason === "consultation" ? "consultation" :
      reason === "follow-up"    ? "follow-up" :
      "cosmetology";

    const appointment = new Appointment({
      patientId,
      doctorId: auth.doctorId,
      clinicId: auth.clinicId,
      appointmentDate: dayStart,
      appointmentTime,
      duration: 30,
      type: apptType,
      reason: "",
      notes: notes || undefined,
      consultationFee: (reason === "consultation" || reason === "follow-up")
        ? Number(consultationFee)
        : undefined,
      paymentMode: paymentMode || undefined,
      ...procedureSnapshot,
      tokenNumber,
      walkIn: true,
      status: "checked-in",
      checkedInAt: now,
      bookedBy: {
        id: auth.userId,
        name: auth.name,
        role: auth.role,
      },
    });

    await appointment.save();

    return NextResponse.json({
      success: true,
      message: "Walk-in registered",
      data: appointment,
    });
  } catch (error: any) {
    console.error("Error creating walk-in:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to register walk-in" },
      { status: 500 }
    );
  }
}
