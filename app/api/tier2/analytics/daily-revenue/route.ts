import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import Appointment from "@/models/Appointment";
import { startOfDayIST, endOfDayIST } from "@/lib/dates";

// GET /api/tier2/analytics/daily-revenue?date=YYYY-MM-DD
//
// Returns a full breakdown of today's walk-in revenue:
//   - consultations (count + per-row fee)
//   - follow-ups (count + per-row fee)
//   - cosmetology procedures, grouped by procedure name (each instance listed)
//   - grand total
//
// Excludes cancelled appointments. Booked-but-not-arrived legacy rows are
// excluded by filtering walkIn:true.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const dayStart = startOfDayIST(targetDate);
    const dayEnd = endOfDayIST(targetDate);

    const rows = await Appointment.find({
      clinicId: auth.clinicId,
      walkIn: true,
      appointmentDate: { $gte: dayStart, $lte: dayEnd },
      status: { $nin: ["cancelled"] },
    })
      .populate("patientId", "name patientId phone")
      .sort({ tokenNumber: 1 })
      .lean();

    type Row = {
      _id: string;
      tokenNumber?: number;
      patientName: string;
      patientId?: string;
      appointmentTime?: string;
      status?: string;
      paymentMode?: string;
      fee: number;
    };

    const consultations: Row[] = [];
    const followUps: Row[] = [];
    const proceduresByName: Record<
      string,
      {
        procedureName: string;
        instances: Array<Row & { basePrice: number; gstRate: number; gstAmount: number; totalAmount: number }>;
      }
    > = {};

    for (const r of rows as any[]) {
      const patientName = r.patientId?.name || "Unknown";
      const patientPid = r.patientId?.patientId;
      const base: Row = {
        _id: r._id.toString(),
        tokenNumber: r.tokenNumber,
        patientName,
        patientId: patientPid,
        appointmentTime: r.appointmentTime,
        status: r.status,
        paymentMode: r.paymentMode,
        fee: 0,
      };

      if (r.type === "cosmetology" && r.procedureName) {
        const total = Number(r.totalAmount) || 0;
        const name = r.procedureName;
        if (!proceduresByName[name]) {
          proceduresByName[name] = { procedureName: name, instances: [] };
        }
        proceduresByName[name].instances.push({
          ...base,
          fee: total,
          basePrice: Number(r.basePrice) || 0,
          gstRate: Number(r.gstRate) || 0,
          gstAmount: Number(r.gstAmount) || 0,
          totalAmount: total,
        });
      } else if (r.type === "follow-up") {
        followUps.push({ ...base, fee: Number(r.consultationFee) || 0 });
      } else {
        // "consultation" or anything else (legacy dermatology/cosmetology without procedure)
        consultations.push({ ...base, fee: Number(r.consultationFee) || 0 });
      }
    }

    const consultationsTotal = consultations.reduce((s, x) => s + x.fee, 0);
    const followUpsTotal = followUps.reduce((s, x) => s + x.fee, 0);

    const procedureGroups = Object.values(proceduresByName).map((g) => {
      const count = g.instances.length;
      const baseTotal = g.instances.reduce((s, i) => s + i.basePrice, 0);
      const gstTotal = g.instances.reduce((s, i) => s + i.gstAmount, 0);
      const revenue = g.instances.reduce((s, i) => s + i.totalAmount, 0);
      return { ...g, count, baseTotal, gstTotal, revenue };
    });
    procedureGroups.sort((a, b) => b.revenue - a.revenue);
    const proceduresTotal = procedureGroups.reduce((s, g) => s + g.revenue, 0);

    const grandTotal = consultationsTotal + followUpsTotal + proceduresTotal;

    // Payment-mode breakdown across all rows (fee for consultations/follow-ups,
    // totalAmount for procedures). Rows without a paymentMode roll into "unspecified".
    const paymentTotals: Record<string, { count: number; total: number }> = {};
    const bumpPayment = (mode: string | undefined, amount: number) => {
      const k = mode || "unspecified";
      if (!paymentTotals[k]) paymentTotals[k] = { count: 0, total: 0 };
      paymentTotals[k].count += 1;
      paymentTotals[k].total += amount;
    };
    consultations.forEach((r) => bumpPayment(r.paymentMode, r.fee));
    followUps.forEach((r) => bumpPayment(r.paymentMode, r.fee));
    procedureGroups.forEach((g) =>
      g.instances.forEach((r) => bumpPayment(r.paymentMode, r.totalAmount))
    );

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        consultations: {
          count: consultations.length,
          total: consultationsTotal,
          items: consultations,
        },
        followUps: {
          count: followUps.length,
          total: followUpsTotal,
          items: followUps,
        },
        procedures: {
          count: procedureGroups.reduce((s, g) => s + g.count, 0),
          total: proceduresTotal,
          groups: procedureGroups,
        },
        paymentTotals,
        grandTotal,
      },
    });
  } catch (error: any) {
    console.error("Error fetching daily revenue:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load daily revenue" },
      { status: 500 }
    );
  }
}
