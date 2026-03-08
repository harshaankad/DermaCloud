import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { z } from "zod";
import mongoose from "mongoose";
import Sale from "@/models/Sale";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";

// Validation schema for sale item
const saleItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().min(1),
  discount: z.number().min(0).optional(),
});

// Validation schema for creating sale
const createSaleSchema = z.object({
  patientId: z.string().optional(),
  patientName: z.string().min(1, "Customer name is required"),
  patientPhone: z.string().optional(),
  consultationId: z.string().optional(),
  appointmentId: z.string().optional(),
  items: z.array(saleItemSchema).min(1, "At least one item is required"),
  discountPercentage: z.number().min(0).max(100).optional(),
  taxPercentage: z.number().min(0).optional(),
  paymentMethod: z.enum(["cash", "card", "upi", "insurance", "credit"]),
  amountPaid: z.number().min(0),
  notes: z.string().optional(),
});

// GET - List sales
export async function GET(request: NextRequest) {
  try {
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date"); // Format: YYYY-MM-DD
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const patientId = searchParams.get("patientId");
    const paymentStatus = searchParams.get("paymentStatus");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    // Build query
    const query: any = { clinicId: auth.clinicId };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (patientId) {
      query.patientId = patientId;
    }

    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    // Get sales
    const sales = await Sale.find(query)
      .populate("patientId", "name patientId phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Sale.countDocuments(query);

    // Get stats for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStats = await Sale.aggregate([
      {
        $match: {
          clinicId: new mongoose.Types.ObjectId(auth.clinicId),
          createdAt: { $gte: today, $lt: tomorrow },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$amountPaid" },
          totalDue: { $sum: "$amountDue" },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      data: {
        sales,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        todayStats: todayStats[0] || {
          totalSales: 0,
          totalRevenue: 0,
          totalPaid: 0,
          totalDue: 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching sales:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new sale
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    if (!hasPermission(auth, "sales")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to create sales" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validationResult = createSaleSchema.safeParse(body);
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

    const {
      patientId,
      patientName,
      patientPhone,
      consultationId,
      appointmentId,
      items,
      discountPercentage,
      taxPercentage,
      paymentMethod,
      amountPaid,
      notes,
    } = validationResult.data;

    // Process without transactions (works on standalone MongoDB)
    // First, validate all items have sufficient stock
    const saleItems = [];
    let subtotal = 0;
    const inventoryUpdates: { item: any; quantity: number; previousStock: number }[] = [];

    for (const item of items) {
      const inventoryItem = await InventoryItem.findById(item.itemId);

      if (!inventoryItem) {
        return NextResponse.json(
          { success: false, message: `Item not found: ${item.itemId}` },
          { status: 400 }
        );
      }

      if (inventoryItem.clinicId.toString() !== auth.clinicId) {
        return NextResponse.json(
          { success: false, message: `Item does not belong to this clinic: ${item.itemId}` },
          { status: 400 }
        );
      }

      if (inventoryItem.currentStock < item.quantity) {
        return NextResponse.json(
          { success: false, message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.currentStock}` },
          { status: 400 }
        );
      }

      const itemDiscount = item.discount || 0;
      const itemTotal = (inventoryItem.sellingPrice * item.quantity) - itemDiscount;

      saleItems.push({
        itemId: inventoryItem._id,
        itemCode: inventoryItem.itemCode,
        itemName: inventoryItem.name,
        quantity: item.quantity,
        unitPrice: inventoryItem.sellingPrice,
        discount: itemDiscount,
        total: itemTotal,
      });

      subtotal += itemTotal;

      inventoryUpdates.push({
        item: inventoryItem,
        quantity: item.quantity,
        previousStock: inventoryItem.currentStock,
      });
    }

    // Calculate totals
    const discountAmount = subtotal * ((discountPercentage || 0) / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = afterDiscount * ((taxPercentage || 0) / 100);
    const totalAmount = afterDiscount + taxAmount;
    const amountDue = Math.max(0, totalAmount - amountPaid);

    // Create sale first
    const sale = new Sale({
      clinicId: auth.clinicId,
      patientId: patientId || undefined,
      patientName,
      patientPhone,
      consultationId: consultationId || undefined,
      appointmentId: appointmentId || undefined,
      items: saleItems,
      subtotal,
      discountAmount,
      discountPercentage: discountPercentage || 0,
      taxAmount,
      taxPercentage: taxPercentage || 0,
      totalAmount,
      paymentMethod,
      paymentStatus: amountDue === 0 ? "paid" : amountPaid === 0 ? "pending" : "partial",
      amountPaid,
      amountDue,
      soldBy: {
        id: auth.userId,
        name: auth.name,
        role: auth.role,
      },
      notes,
    });

    await sale.save();

    // Now update inventory and create transactions
    for (const update of inventoryUpdates) {
      const { item, quantity, previousStock } = update;

      // Create inventory transaction
      const transaction = new InventoryTransaction({
        itemId: item._id,
        clinicId: auth.clinicId,
        type: "stock-out",
        quantity: quantity,
        previousStock: previousStock,
        newStock: previousStock - quantity,
        reason: "Sale",
        referenceType: "sale",
        referenceId: sale._id,
        performedBy: {
          id: auth.userId,
          name: auth.name,
          role: auth.role,
        },
      });

      await transaction.save();

      // Update inventory stock
      item.currentStock -= quantity;
      if (item.currentStock === 0) {
        item.status = "out-of-stock";
      }
      await item.save();
    }

    return NextResponse.json(
      {
        success: true,
        message: "Sale completed successfully",
        data: sale,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating sale:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
