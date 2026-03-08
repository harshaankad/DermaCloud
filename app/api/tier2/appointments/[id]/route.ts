import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { z } from "zod";
import Appointment from "@/models/Appointment";
import mongoose from "mongoose";

// Validation schema for updating appointment
const updateAppointmentSchema = z.object({
  appointmentDate: z.string().optional(),
  appointmentTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Please enter a valid time (HH:MM)").optional(),
  duration: z.number().min(15).max(120).optional(),
  type: z.enum(["dermatology", "cosmetology", "follow-up", "consultation"]).optional(),
  status: z.enum(["scheduled", "confirmed", "checked-in", "in-progress", "completed", "cancelled", "no-show"]).optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  cancellationReason: z.string().optional(),
  consultationId: z.string().optional(),
  consultationFee: z.number().min(0).optional(),
});

// GET - Get single appointment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const appointment = await Appointment.findById(id)
      .populate("patientId", "name patientId phone age gender email address medicalHistory")
      .populate("consultationId");

    if (!appointment) {
      return NextResponse.json(
        { success: false, message: "Appointment not found" },
        { status: 404 }
      );
    }

    // Verify appointment belongs to this clinic
    if (appointment.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: appointment,
    });
  } catch (error) {
    console.error("Error fetching appointment:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update appointment
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    if (!hasPermission(auth, "appointments")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to update appointments" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validationResult = updateAppointmentSchema.safeParse(body);
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

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return NextResponse.json(
        { success: false, message: "Appointment not found" },
        { status: 404 }
      );
    }

    // Verify appointment belongs to this clinic
    if (appointment.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    const updateData = { ...validationResult.data };

    // Handle status changes
    if (updateData.status) {
      const now = new Date();
      switch (updateData.status) {
        case "checked-in":
          updateData.checkedInAt = now;
          break;
        case "in-progress":
          updateData.startedAt = now;
          break;
        case "completed":
          updateData.completedAt = now;
          break;
        case "cancelled":
          updateData.cancelledAt = now;
          break;
      }
    }

    // Handle date update
    if (updateData.appointmentDate) {
      const appointmentDateObj = new Date(updateData.appointmentDate);
      appointmentDateObj.setHours(0, 0, 0, 0);
      updateData.appointmentDate = appointmentDateObj;

    }

    // Link consultation if provided
    if (updateData.consultationId) {
      updateData.consultationId = new mongoose.Types.ObjectId(updateData.consultationId);
    }

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).populate("patientId", "name patientId phone age gender");

    return NextResponse.json({
      success: true,
      message: "Appointment updated successfully",
      data: updatedAppointment,
    });
  } catch (error) {
    console.error("Error updating appointment:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Cancel appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    if (!hasPermission(auth, "appointments")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to cancel appointments" },
        { status: 403 }
      );
    }

    await connectDB();

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return NextResponse.json(
        { success: false, message: "Appointment not found" },
        { status: 404 }
      );
    }

    // Verify appointment belongs to this clinic
    if (appointment.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    // Soft delete - just cancel
    appointment.status = "cancelled";
    appointment.cancelledAt = new Date();
    await appointment.save();

    return NextResponse.json({
      success: true,
      message: "Appointment cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
