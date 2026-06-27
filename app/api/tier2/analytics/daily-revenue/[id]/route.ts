import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { isValidObjectId } from "@/lib/sanitize";
import { auditLog } from "@/lib/audit";
import Appointment from "@/models/Appointment";

// DELETE /api/tier2/analytics/daily-revenue/[id]
//
// Soft-deletes ("voids") a walk-in revenue entry. The row is retained in the DB
// for audit, but is hidden from the daily page, dropped from revenue totals and
// excluded from the CA Excel export. Reversible at the data layer.
//
// Optional JSON body: { reason?: string }
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    if (!hasPermission(auth, "appointments")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to modify revenue entries" },
        { status: 403 }
      );
    }

    if (!isValidObjectId(id)) {
      return NextResponse.json({ success: false, message: "Invalid entry id" }, { status: 400 });
    }

    // Reason is optional; body may be empty.
    let reason = "";
    try {
      const body = await request.json();
      if (body && typeof body.reason === "string") reason = body.reason.trim().slice(0, 500);
    } catch {
      // no/blank body — fine
    }

    await connectDB();

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return NextResponse.json({ success: false, message: "Entry not found" }, { status: 404 });
    }

    // Scope strictly to the caller's clinic.
    if (appointment.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json({ success: false, message: "Unauthorized access" }, { status: 403 });
    }

    if (appointment.voided) {
      return NextResponse.json({ success: true, message: "Entry already removed" });
    }

    appointment.voided = true;
    appointment.voidedAt = new Date();
    appointment.voidedBy = {
      id: auth.userId as any,
      name: auth.name || "Unknown",
      role: (auth.role as "doctor" | "frontdesk") || "doctor",
    };
    if (reason) appointment.voidReason = reason;
    await appointment.save();

    auditLog({
      clinicId: auth.clinicId,
      userId: auth.userId!,
      userEmail: auth.email!,
      role: auth.role as "doctor" | "frontdesk",
      action: "REVENUE_ENTRY_VOID",
      resourceType: "appointment",
      resourceId: id,
      details: {
        invoiceNumber: appointment.invoiceNumber,
        type: appointment.type,
        amount: appointment.totalAmount ?? appointment.consultationFee ?? 0,
        reason: reason || undefined,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, message: "Entry removed" });
  } catch (error: any) {
    console.error("Error voiding revenue entry:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to remove entry" },
      { status: 500 }
    );
  }
}
