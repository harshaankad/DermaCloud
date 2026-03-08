import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Appointment from "@/models/Appointment";
import Clinic from "@/models/Clinic";

// Fallback defaults if no clinic settings found
const DEFAULTS = {
  startHour: 9,
  endHour: 22,
  slotDuration: 30,
  lunchStartHour: 13,
  lunchEndHour: 14,
  lunchEnabled: true,
};

// Generate all available time slots for a day
function generateTimeSlots(
  startHour: number,
  endHour: number,
  duration: number,
  lunchStart: number,
  lunchEnd: number,
  lunchEnabled: boolean
): string[] {
  const slots: string[] = [];
  let currentMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  while (currentMinutes < endMinutes) {
    const hour = Math.floor(currentMinutes / 60);
    const min = currentMinutes % 60;

    // Skip lunch break
    if (lunchEnabled && currentMinutes >= lunchStart * 60 && currentMinutes < lunchEnd * 60) {
      currentMinutes = lunchEnd * 60;
      continue;
    }

    const timeStr = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
    slots.push(timeStr);
    currentMinutes += duration;
  }

  return slots;
}

// GET - Get available slots for a specific date
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
        { success: false, message: "You don't have permission to view appointment slots" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date"); // Format: YYYY-MM-DD

    if (!date) {
      return NextResponse.json(
        { success: false, message: "Date is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Load clinic-specific appointment settings
    const clinic = await Clinic.findById(auth.clinicId).select("appointmentSettings").lean();
    const settings = {
      startHour: clinic?.appointmentSettings?.startHour ?? DEFAULTS.startHour,
      endHour: clinic?.appointmentSettings?.endHour ?? DEFAULTS.endHour,
      slotDuration: clinic?.appointmentSettings?.slotDuration ?? DEFAULTS.slotDuration,
      lunchStartHour: clinic?.appointmentSettings?.lunchStartHour ?? DEFAULTS.lunchStartHour,
      lunchEndHour: clinic?.appointmentSettings?.lunchEndHour ?? DEFAULTS.lunchEndHour,
      lunchEnabled: clinic?.appointmentSettings?.lunchEnabled ?? DEFAULTS.lunchEnabled,
    };

    // Get all possible slots
    const allSlots = generateTimeSlots(
      settings.startHour,
      settings.endHour,
      settings.slotDuration,
      settings.lunchStartHour,
      settings.lunchEndHour,
      settings.lunchEnabled
    );

    // Get booked appointments for the date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bookedAppointments = await Appointment.find({
      clinicId: auth.clinicId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ["cancelled", "completed", "no-show"] },
    }).select("appointmentTime");

    const bookedSlots = new Set(bookedAppointments.map((a) => a.appointmentTime));

    // Determine available and booked slots
    const slots = allSlots.map((time) => ({
      time,
      available: !bookedSlots.has(time),
    }));

    // Check if the date is today and filter out past slots
    const today = new Date();
    const isToday = startOfDay.toDateString() === today.toDateString();

    if (isToday) {
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();

      slots.forEach((slot) => {
        const [slotHour, slotMinute] = slot.time.split(":").map(Number);
        if (slotHour < currentHour || (slotHour === currentHour && slotMinute <= currentMinute)) {
          slot.available = false;
        }
      });
    }

    // Count available and total
    const availableCount = slots.filter((s) => s.available).length;

    return NextResponse.json({
      success: true,
      data: {
        date,
        slots,
        summary: {
          total: allSlots.length,
          available: availableCount,
          booked: allSlots.length - availableCount,
        },
        settings,
      },
    });
  } catch (error) {
    console.error("Error fetching appointment slots:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
