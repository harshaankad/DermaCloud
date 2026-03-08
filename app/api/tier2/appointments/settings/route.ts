import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Clinic from "@/models/Clinic";

// GET - Get current appointment settings
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
        { success: false, message: "You don't have permission to view appointment settings" },
        { status: 403 }
      );
    }

    await connectDB();

    const clinic = await Clinic.findById(auth.clinicId).select("appointmentSettings").lean();

    const defaults = {
      startHour: 9,
      endHour: 22,
      slotDuration: 30,
      lunchStartHour: 13,
      lunchEndHour: 14,
      lunchEnabled: true,
    };

    return NextResponse.json({
      success: true,
      data: {
        startHour: clinic?.appointmentSettings?.startHour ?? defaults.startHour,
        endHour: clinic?.appointmentSettings?.endHour ?? defaults.endHour,
        slotDuration: clinic?.appointmentSettings?.slotDuration ?? defaults.slotDuration,
        lunchStartHour: clinic?.appointmentSettings?.lunchStartHour ?? defaults.lunchStartHour,
        lunchEndHour: clinic?.appointmentSettings?.lunchEndHour ?? defaults.lunchEndHour,
        lunchEnabled: clinic?.appointmentSettings?.lunchEnabled ?? defaults.lunchEnabled,
      },
    });
  } catch (error) {
    console.error("Error fetching appointment settings:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update appointment settings
export async function PUT(request: NextRequest) {
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
        { success: false, message: "You don't have permission to update appointment settings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { startHour, endHour, slotDuration, lunchStartHour, lunchEndHour, lunchEnabled } = body;

    // Validate
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      return NextResponse.json(
        { success: false, message: "Hours must be between 0 and 23" },
        { status: 400 }
      );
    }

    if (startHour >= endHour) {
      return NextResponse.json(
        { success: false, message: "Start time must be before end time" },
        { status: 400 }
      );
    }

    if (slotDuration < 5 || slotDuration > 60) {
      return NextResponse.json(
        { success: false, message: "Slot duration must be between 5 and 60 minutes" },
        { status: 400 }
      );
    }

    if (lunchEnabled && lunchStartHour >= lunchEndHour) {
      return NextResponse.json(
        { success: false, message: "Lunch start must be before lunch end" },
        { status: 400 }
      );
    }

    if (lunchEnabled && (lunchStartHour < startHour || lunchEndHour > endHour)) {
      return NextResponse.json(
        { success: false, message: "Lunch break must be within clinic hours" },
        { status: 400 }
      );
    }

    await connectDB();

    const clinic = await Clinic.findByIdAndUpdate(
      auth.clinicId,
      {
        $set: {
          "appointmentSettings.startHour": startHour,
          "appointmentSettings.endHour": endHour,
          "appointmentSettings.slotDuration": slotDuration,
          "appointmentSettings.lunchStartHour": lunchStartHour,
          "appointmentSettings.lunchEndHour": lunchEndHour,
          "appointmentSettings.lunchEnabled": lunchEnabled,
        },
      },
      { new: true }
    ).select("appointmentSettings");

    if (!clinic) {
      return NextResponse.json(
        { success: false, message: "Clinic not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Appointment settings updated successfully",
      data: clinic.appointmentSettings,
    });
  } catch (error) {
    console.error("Error updating appointment settings:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
