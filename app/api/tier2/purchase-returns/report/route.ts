import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import PurchaseReturn from "@/models/PurchaseReturn";
import {
  buildExcelResponse,
  formatDate,
  sumGst,
  PURCHASE_REGISTER_HEADERS,
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

    const rows = returns.map((p: any) => [
      p.supplierInvNo,
      p.gstnNo || "",
      formatDate(p.invoiceDate),
      p.modeOfPayment?.toUpperCase() || "",
      p.supplierName,
      p.city || "",
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
    ]);

    const dateTag = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);
    return buildExcelResponse(rows, PURCHASE_REGISTER_HEADERS, "PurchaseReturnRegister", `PurchaseReturnRegister_${dateTag}.xlsx`);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
