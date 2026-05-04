import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import Sale from "@/models/Sale";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";
import Clinic from "@/models/Clinic";

// GET - List sales
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const query: any = { clinicId: auth.clinicId };
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    const [sales, total] = await Promise.all([
      Sale.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Sale.countDocuments(query),
    ]);

    // Add clinicName for print bill
    const clinic = await Clinic.findById(auth.clinicId, { clinicName: 1 }).lean() as any;
    const clinicName = clinic?.clinicName || auth.clinicName || "Pharmacy";
    const enrichedSales = sales.map((s: any) => ({ ...s, clinicName }));

    return NextResponse.json({ success: true, data: { sales: enrichedSales, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST - Create new sale
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

    await connectDB();

    const body = await request.json();
    const {
      patientName, patientPhone, doctorName, city,
      modeOfPayment, isInterstate = false,
      roundingAmount = 0, items,
    } = body;

    if (!patientName?.trim()) return NextResponse.json({ success: false, message: "Party name is required" }, { status: 400 });
    if (!items?.length) return NextResponse.json({ success: false, message: "At least one item is required" }, { status: 400 });

    const performedBy = { id: auth.userId, name: auth.name, role: auth.role };

    // Fetch clinic info for bill storage
    const clinic = await Clinic.findById(auth.clinicId, { clinicName: 1, address: 1, phone: 1 }).lean() as any;

    // GST buckets for per-rate breakdown
    const gstBuckets: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {
      0: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      5: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      12: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      18: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      28: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
    };

    let grossValue = 0;
    const enriched: any[] = [];

    // Validate all items first
    for (const item of items) {
      const qty = Number(item.qty) || 0;
      const mrp = Number(item.mrp) || Number(item.rate) || 0;
      const discount = Number(item.discount) || 0;
      const gstRate = Number(item.gstRate) || 0;
      const total = Number(item.total) || +(qty * mrp - discount).toFixed(2);

      if (qty <= 0) return NextResponse.json({ success: false, message: "Quantity must be greater than 0" }, { status: 400 });

      let invItem = null;
      if (item.itemId) invItem = await InventoryItem.findOne({ _id: item.itemId, clinicId: auth.clinicId });
      if (!invItem && item.itemName) {
        invItem = await InventoryItem.findOne({
          name: { $regex: new RegExp(`^${item.itemName.trim()}$`, "i") },
          clinicId: auth.clinicId,
        });
      }

      if (!invItem) return NextResponse.json({ success: false, message: `Item not found: ${item.itemName}` }, { status: 400 });
      if (invItem.currentStock < qty) {
        return NextResponse.json({
          success: false,
          message: `Insufficient stock for ${invItem.name}. Available: ${invItem.currentStock}`,
        }, { status: 400 });
      }

      // Item total is the base (excl. GST); GST is added on top
      const taxable = total;

      if (isInterstate) {
        const igstAmt = +(taxable * gstRate / 100).toFixed(4);
        if (gstBuckets[gstRate] !== undefined) gstBuckets[gstRate].igst += igstAmt;
      } else {
        const cgst = +(taxable * gstRate / 200).toFixed(4);
        const sgst = +(taxable * gstRate / 200).toFixed(4);
        if (gstBuckets[gstRate] !== undefined) {
          gstBuckets[gstRate].cgst += cgst;
          gstBuckets[gstRate].sgst += sgst;
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
    const netAmount = +(grossValue + totalGst + roundingAmount).toFixed(2);

    const saleItems = enriched.map((e) => ({
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
    }));

    const round = (n: number) => +n.toFixed(2);

    const sale = new Sale({
      clinicId: auth.clinicId,
      patientName: patientName.trim(),
      patientPhone: patientPhone || undefined,
      doctorName: doctorName?.trim() || undefined,
      city: city || undefined,
      isInterstate,
      items: saleItems,
      subtotal: grossValue,
      discountAmount: enriched.reduce((s, e) => s + e.discount, 0),
      discountPercentage: 0,
      taxAmount: totalGst,
      taxPercentage: 0,
      totalAmount: netAmount,
      paymentMethod: modeOfPayment || "cash",
      paymentStatus: "paid",
      amountPaid: netAmount,
      amountDue: 0,
      grossValue,
      gst0:  { taxable: round(gstBuckets[0].taxable),  cgst: round(gstBuckets[0].cgst),  sgst: round(gstBuckets[0].sgst),  igst: round(gstBuckets[0].igst)  },
      gst5:  { taxable: round(gstBuckets[5].taxable),  cgst: round(gstBuckets[5].cgst),  sgst: round(gstBuckets[5].sgst),  igst: round(gstBuckets[5].igst)  },
      gst12: { taxable: round(gstBuckets[12].taxable), cgst: round(gstBuckets[12].cgst), sgst: round(gstBuckets[12].sgst), igst: round(gstBuckets[12].igst) },
      gst18: { taxable: round(gstBuckets[18].taxable), cgst: round(gstBuckets[18].cgst), sgst: round(gstBuckets[18].sgst), igst: round(gstBuckets[18].igst) },
      gst28: { taxable: round(gstBuckets[28].taxable), cgst: round(gstBuckets[28].cgst), sgst: round(gstBuckets[28].sgst), igst: round(gstBuckets[28].igst) },
      totalGst,
      igst: round(totalIgst),
      roundingAmount,
      clinicAddress: clinic?.address || undefined,
      clinicPhone: clinic?.phone || undefined,
      soldBy: performedBy,
    });

    const session = await mongoose.startSession();
    try {
      session.startTransaction();

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
              reason: `Sale to ${patientName.trim()} (${sale.invoiceNumber || sale.saleId})`,
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

      await session.commitTransaction();
    } catch (txnError) {
      await session.abortTransaction();
      throw txnError;
    } finally {
      session.endSession();
    }

    const saleObj = sale.toObject();
    (saleObj as any).clinicName = clinic?.clinicName || auth.clinicName || "Pharmacy";

    return NextResponse.json({ success: true, message: "Sale recorded", data: saleObj }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
