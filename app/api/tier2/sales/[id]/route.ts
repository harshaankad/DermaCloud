import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Sale from "@/models/Sale";
import Clinic from "@/models/Clinic";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";
import { auditLog } from "@/lib/audit";

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

// PATCH - Edit a draft sale (replace items + meta) and optionally complete it.
// Body: full sale form shape, plus optional { status: "completed" } to finalize.
// Completing a draft deducts inventory in a transaction and assigns invoiceNumber.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (!hasPermission(auth, "sales")) {
      return NextResponse.json({ success: false, message: "You don't have permission to update sales" }, { status: 403 });
    }

    await connectDB();
    const sale = await Sale.findById(id);
    if (!sale) {
      return NextResponse.json({ success: false, message: "Sale not found" }, { status: 404 });
    }
    if (sale.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json({ success: false, message: "Unauthorized access" }, { status: 403 });
    }
    if (sale.status !== "draft") {
      return NextResponse.json({ success: false, message: "Only draft sales can be edited" }, { status: 400 });
    }

    const body = await request.json();
    const {
      patientName, patientPhone, doctorName, city,
      modeOfPayment, isInterstate = false,
      roundingAmount = 0, items,
      status: rawStatus,
    } = body;

    const completing = rawStatus === "completed";

    if (!patientName?.trim()) {
      return NextResponse.json({ success: false, message: "Party name is required" }, { status: 400 });
    }
    if (!items?.length) {
      return NextResponse.json({ success: false, message: "At least one item is required" }, { status: 400 });
    }

    const performedBy = { id: auth.userId, name: auth.name, role: auth.role };

    const gstBuckets: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {
      0: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      5: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      12: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      18: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      28: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
    };

    let grossValue = 0;
    const enriched: any[] = [];

    for (const item of items) {
      const qty = Number(item.qty) || 0;
      const mrp = Number(item.mrp) || Number(item.rate) || 0;
      const discount = Number(item.discount) || 0;
      const gstRate = Number(item.gstRate) || 0;
      const total = Number(item.total) || +(qty * mrp - discount).toFixed(2);

      if (qty <= 0) {
        return NextResponse.json({ success: false, message: "Quantity must be greater than 0" }, { status: 400 });
      }

      let invItem = null;
      if (item.itemId) invItem = await InventoryItem.findOne({ _id: item.itemId, clinicId: auth.clinicId });
      if (!invItem && item.itemName) {
        invItem = await InventoryItem.findOne({
          name: { $regex: new RegExp(`^${item.itemName.trim()}$`, "i") },
          clinicId: auth.clinicId,
        });
      }
      if (!invItem) {
        return NextResponse.json({ success: false, message: `Item not found: ${item.itemName}` }, { status: 400 });
      }
      if (completing && invItem.currentStock < qty) {
        return NextResponse.json({
          success: false,
          message: `Insufficient stock for ${invItem.name}. Available: ${invItem.currentStock}`,
        }, { status: 400 });
      }

      const taxable = gstRate > 0 ? +(total * 100 / (100 + gstRate)).toFixed(4) : total;
      const gstOnItem = +(total - taxable).toFixed(4);
      if (isInterstate) {
        if (gstBuckets[gstRate] !== undefined) gstBuckets[gstRate].igst += gstOnItem;
      } else {
        const half = +(gstOnItem / 2).toFixed(4);
        if (gstBuckets[gstRate] !== undefined) {
          gstBuckets[gstRate].cgst += half;
          gstBuckets[gstRate].sgst += half;
        }
      }
      if (gstBuckets[gstRate] !== undefined) gstBuckets[gstRate].taxable += taxable;

      grossValue += total;
      enriched.push({
        invItem, qty, mrp, discount, gstRate, total,
        hsnCode: item.hsnCode || invItem.hsnCode || "",
        packing: item.packing || "",
        manufacturer: item.manufacturer || invItem.manufacturer || "",
        batchNo: item.batchNo || invItem.batchNumber || "",
        expiryDate: item.expiryDate || invItem.expiryDate,
      });
    }

    const totalCgst = Object.values(gstBuckets).reduce((s, b) => s + b.cgst, 0);
    const totalSgst = Object.values(gstBuckets).reduce((s, b) => s + b.sgst, 0);
    const totalIgst = Object.values(gstBuckets).reduce((s, b) => s + b.igst, 0);
    const totalGst = +(totalCgst + totalSgst + totalIgst).toFixed(2);
    const netAmount = +(grossValue + roundingAmount).toFixed(2);
    const round = (n: number) => +n.toFixed(2);

    sale.patientName = patientName.trim();
    sale.patientPhone = patientPhone || undefined;
    sale.doctorName = doctorName?.trim() || undefined;
    sale.city = city || undefined;
    sale.isInterstate = isInterstate;
    sale.items = enriched.map((e) => ({
      itemId: e.invItem._id,
      itemCode: e.invItem.itemCode,
      itemName: e.invItem.name,
      hsnCode: e.hsnCode,
      packing: e.packing,
      manufacturer: e.manufacturer,
      batchNo: e.batchNo,
      expiryDate: e.expiryDate || undefined,
      quantity: e.qty,
      unitPrice: e.mrp,
      discount: e.discount,
      gstRate: e.gstRate,
      total: e.total,
    })) as any;
    sale.subtotal = grossValue;
    sale.discountAmount = enriched.reduce((s, e) => s + e.discount, 0);
    sale.taxAmount = totalGst;
    sale.totalAmount = netAmount;
    sale.paymentMethod = modeOfPayment || "cash";
    sale.grossValue = grossValue;
    sale.gst0  = { taxable: round(gstBuckets[0].taxable),  cgst: round(gstBuckets[0].cgst),  sgst: round(gstBuckets[0].sgst),  igst: round(gstBuckets[0].igst)  } as any;
    sale.gst5  = { taxable: round(gstBuckets[5].taxable),  cgst: round(gstBuckets[5].cgst),  sgst: round(gstBuckets[5].sgst),  igst: round(gstBuckets[5].igst)  } as any;
    sale.gst12 = { taxable: round(gstBuckets[12].taxable), cgst: round(gstBuckets[12].cgst), sgst: round(gstBuckets[12].sgst), igst: round(gstBuckets[12].igst) } as any;
    sale.gst18 = { taxable: round(gstBuckets[18].taxable), cgst: round(gstBuckets[18].cgst), sgst: round(gstBuckets[18].sgst), igst: round(gstBuckets[18].igst) } as any;
    sale.gst28 = { taxable: round(gstBuckets[28].taxable), cgst: round(gstBuckets[28].cgst), sgst: round(gstBuckets[28].sgst), igst: round(gstBuckets[28].igst) } as any;
    sale.totalGst = totalGst;
    sale.igst = round(totalIgst);
    sale.roundingAmount = roundingAmount;

    if (completing) {
      sale.status = "completed";
      sale.paymentStatus = "paid";
      sale.amountPaid = netAmount;
      sale.amountDue = 0;

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await sale.save({ session });
          for (const e of enriched) {
            const previousStock = e.invItem.currentStock;
            const newStock = Math.max(0, previousStock - e.qty);
            await InventoryTransaction.create(
              [
                {
                  itemId: e.invItem._id,
                  clinicId: auth.clinicId,
                  type: "stock-out",
                  quantity: e.qty,
                  previousStock,
                  newStock,
                  reason: `Sale to ${sale.patientName} (${sale.invoiceNumber || sale.saleId})`,
                  referenceType: "sale",
                  costPrice: e.mrp,
                  performedBy,
                },
              ],
              { session }
            );
            e.invItem.currentStock = newStock;
            if (newStock === 0) e.invItem.status = "out-of-stock";
            await e.invItem.save({ session });
          }
        });
      } finally {
        session.endSession();
      }
    } else {
      sale.amountPaid = 0;
      sale.amountDue = netAmount;
      await sale.save();
    }

    const saleObj = sale.toObject();
    const clinic = await Clinic.findById(auth.clinicId, { clinicName: 1 }).lean() as any;
    (saleObj as any).clinicName = clinic?.clinicName || auth.clinicName || "Pharmacy";

    return NextResponse.json({
      success: true,
      message: completing ? "Sale completed" : "Draft updated",
      data: saleObj,
    });
  } catch (error: any) {
    console.error("Error patching sale:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update sale" }, { status: 500 });
  }
}

// DELETE - Hard-delete a sale. Doctor-only.
// Body: { restock: boolean } — when true, inventory is credited back and a
// stock-in reversal transaction is recorded for the audit trail.
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
    const body = await request.json().catch(() => ({}));
    const restock = body?.restock === true;

    await connectDB();

    const sale = await Sale.findById(id);
    if (!sale) {
      return NextResponse.json(
        { success: false, message: "Sale not found" },
        { status: 404 }
      );
    }
    if (sale.clinicId.toString() !== auth.clinicId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 403 }
      );
    }
    // Only doctors can delete completed sales. Anyone with sales permission can delete drafts.
    if (sale.status !== "draft" && auth.role !== "doctor") {
      return NextResponse.json(
        { success: false, message: "Only doctors can delete completed sales" },
        { status: 403 }
      );
    }
    if (!hasPermission(auth, "sales")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to delete sales" },
        { status: 403 }
      );
    }

    const performedBy = { id: auth.userId, name: auth.name || "Doctor", role: auth.role };
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Drafts never deducted inventory, so there's nothing to restock.
        if (restock && sale.status !== "draft") {
          for (const item of sale.items || []) {
            const qty = Number(item.quantity) || 0;
            if (qty <= 0 || !item.itemId) continue;
            const invItem = await InventoryItem.findOne({
              _id: item.itemId,
              clinicId: auth.clinicId,
            }).session(session);
            if (!invItem) continue;
            const previousStock = invItem.currentStock;
            invItem.currentStock = previousStock + qty;
            if (invItem.status === "out-of-stock" && invItem.currentStock > 0) {
              invItem.status = "active";
            }
            await invItem.save({ session });
            await InventoryTransaction.create(
              [
                {
                  itemId: invItem._id,
                  clinicId: auth.clinicId,
                  type: "stock-in",
                  quantity: qty,
                  previousStock,
                  newStock: invItem.currentStock,
                  reason: `Sale deleted — restocked (Inv# ${sale.invoiceNumber || sale.saleId})`,
                  referenceType: "sale",
                  costPrice: item.unitPrice,
                  performedBy,
                },
              ],
              { session }
            );
          }
        }
        await Sale.deleteOne({ _id: sale._id }).session(session);
      });
    } finally {
      session.endSession();
    }

    auditLog({
      clinicId: auth.clinicId,
      userId: auth.userId!,
      userEmail: auth.email!,
      role: "doctor",
      action: "SALE_DELETE",
      resourceType: "sale",
      resourceId: id,
      details: {
        invoiceNumber: sale.invoiceNumber || sale.saleId,
        restocked: restock,
        itemCount: sale.items?.length || 0,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: restock ? "Sale deleted and items restocked" : "Sale deleted",
    });
  } catch (error: any) {
    console.error("Error deleting sale:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete sale" },
      { status: 500 }
    );
  }
}
