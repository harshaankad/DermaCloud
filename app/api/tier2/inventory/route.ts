import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { z } from "zod";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";

// Validation schema for creating inventory item
const createItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  genericName: z.string().optional(),
  category: z.enum(["medicine", "cream", "lotion", "supplement", "equipment", "consumable", "other"]),
  type: z.enum(["prescription", "otc"]).optional(),
  currentStock: z.number().min(0).optional(),
  minStockLevel: z.number().min(0).optional(),
  maxStockLevel: z.number().min(0).optional(),
  unit: z.enum(["tablets", "capsules", "ml", "units", "tubes", "bottles", "pieces", "grams"]),
  costPrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  manufacturer: z.string().optional(),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

// GET - List inventory items
export async function GET(request: NextRequest) {
  try {
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const lowStock = searchParams.get("lowStock") === "true";
    const expiringSoon = searchParams.get("expiringSoon") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    // Build query - exclude discontinued by default
    const query: any = { clinicId: auth.clinicId, status: { $ne: "discontinued" } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { genericName: { $regex: search, $options: "i" } },
        { itemCode: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    if (lowStock) {
      // Find items where currentStock > 0 but <= minStockLevel
      query.$expr = {
        $and: [
          { $lte: ["$currentStock", "$minStockLevel"] },
          { $gt: ["$currentStock", 0] },
        ],
      };
      // Remove the status filter since $expr handles the logic
      delete query.status;
      query.status = { $ne: "discontinued" };
    }

    if (expiringSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      query.expiryDate = { $lte: thirtyDaysFromNow, $gte: new Date() };
    }

    // Get items
    const items = await InventoryItem.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await InventoryItem.countDocuments(query);

    // Get stats - use ObjectId for aggregation pipeline
    const clinicObjectId = new mongoose.Types.ObjectId(auth.clinicId);
    const stats = await InventoryItem.aggregate([
      { $match: { clinicId: clinicObjectId, status: { $ne: "discontinued" } } },
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          totalValue: { $sum: { $multiply: ["$currentStock", "$costPrice"] } },
          lowStockCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $lte: ["$currentStock", "$minStockLevel"] },
                  { $gt: ["$currentStock", 0] },
                ]},
                1,
                0,
              ],
            },
          },
          outOfStockCount: {
            $sum: {
              $cond: [{ $eq: ["$currentStock", 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    // Get expiring items count
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringCount = await InventoryItem.countDocuments({
      clinicId: clinicObjectId,
      expiryDate: { $lte: thirtyDaysFromNow, $gte: new Date() },
      status: { $ne: "discontinued" },
    });

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        stats: {
          totalItems: stats[0]?.totalItems || 0,
          totalValue: stats[0]?.totalValue || 0,
          lowStockCount: stats[0]?.lowStockCount || 0,
          outOfStockCount: stats[0]?.outOfStockCount || 0,
          expiringCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new inventory item
export async function POST(request: NextRequest) {
  try {
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
    const validationResult = createItemSchema.safeParse(body);
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

    const itemData = {
      ...validationResult.data,
      clinicId: auth.clinicId,
    };

    // Handle expiry date
    if (itemData.expiryDate) {
      itemData.expiryDate = new Date(itemData.expiryDate);
    }

    const item = new InventoryItem(itemData);
    await item.save();

    // Log transaction for new item creation
    const transaction = new InventoryTransaction({
      itemId: item._id,
      clinicId: auth.clinicId,
      type: "new-item",
      quantity: item.currentStock || 0,
      previousStock: 0,
      newStock: item.currentStock || 0,
      reason: `New item added: ${item.name}`,
      referenceType: "manual",
      performedBy: {
        id: auth.userId,
        name: auth.name || "Doctor",
        role: auth.role || "doctor",
      },
    });
    await transaction.save();

    return NextResponse.json(
      {
        success: true,
        message: "Inventory item created successfully",
        data: item,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating inventory item:", error);
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "An item with this code already exists. Please try again." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
