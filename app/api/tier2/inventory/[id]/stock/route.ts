import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { z } from "zod";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";

// Validation schema for stock adjustment
const stockAdjustmentSchema = z.object({
  type: z.enum(["stock-in", "stock-out", "adjustment", "expired", "damaged", "return"]),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  reason: z.string().min(1, "Reason is required"),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  costPrice: z.number().min(0).optional(),
});

// POST - Add/adjust stock
export async function POST(
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

    if (!hasPermission(auth, "pharmacy")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to manage inventory" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validationResult = stockAdjustmentSchema.safeParse(body);
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

    const item = await InventoryItem.findById(id);

    if (!item) {
      return NextResponse.json(
        { success: false, message: "Item not found" },
        { status: 404 }
      );
    }

    // Verify item belongs to this clinic
    if (item.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }

    const { type, quantity, reason, batchNumber, expiryDate, costPrice } = validationResult.data;

    const previousStock = item.currentStock;
    let newStock: number;

    // Calculate new stock based on transaction type
    switch (type) {
      case "stock-in":
      case "return":
        newStock = previousStock + quantity;
        break;
      case "stock-out":
      case "expired":
      case "damaged":
        if (previousStock < quantity) {
          return NextResponse.json(
            { success: false, message: `Insufficient stock. Current stock: ${previousStock}` },
            { status: 400 }
          );
        }
        newStock = previousStock - quantity;
        break;
      case "adjustment":
        // For adjustment, quantity can be positive (increase) or negative (decrease)
        newStock = previousStock + quantity;
        if (newStock < 0) {
          return NextResponse.json(
            { success: false, message: "Adjustment would result in negative stock" },
            { status: 400 }
          );
        }
        break;
      default:
        newStock = previousStock;
    }

    // Create transaction record
    const transaction = new InventoryTransaction({
      itemId: id,
      clinicId: auth.clinicId,
      type,
      quantity,
      previousStock,
      newStock,
      reason,
      batchNumber,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      costPrice,
      referenceType: "manual",
      performedBy: {
        id: auth.userId,
        name: auth.name,
        role: auth.role,
      },
    });

    await transaction.save();

    // Update item stock
    item.currentStock = newStock;

    // Update batch and expiry if provided (for stock-in)
    if (type === "stock-in") {
      if (batchNumber) item.batchNumber = batchNumber;
      if (expiryDate) item.expiryDate = new Date(expiryDate);
      if (costPrice) item.costPrice = costPrice;
    }

    // Update status based on stock
    if (newStock === 0) {
      item.status = "out-of-stock";
    } else if (item.status === "out-of-stock") {
      item.status = "active";
    }

    await item.save();

    return NextResponse.json({
      success: true,
      message: `Stock ${type === "stock-in" ? "added" : "adjusted"} successfully`,
      data: {
        item,
        transaction,
      },
    });
  } catch (error) {
    console.error("Error adjusting stock:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
