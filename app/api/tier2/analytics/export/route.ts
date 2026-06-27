/**
 * Excel export of clinic revenue (consultations, follow-ups, cosmetology
 * procedures) for a CA. Three sheets, one per service type, each carrying the
 * invoice number. Voided entries and cancelled appointments are excluded.
 *
 * Range is capped at 31 days to keep exports bounded.
 *   GET /api/tier2/analytics/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import { startOfDayIST, endOfDayIST, istDateLabel } from "@/lib/dates";
import Appointment from "@/models/Appointment";
import "@/models/Patient";

const MAX_RANGE_DAYS = 31;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (!hasPermission(auth, "appointments")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to export revenue" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json(
        { success: false, message: "from and to dates are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ success: false, message: "Invalid date range" }, { status: 400 });
    }
    if (fromDate > toDate) {
      return NextResponse.json({ success: false, message: "'from' must be on or before 'to'" }, { status: 400 });
    }
    const dayDiff = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
    if (dayDiff > MAX_RANGE_DAYS - 1) {
      return NextResponse.json(
        { success: false, message: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
        { status: 400 }
      );
    }

    await connectDB();

    const rows = await Appointment.find({
      clinicId: auth.clinicId,
      walkIn: true,
      appointmentDate: { $gte: startOfDayIST(fromDate), $lte: endOfDayIST(toDate) },
      status: { $nin: ["cancelled"] },
      voided: { $ne: true },
    })
      .populate("patientId", "name patientId phone")
      .sort({ appointmentDate: 1, tokenNumber: 1 })
      .lean();

    const consultations: any[][] = [];
    const followUps: any[][] = [];
    const procedures: any[][] = [];

    let cTotal = 0;
    let fTotal = 0;
    let pBase = 0;
    let pGst = 0;
    let pTotal = 0;

    for (const r of rows as any[]) {
      const p = r.patientId || {};
      const dateLabel = istDateLabel(new Date(r.appointmentDate || r.createdAt));
      const payment = r.paymentMode ? String(r.paymentMode).toUpperCase() : "";

      if (r.type === "cosmetology" && r.procedureName) {
        const base = Number(r.basePrice) || 0;
        const gst = Number(r.gstAmount) || 0;
        const total = Number(r.totalAmount) || 0;
        pBase += base;
        pGst += gst;
        pTotal += total;
        procedures.push([
          r.invoiceNumber || "", dateLabel, r.tokenNumber ?? "", p.name || "", p.patientId || "",
          p.phone || "", payment, r.procedureName, base, Number(r.gstRate) || 0, gst, total,
        ]);
      } else if (r.type === "follow-up") {
        const fee = Number(r.consultationFee) || 0;
        fTotal += fee;
        followUps.push([
          r.invoiceNumber || "", dateLabel, r.tokenNumber ?? "", p.name || "", p.patientId || "",
          p.phone || "", payment, fee,
        ]);
      } else {
        const fee = Number(r.consultationFee) || 0;
        cTotal += fee;
        consultations.push([
          r.invoiceNumber || "", dateLabel, r.tokenNumber ?? "", p.name || "", p.patientId || "",
          p.phone || "", payment, fee,
        ]);
      }
    }

    const visitHeaders = ["Invoice No", "Date", "Token", "Patient", "Patient ID", "Mobile", "Payment Mode", "Fee"];
    const procHeaders = ["Invoice No", "Date", "Token", "Patient", "Patient ID", "Mobile", "Payment Mode", "Procedure", "Base", "GST %", "GST Amount", "Total"];

    if (consultations.length) consultations.push([]), consultations.push(["", "", "", "", "", "", "TOTAL", cTotal]);
    if (followUps.length) followUps.push([]), followUps.push(["", "", "", "", "", "", "TOTAL", fTotal]);
    if (procedures.length) procedures.push([]), procedures.push(["", "", "", "", "", "", "", "TOTAL", pBase, "", pGst, pTotal]);

    const wb = XLSX.utils.book_new();
    const addSheet = (name: string, headers: string[], data: any[][]) => {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      ws["!cols"] = headers.map((h, i) => {
        let maxLen = h.length;
        for (const row of data) {
          const cell = row[i];
          if (cell != null) maxLen = Math.max(maxLen, String(cell).length);
        }
        return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
      });
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet("Consultations", visitHeaders, consultations);
    addSheet("Follow-ups", visitHeaders, followUps);
    addSheet("Procedures", procHeaders, procedures);

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `Revenue_${from}_to_${to}.xlsx`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Revenue export error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to export revenue" },
      { status: 500 }
    );
  }
}
