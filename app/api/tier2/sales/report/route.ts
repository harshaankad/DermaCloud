import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import Sale from "@/models/Sale";
import {
  buildExcelResponse,
  formatDate,
  gstRowValues,
  SALES_REGISTER_HEADERS,
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
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }

    const sales = await Sale.find(query).sort({ createdAt: 1 }).lean();

    const rows: any[][] = [];
    for (const s of sales as any[]) {
      const items = s.items || [];
      const invoiceFields = [
        s.invoiceNumber || s.saleId || "",
        formatDate(s.createdAt),
        s.paymentMethod?.toUpperCase() || "",
        s.patientName || "",
        s.city || "",
      ];
      const summaryFields = [
        s.grossValue || s.subtotal || 0,
        s.discountAmount || 0,
        ...gstRowValues(s.gst0, s.gst5, s.gst12, s.gst18, s.gst28),
        s.totalGst || s.taxAmount || 0,
        s.roundingAmount || 0,
        s.totalAmount || 0,
      ];
      const emptyInvoice = invoiceFields.map(() => "");
      const emptySummary = summaryFields.map(() => "");

      if (items.length === 0) {
        const emptyItem = ["", "", "", "", "", "", "", "", "", "", ""];
        rows.push([...invoiceFields, ...emptyItem, ...summaryFields]);
      } else {
        items.forEach((item: any, idx: number) => {
          const itemFields = [
            item.itemCode || "",
            item.itemName || "",
            item.hsnCode || "",
            item.batchNo || "",
            item.expiryDate ? formatDate(item.expiryDate) : "",
            item.manufacturer || "",
            item.quantity || 0,
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
    return buildExcelResponse(rows, SALES_REGISTER_HEADERS, "SalesRegister", `SalesRegister_${dateTag}.xlsx`);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
