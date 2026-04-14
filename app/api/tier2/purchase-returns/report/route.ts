import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import PurchaseReturn from "@/models/PurchaseReturn";
import {
  buildExcelResponse,
  formatDate,
  sumGst,
  PURCHASE_RETURN_REGISTER_HEADERS,
} from "@/lib/excel/reportHelper";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });

    await connectDB();

    const { searchParams } = new URL(request.url);
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

    const returns = await PurchaseReturn.find(query).sort({ invoiceDate: 1 }).lean();

    const rows: any[][] = [];
    for (const p of returns as any[]) {
      const items = p.items || [];
      const invoiceFields = [
        p.supplierInvNo,
        p.gstnNo || "",
        formatDate(p.invoiceDate),
        p.modeOfPayment?.toUpperCase() || "",
        p.supplierName,
        p.city || "",
      ];
      const summaryFields = [
        p.grossValue || 0,
        p.discount || 0,
        p.cgst || sumGst("cgst", p.gst0, p.gst5, p.gst12, p.gst18, p.gst28),
        p.sgst || sumGst("sgst", p.gst0, p.gst5, p.gst12, p.gst18, p.gst28),
        p.igst || sumGst("igst", p.gst0, p.gst5, p.gst12, p.gst18, p.gst28),
        p.totalGst || 0,
        p.adding || 0,
        p.less || 0,
        p.roundingAmount || 0,
        p.netAmount || 0,
      ];
      const emptyInvoice = invoiceFields.map(() => "");
      const emptySummary = summaryFields.map(() => "");

      if (items.length === 0) {
        const emptyItem = ["", "", "", "", "", "", "", "", "", "", "", ""];
        rows.push([...invoiceFields, ...emptyItem, ...summaryFields]);
      } else {
        items.forEach((item: any, idx: number) => {
          const itemFields = [
            item.itemName || "",
            item.hsnCode || "",
            item.pack || "",
            item.batchNo || "",
            item.expiryDate ? formatDate(item.expiryDate) : "",
            item.quantity || 0,
            item.freeQty || 0,
            item.mrp || 0,
            item.unitPrice || 0,
            item.discount || 0,
            item.gstRate != null ? `${item.gstRate}%` : "",
            item.total || 0,
          ];
          if (idx === 0) {
            rows.push([...invoiceFields, ...itemFields, ...summaryFields]);
          } else {
            rows.push([...emptyInvoice, ...itemFields, ...emptySummary]);
          }
        });
      }
    }

    const dateTag = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);
    return buildExcelResponse(rows, PURCHASE_RETURN_REGISTER_HEADERS, "PurchaseReturnRegister", `PurchaseReturnRegister_${dateTag}.xlsx`);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
