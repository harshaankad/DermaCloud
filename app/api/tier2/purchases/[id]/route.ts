import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import Purchase from "@/models/Purchase";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";
import { auditLog } from "@/lib/audit";

// DELETE - Hard-delete a purchase. Doctor-only.
// Body: { reverseStock: boolean } — when true, the quantities added by this
// purchase are subtracted from inventory (clamped at 0 since stock cannot go
// negative) and a stock-out reversal transaction is logged.
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
    if (auth.role !== "doctor") {
      return NextResponse.json(
        { success: false, message: "Only doctors can delete purchases" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const reverseStock = body?.reverseStock === true;

    await connectDB();

    const purchase = await Purchase.findById(id);
    if (!purchase) {
      return NextResponse.json(
        { success: false, message: "Purchase not found" },
        { status: 404 }
      );
    }
    if (purchase.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    const performedBy = { id: auth.userId, name: auth.name || "Doctor", role: auth.role };
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (reverseStock) {
          for (const item of purchase.items || []) {
            const qty = Number(item.quantity) || 0;
            if (qty <= 0 || !item.itemId) continue;
            const invItem = await InventoryItem.findOne({
              _id: item.itemId,
              clinicId: auth.clinicId,
            }).session(session);
            if (!invItem) continue;
            const previousStock = invItem.currentStock;
            const actualRemoved = Math.min(previousStock, qty);
            invItem.currentStock = previousStock - actualRemoved;
            if (invItem.currentStock === 0 && invItem.status === "active") {
              invItem.status = "out-of-stock";
            }
            await invItem.save({ session });
            await InventoryTransaction.create(
              [
                {
                  itemId: invItem._id,
                  clinicId: auth.clinicId,
                  type: "stock-out",
                  quantity: actualRemoved,
                  previousStock,
                  newStock: invItem.currentStock,
                  reason:
                    actualRemoved < qty
                      ? `Purchase deleted — reversed ${actualRemoved}/${qty} (insufficient stock) (Inv# ${purchase.supplierInvNo || "—"})`
                      : `Purchase deleted — reversed stock (Inv# ${purchase.supplierInvNo || "—"})`,
                  referenceType: "purchase",
                  costPrice: item.unitPrice,
                  performedBy,
                },
              ],
              { session }
            );
          }
        }
        await Purchase.deleteOne({ _id: purchase._id }).session(session);
      });
    } finally {
      session.endSession();
    }

    auditLog({
      clinicId: auth.clinicId,
      userId: auth.userId!,
      userEmail: auth.email!,
      role: "doctor",
      action: "PURCHASE_DELETE",
      resourceType: "purchase",
      resourceId: id,
      details: {
        supplierInvNo: purchase.supplierInvNo,
        supplierName: purchase.supplierName,
        reversedStock: reverseStock,
        itemCount: purchase.items?.length || 0,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: reverseStock ? "Purchase deleted and stock reversed" : "Purchase deleted",
    });
  } catch (error: any) {
    console.error("Error deleting purchase:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete purchase" },
      { status: 500 }
    );
  }
}
