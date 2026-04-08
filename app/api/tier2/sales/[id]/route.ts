import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Sale from "@/models/Sale";
import Clinic from "@/models/Clinic";

// GET - Get single sale details
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

    if (!hasPermission(auth, "sales")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to view sales" },
        { status: 403 }
      );
    }

    await connectDB();

    const sale = await Sale.findById(id)
      .populate("patientId", "name patientId phone age gender")
      .populate("consultationId")
      .populate("appointmentId");

    if (!sale) {
      return NextResponse.json(
        { success: false, message: "Sale not found" },
        { status: 404 }
      );
    }

    // Verify sale belongs to this clinic
    if (sale.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    // Add clinicName for print bill
    const saleObj = sale.toObject();
    const clinic = await Clinic.findById(auth.clinicId, { clinicName: 1 }).lean() as any;
    (saleObj as any).clinicName = clinic?.clinicName || auth.clinicName || "Pharmacy";

    return NextResponse.json({
      success: true,
      data: saleObj,
    });
  } catch (error) {
    console.error("Error fetching sale:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update payment status
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

    if (!hasPermission(auth, "sales")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to update sales" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { amountPaid, paymentMethod, notes } = body;

    await connectDB();

    const sale = await Sale.findById(id);

    if (!sale) {
      return NextResponse.json(
        { success: false, message: "Sale not found" },
        { status: 404 }
      );
    }

    // Verify sale belongs to this clinic
    if (sale.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    // Update payment
    if (amountPaid !== undefined) {
      const newAmountPaid = sale.amountPaid + amountPaid;
      sale.amountPaid = newAmountPaid;
      sale.amountDue = Math.max(0, sale.totalAmount - newAmountPaid);

      // Update payment status
      if (sale.amountDue === 0) {
        sale.paymentStatus = "paid";
      } else if (sale.amountPaid === 0) {
        sale.paymentStatus = "pending";
      } else {
        sale.paymentStatus = "partial";
      }
    }

    if (paymentMethod) {
      sale.paymentMethod = paymentMethod;
    }

    if (notes) {
      sale.notes = notes;
    }

    await sale.save();

    return NextResponse.json({
      success: true,
      message: "Sale updated successfully",
      data: sale,
    });
  } catch (error) {
    console.error("Error updating sale:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
