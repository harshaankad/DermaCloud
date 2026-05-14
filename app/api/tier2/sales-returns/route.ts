import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import SalesReturn from "@/models/SalesReturn";
import Sale from "@/models/Sale";
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

    const [returns, total] = await Promise.all([
      SalesReturn.find(query).sort({ invoiceDate: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SalesReturn.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: { returns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyTier2Request(request);
  if (!auth.success) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });

  await connectDB();
  const body = await request.json();

  // Over-return guard: if linked to an original sale, ensure total returned qty per item
  // never exceeds the qty actually sold on that invoice (counting prior returns too).
  if (body.originalSaleId) {
    if (!mongoose.Types.ObjectId.isValid(body.originalSaleId)) {
      return NextResponse.json({ success: false, message: "Invalid originalSaleId" }, { status: 400 });
    }
    const originalSale: any = await Sale.findOne({ _id: body.originalSaleId, clinicId: auth.clinicId }).lean();
    if (!originalSale) {
      return NextResponse.json({ success: false, message: "Original sale not found" }, { status: 404 });
    }

    const soldById: Record<string, number> = {};
    const soldByName: Record<string, number> = {};
    for (const it of (originalSale.items || [])) {
      const qty = Number(it.quantity) || 0;
      if (it.itemId) soldById[String(it.itemId)] = (soldById[String(it.itemId)] || 0) + qty;
      soldByName[(it.itemName || "").trim().toLowerCase()] = (soldByName[(it.itemName || "").trim().toLowerCase()] || 0) + qty;
    }

    const priorReturns: any[] = await SalesReturn.find({
      originalSaleId: body.originalSaleId,
      clinicId: auth.clinicId,
    }).lean();
    const priorById: Record<string, number> = {};
    const priorByName: Record<string, number> = {};
    for (const pr of priorReturns) {
      for (const it of (pr.items || [])) {
        const qty = Number(it.quantity) || 0;
        if (it.itemId) priorById[String(it.itemId)] = (priorById[String(it.itemId)] || 0) + qty;
        priorByName[(it.itemName || "").trim().toLowerCase()] = (priorByName[(it.itemName || "").trim().toLowerCase()] || 0) + qty;
      }
    }

    for (const it of (body.items || [])) {
      const qty = Number(it.quantity) || 0;
      if (qty <= 0) continue;
      const idKey = it.itemId ? String(it.itemId) : null;
      const nameKey = (it.itemName || "").trim().toLowerCase();
      const sold = (idKey && soldById[idKey]) || soldByName[nameKey] || 0;
      const prior = (idKey && priorById[idKey]) || priorByName[nameKey] || 0;
      if (sold === 0) {
        return NextResponse.json({
          success: false,
          message: `"${it.itemName}" was not part of the original sale.`,
        }, { status: 400 });
      }
      if (prior + qty > sold) {
        const remaining = Math.max(0, sold - prior);
        return NextResponse.json({
          success: false,
          message: `Cannot return ${qty} of "${it.itemName}". Sold: ${sold}, already returned: ${prior}, remaining returnable: ${remaining}.`,
        }, { status: 400 });
      }
    }
  }

  const session = await mongoose.startSession();
  try {
    let savedReturn: any;

    await session.withTransaction(async () => {
      const performedBy = {
        id: auth.userId,
        name: auth.name || (auth.role === "doctor" ? "Doctor" : "Frontdesk"),
        role: auth.role || "frontdesk",
      };

      const [salesReturn] = await SalesReturn.create(
        [{ ...body, clinicId: auth.clinicId, createdBy: auth.doctorId || auth.userId }],
        { session }
      );

      // Restock inventory for items where restock=true
      for (const item of body.items || []) {
        if (!item.restock) continue;

        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        let invItem = null;
        if (item.itemId) {
          invItem = await InventoryItem.findOne({ _id: item.itemId, clinicId: auth.clinicId }).session(session);
        }
        if (!invItem && item.itemName) {
          invItem = await InventoryItem.findOne({
            name: { $regex: new RegExp(`^${item.itemName.trim()}$`, "i") },
            clinicId: auth.clinicId,
          }).session(session);
        }
        if (!invItem) continue;

        const previousStock = invItem.currentStock;
        invItem.currentStock += qty;
        if (invItem.status === "out-of-stock" && invItem.currentStock > 0) invItem.status = "active";
        await invItem.save({ session });

        await InventoryTransaction.create(
          [{
            itemId: invItem._id,
            clinicId: auth.clinicId,
            type: "stock-in",
            quantity: qty,
            previousStock,
            newStock: invItem.currentStock,
            reason: `Sales return from ${body.partyName || "customer"} (Inv# ${body.invoiceNo || "—"})`,
            referenceType: "sales-return",
            costPrice: item.unitPrice,
            performedBy,
          }],
          { session }
        );
      }

      savedReturn = salesReturn;
    });

    return NextResponse.json({ success: true, data: savedReturn }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  } finally {
    session.endSession();
  }
}
