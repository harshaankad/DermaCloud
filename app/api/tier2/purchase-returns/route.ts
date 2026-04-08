import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import PurchaseReturn from "@/models/PurchaseReturn";
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
      PurchaseReturn.find(query).sort({ invoiceDate: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PurchaseReturn.countDocuments(query),
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

    // Deduct stock for each returned item
    const enrichedItems = await Promise.all(
      (body.items || []).map(async (item: any) => {
        if (!item.itemName?.trim()) return item;

        const invItem = await InventoryItem.findOne({
          clinicId: auth.clinicId,
          name: { $regex: `^${item.itemName.trim()}$`, $options: "i" },
        });

        if (invItem) {
          const qty = Number(item.quantity) || 0;
          const previousStock = invItem.currentStock;
          const newStock = Math.max(0, previousStock - qty);

          // Create transaction first — if this fails, inventory won't be touched
          await InventoryTransaction.create({
            itemId: invItem._id,
            clinicId: auth.clinicId,
            type: "stock-out",
            quantity: qty,
            previousStock,
            newStock,
            reason: `Purchase return to ${body.supplierName || "supplier"} (Inv# ${body.supplierInvNo || "—"})`,
            referenceType: "purchase-return",
            costPrice: item.unitPrice,
            performedBy,
          });

          invItem.currentStock = newStock;
          if (invItem.currentStock === 0) invItem.status = "out-of-stock";
          await invItem.save();

          return { ...item, itemId: invItem._id };
        }

        return item;
      })
    );

    const purchaseReturn = new PurchaseReturn({
      ...body,
      items: enrichedItems,
      clinicId: auth.clinicId,
      createdBy: auth.doctorId || auth.userId,
    });

    await purchaseReturn.save();

    return NextResponse.json({ success: true, data: purchaseReturn }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
