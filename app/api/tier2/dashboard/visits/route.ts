import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import Appointment from "@/models/Appointment";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import mongoose from "mongoose";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status || 401 }
      );
    }

    if (auth.role !== "doctor") {
      return NextResponse.json(
        { success: false, message: "Only doctors can access this" },
        { status: 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const type = searchParams.get("type") || "all"; // all, appointments, consultations

    const clinicId = auth.clinicId;
    const doctorId = auth.doctorId;
    const clinicObjectId = new mongoose.Types.ObjectId(clinicId);

    const results: any[] = [];
    let hasMore = false;

    if (type === "all" || type === "appointments") {
      const appointments = await Appointment.find({ clinicId: clinicObjectId })
        .populate("patientId", "name patientId phone age gender")
        .sort({ appointmentDate: -1, appointmentTime: -1 })
        .skip((page - 1) * limit)
        .limit(limit + 1);

      const hasMoreAppointments = appointments.length > limit;
      const slicedAppointments = appointments.slice(0, limit);

      for (const apt of slicedAppointments) {
        results.push({
          _id: apt._id.toString(),
          type: "appointment",
          subType: apt.type,
          patientName: apt.patientId?.name || "Unknown",
          patientId: apt.patientId?.patientId || "",
          patientPhone: apt.patientId?.phone || "",
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          status: apt.status,
          reason: apt.reason,
        });
      }

      if (type === "appointments") hasMore = hasMoreAppointments;
    }

    if (type === "all" || type === "consultations") {
      const [dermVisits, cosmoVisits] = await Promise.all([
        ConsultationDermatology.find({ doctorId })
          .select("patientInfo consultationDate status")
          .sort({ consultationDate: -1 })
          .skip((page - 1) * limit)
          .limit(limit + 1),
        ConsultationCosmetology.find({ doctorId })
          .select("patientInfo consultationDate status")
          .sort({ consultationDate: -1 })
          .skip((page - 1) * limit)
          .limit(limit + 1),
      ]);

      const hasMoreDerm = dermVisits.length > limit;
      const hasMoreCosmo = cosmoVisits.length > limit;

      for (const visit of dermVisits.slice(0, limit)) {
        results.push({
          _id: visit._id.toString(),
          type: "consultation",
          subType: "dermatology",
          patientName: visit.patientInfo?.name || "Unknown",
          patientId: "",
          patientPhone: "",
          date: visit.consultationDate,
          time: new Date(visit.consultationDate).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          status: visit.status,
          reason: "",
        });
      }

      for (const visit of cosmoVisits.slice(0, limit)) {
        results.push({
          _id: visit._id.toString(),
          type: "consultation",
          subType: "cosmetology",
          patientName: visit.patientInfo?.name || "Unknown",
          patientId: "",
          patientPhone: "",
          date: visit.consultationDate,
          time: new Date(visit.consultationDate).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          status: visit.status,
          reason: "",
        });
      }

      if (type === "consultations") hasMore = hasMoreDerm || hasMoreCosmo;
    }

    // Sort by date descending
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // For "all" type, trim to limit and check if more
    if (type === "all") {
      hasMore = results.length > limit;
      results.splice(limit);
    }

    return NextResponse.json({
      success: true,
      data: {
        visits: results,
        page,
        hasMore,
      },
    });
  } catch (error: any) {
    console.error("Visits API error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch visits" },
      { status: 500 }
    );
  }
}
