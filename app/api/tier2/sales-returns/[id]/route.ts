import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import SalesReturn from "@/models/SalesReturn";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";
import { auditLog } from "@/lib/audit";

// DELETE - Hard-delete a sales return. Doctor-only.
// Body: { removeRestock: boolean } — when true, the inventory credits that this
// return originally made (for items with restock=true) are reversed by writing
// matching stock-out transactions.
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
        { success: false, message: "Only doctors can delete sales returns" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const removeRestock = body?.removeRestock === true;

    await connectDB();

    const salesReturn = await SalesReturn.findById(id);
    if (!salesReturn) {
      return NextResponse.json(
        { success: false, message: "Sales return not found" },
        { status: 404 }
      );
    }
    if (salesReturn.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    const performedBy = { id: auth.userId, name: auth.name || "Doctor", role: auth.role };
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (removeRestock) {
          for (const item of salesReturn.items || []) {
            if (!item.restock) continue;
            const qty = Number(item.quantity) || 0;
            if (qty <= 0) continue;

            let invItem = null;
            if (item.itemId) {
              invItem = await InventoryItem.findOne({
                _id: item.itemId,
                clinicId: auth.clinicId,
              }).session(session);
            }
            if (!invItem && item.itemName) {
              invItem = await InventoryItem.findOne({
                name: { $regex: new RegExp(`^${item.itemName.trim()}$`, "i") },
                clinicId: auth.clinicId,
              }).session(session);
            }
            if (!invItem) continue;

            const previousStock = invItem.currentStock;
            invItem.currentStock = Math.max(0, previousStock - qty);
            if (invItem.currentStock === 0) invItem.status = "out-of-stock";
            await invItem.save({ session });

            await InventoryTransaction.create(
              [
                {
                  itemId: invItem._id,
                  clinicId: auth.clinicId,
                  type: "stock-out",
                  quantity: qty,
                  previousStock,
                  newStock: invItem.currentStock,
                  reason: `Sales return deleted — restock reversed (Inv# ${salesReturn.invoiceNo})`,
                  referenceType: "sales-return",
                  costPrice: item.unitPrice,
                  performedBy,
                },
              ],
              { session }
            );
          }
        }
        await SalesReturn.deleteOne({ _id: salesReturn._id }).session(session);
      });
    } finally {
      session.endSession();
    }

    auditLog({
      clinicId: auth.clinicId,
      userId: auth.userId!,
      userEmail: auth.email!,
      role: "doctor",
      action: "SALES_RETURN_DELETE",
      resourceType: "sales-return",
      resourceId: id,
      details: {
        invoiceNo: salesReturn.invoiceNo,
        removedRestock: removeRestock,
        itemCount: salesReturn.items?.length || 0,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: removeRestock
        ? "Sales return deleted and inventory restock reversed"
        : "Sales return deleted",
    });
  } catch (error: any) {
    console.error("Error deleting sales return:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete sales return" },
      { status: 500 }
    );
  }
}
