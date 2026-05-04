import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import Purchase from "@/models/Purchase";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const supplier = searchParams.get("supplier");

    const query: any = { clinicId: auth.clinicId };

    if (from || to) {
      query.invoiceDate = {};
      if (from) query.invoiceDate.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query.invoiceDate.$lte = toDate;
      }
    }

    if (supplier) {
      query.supplierName = { $regex: supplier, $options: "i" };
    }

    const [purchases, total] = await Promise.all([
      Purchase.find(query).sort({ invoiceDate: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Purchase.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: { purchases, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });

    await connectDB();
    const body = await request.json();

    const performedBy = {
      id: auth.userId,
      name: auth.name || (auth.role === "doctor" ? "Doctor" : "Frontdesk"),
      role: auth.role || "doctor",
    };

    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const enrichedItems: any[] = [];
      for (const item of body.items || []) {
        if (!item.itemName?.trim()) { enrichedItems.push(item); continue; }

        let invItem = await InventoryItem.findOne({
          clinicId: auth.clinicId,
          name: { $regex: `^${item.itemName.trim()}$`, $options: "i" },
        }).session(session);

        const qty = Number(item.quantity) || 0;

        if (invItem) {
          const previousStock = invItem.currentStock;
          invItem.currentStock += qty;
          invItem.costPrice = item.unitPrice || invItem.costPrice;
          if (item.mrp) invItem.sellingPrice = item.mrp;
          if (item.hsnCode) invItem.hsnCode = item.hsnCode;
          if (item.pack) (invItem as any).packing = item.pack;
          if (item.manufacturer) invItem.manufacturer = item.manufacturer || invItem.manufacturer;
          if (item.batchNo) invItem.batchNumber = item.batchNo;
          if (item.expiryDate) invItem.expiryDate = new Date(item.expiryDate);
          if (item.gstRate !== undefined) invItem.gstRate = item.gstRate as 0|5|12|18|28;
          if (invItem.currentStock > 0 && invItem.status === "out-of-stock") {
            invItem.status = "active";
          }
          await invItem.save({ session });

          await InventoryTransaction.create(
            [{
              itemId: invItem._id,
              clinicId: auth.clinicId,
              type: "stock-in",
              quantity: qty,
              previousStock,
              newStock: invItem.currentStock,
              reason: `Purchase from ${body.supplierName || "supplier"} (Inv# ${body.supplierInvNo || "—"})`,
              referenceType: "purchase",
              costPrice: item.unitPrice,
              performedBy,
            }],
            { session }
          );

          enrichedItems.push({ ...item, itemId: invItem._id });
        } else {
          const [created] = await InventoryItem.create(
            [{
              name: item.itemName.trim(),
              clinicId: auth.clinicId,
              category: "medicine",
              type: "otc",
              currentStock: qty,
              minStockLevel: 10,
              unit: "units",
              costPrice: item.unitPrice || 0,
              sellingPrice: item.mrp || item.unitPrice || 0,
              manufacturer: item.manufacturer || undefined,
              batchNumber: item.batchNo || undefined,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
              hsnCode: item.hsnCode || undefined,
              packing: item.pack || undefined,
              gstRate: item.gstRate ?? 0,
              status: qty > 0 ? "active" : "out-of-stock",
            }],
            { session }
          );

          await InventoryTransaction.create(
            [{
              itemId: created._id,
              clinicId: auth.clinicId,
              type: "stock-in",
              quantity: qty,
              previousStock: 0,
              newStock: qty,
              reason: `New item via purchase from ${body.supplierName || "supplier"} (Inv# ${body.supplierInvNo || "—"})`,
              referenceType: "purchase",
              costPrice: item.unitPrice,
              performedBy,
            }],
            { session }
          );

          enrichedItems.push({ ...item, itemId: created._id });
        }
      }

      const purchase = new Purchase({
        ...body,
        items: enrichedItems,
        clinicId: auth.clinicId,
        createdBy: auth.doctorId || auth.userId,
      });

      await purchase.save({ session });

      await session.commitTransaction();

      return NextResponse.json({ success: true, data: purchase }, { status: 201 });
    } catch (txnError) {
      await session.abortTransaction();
      throw txnError;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
