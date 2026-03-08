import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { z } from "zod";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";

// Validation schema for updating inventory item
const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  genericName: z.string().optional(),
  category: z.enum(["medicine", "cream", "lotion", "supplement", "equipment", "consumable", "other"]).optional(),
  type: z.enum(["prescription", "otc"]).optional(),
  minStockLevel: z.number().min(0).optional(),
  maxStockLevel: z.number().min(0).optional(),
  unit: z.enum(["tablets", "capsules", "ml", "units", "tubes", "bottles", "pieces", "grams"]).optional(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  manufacturer: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "discontinued", "out-of-stock"]).optional(),
});

// GET - Get single inventory item with transaction history
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

    if (!hasPermission(auth, "pharmacy")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to view inventory" },
        { status: 403 }
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

    // Get recent transactions
    const transactions = await InventoryTransaction.find({ itemId: id })
      .sort({ createdAt: -1 })
      .limit(20);

    return NextResponse.json({
      success: true,
      data: {
        item,
        transactions,
      },
    });
  } catch (error) {
    console.error("Error fetching inventory item:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update inventory item
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

    if (!hasPermission(auth, "pharmacy")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to manage inventory" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validationResult = updateItemSchema.safeParse(body);
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

    const updatedItem = await InventoryItem.findByIdAndUpdate(
      id,
      { $set: validationResult.data },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      message: "Item updated successfully",
      data: updatedItem,
    });
  } catch (error) {
    console.error("Error updating inventory item:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Discontinue inventory item (soft delete)
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

    if (!hasPermission(auth, "pharmacy")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to manage inventory" },
        { status: 403 }
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

    // Soft delete - just discontinue
    item.status = "discontinued";
    await item.save();

    return NextResponse.json({
      success: true,
      message: "Item discontinued successfully",
    });
  } catch (error) {
    console.error("Error discontinuing inventory item:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
