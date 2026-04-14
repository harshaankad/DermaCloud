import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import SalesReturn from "@/models/SalesReturn";
import {
  buildExcelResponse,
  formatDate,
  sumGst,
  SALES_RETURN_REGISTER_HEADERS,
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

    const returns = await SalesReturn.find(query).sort({ invoiceDate: 1 }).lean();

    const rows: any[][] = [];
    for (const s of returns as any[]) {
      const items = s.items || [];
      const invoiceFields = [
        s.invoiceNo,
        formatDate(s.invoiceDate),
        s.modeOfPayment?.toUpperCase() || "",
        s.partyName,
        s.city || "",
      ];
      const summaryFields = [
        s.grossValue || 0,
        s.discount || 0,
        sumGst("cgst", s.gst0, s.gst5, s.gst12, s.gst18, s.gst28),
        sumGst("sgst", s.gst0, s.gst5, s.gst12, s.gst18, s.gst28),
        sumGst("igst", s.gst0, s.gst5, s.gst12, s.gst18, s.gst28),
        s.totalGst || 0,
        s.roundingAmount || 0,
        s.netAmount || 0,
      ];
      const emptyInvoice = invoiceFields.map(() => "");
      const emptySummary = summaryFields.map(() => "");

      if (items.length === 0) {
        const emptyItem = ["", "", "", "", "", "", ""];
        rows.push([...invoiceFields, ...emptyItem, ...summaryFields]);
      } else {
        items.forEach((item: any, idx: number) => {
          const itemFields = [
            item.itemCode || "",
            item.itemName || "",
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
    return buildExcelResponse(rows, SALES_RETURN_REGISTER_HEADERS, "SalesReturnRegister", `SalesReturnRegister_${dateTag}.xlsx`);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
