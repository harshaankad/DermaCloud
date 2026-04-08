import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { z } from "zod";
import Appointment from "@/models/Appointment";
import Patient from "@/models/Patient";
import Sale from "@/models/Sale";
import {
  sendAppointmentConfirmation,
  formatAppointmentDate,
  formatAppointmentTime,
} from "@/lib/whatsapp/sender";

// Validation schema for creating appointment
const createAppointmentSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  appointmentDate: z.string().min(1, "Appointment date is required"),
  appointmentTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Please enter a valid time (HH:MM)"),
  duration: z.number().min(15).max(120).optional(),
  type: z.enum(["dermatology", "cosmetology", "follow-up", "consultation"]),
  reason: z.string().optional(),
  notes: z.string().optional(),
  consultationFee: z.number().min(0).optional(),
});

// GET - List appointments
export async function GET(request: NextRequest) {
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
        { success: false, message: "You don't have permission to view appointments" },
        { status: 403 }
      );
    }

    await connectDB();

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date"); // Format: YYYY-MM-DD
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    // Build query
    const query: any = { clinicId: auth.clinicId };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.appointmentDate = { $gte: startOfDay, $lte: endOfDay };
    }

    if (status) {
      query.status = status;
    }

    if (patientId) {
      query.patientId = patientId;
    }

    // Get appointments
    const appointments = await Appointment.find(query)
      .populate("patientId", "name patientId phone age gender")
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Appointment.countDocuments(query);

    // Find which appointments already have a sale (dispensed)
    const appointmentIds = appointments.map((a) => a._id);
    const dispensedSales = await Sale.find(
      { appointmentId: { $in: appointmentIds } },
      { appointmentId: 1 }
    ).lean();
    const dispensedSet = new Set(dispensedSales.map((s) => s.appointmentId?.toString()));

    const appointmentsWithDispensed = appointments.map((a) => ({
      ...a.toObject(),
      dispensed: dispensedSet.has(a._id.toString()),
    }));

    // Get stats for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStats = await Appointment.aggregate([
      {
        $match: {
          clinicId: auth.clinicId,
          appointmentDate: { $gte: today, $lt: tomorrow },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      data: {
        appointments: appointmentsWithDispensed,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        todayStats: todayStats.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new appointment
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
    console.log("[APT POST] received body consultationFee:", body.consultationFee, "type:", typeof body.consultationFee);

    // Validate request body
    const validationResult = createAppointmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Validation failed",
          errors: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    await connectDB();

    const { patientId, appointmentDate, appointmentTime, duration, type, reason, notes, consultationFee } = validationResult.data;
    console.log("[APT POST] validated consultationFee:", consultationFee);

    // Verify patient exists and belongs to this clinic
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

    // Create appointment
    const appointmentDateObj = new Date(appointmentDate);
    appointmentDateObj.setHours(0, 0, 0, 0);

    // Auto-assign token number for this day
    const endOfDay = new Date(appointmentDateObj);
    endOfDay.setHours(23, 59, 59, 999);
    const maxTokenResult = await Appointment.findOne(
      {
        clinicId: auth.clinicId,
        appointmentDate: { $gte: appointmentDateObj, $lte: endOfDay },
        status: { $nin: ["cancelled"] },
        tokenNumber: { $exists: true },
      },
      { tokenNumber: 1 },
      { sort: { tokenNumber: -1 } }
    );
    const tokenNumber = (maxTokenResult?.tokenNumber || 0) + 1;

    const appointment = new Appointment({
      patientId,
      doctorId: auth.doctorId,
      clinicId: auth.clinicId,
      appointmentDate: appointmentDateObj,
      appointmentTime,
      duration: duration || 30,
      type,
      reason,
      notes,
      consultationFee: consultationFee ?? undefined,
      tokenNumber,
      bookedBy: {
        id: auth.userId,
        name: auth.name,
        role: auth.role,
      },
    });

    await appointment.save();
    console.log("[APT POST] saved appointment ID:", appointment._id, "consultationFee:", appointment.consultationFee);

    // ── WhatsApp confirmation (fire-and-forget — never blocks the booking) ────
    if (patient.phone) {
      sendAppointmentConfirmation({
        patientName:  patient.name,
        patientPhone: patient.phone,
        clinicName:   auth.clinicName ?? "Your Clinic",
        doctorName:   auth.name ?? "Doctor",
        date: formatAppointmentDate(appointmentDateObj),
        time: formatAppointmentTime(appointmentTime),
      }).catch((err: Error) =>
        console.error("[WhatsApp] Notification failed:", err.message)
      );
    }

    // Populate patient info for response
    await appointment.populate("patientId", "name patientId phone age gender");

    return NextResponse.json(
      {
        success: true,
        message: "Appointment booked successfully",
        data: appointment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating appointment:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
