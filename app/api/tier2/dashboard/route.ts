import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import Patient from "@/models/Patient";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import Appointment from "@/models/Appointment";
import InventoryItem from "@/models/InventoryItem";
import Sale from "@/models/Sale";
import mongoose from "mongoose";

// Usage limits for Tier 2
const DAILY_LIMIT = 20;
const MONTHLY_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status || 401 }
      );
    }

    // Only doctors should access this dashboard
    if (auth.role !== "doctor") {
      return NextResponse.json(
        { success: false, message: "This endpoint is only for doctors" },
        { status: 403 }
      );
    }

    await connectDB();

    const clinicId = auth.clinicId;
    const doctorId = auth.doctorId;
    const { searchParams } = new URL(request.url);
    const lite = searchParams.get("lite") === "true";

    // Date helpers
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const clinicObjectId = new mongoose.Types.ObjectId(clinicId);

    // Live data — always fetched (appointments, today's visits, today's sales)
    const [
      dailyDermCount,
      dailyCosmoCount,
      todayDermVisits,
      todayCosmoVisits,
      todayAppointments,
      appointmentStats,
      todaySalesStats,
    ] = await Promise.all([
      ConsultationDermatology.countDocuments({
        doctorId,
        consultationDate: { $gte: today },
      }),
      ConsultationCosmetology.countDocuments({
        doctorId,
        consultationDate: { $gte: today },
      }),

      // Today's dermatology visits
      ConsultationDermatology.find({
        doctorId,
        consultationDate: { $gte: today },
      })
        .select("patientInfo consultationDate status")
        .sort({ consultationDate: -1 })
        .limit(10)
        .lean(),

      // Today's cosmetology visits
      ConsultationCosmetology.find({
        doctorId,
        consultationDate: { $gte: today },
      })
        .select("patientInfo consultationDate status")
        .sort({ consultationDate: -1 })
        .limit(10)
        .lean(),

      // Today's appointments
      Appointment.find({
        clinicId: clinicObjectId,
        appointmentDate: { $gte: today, $lt: tomorrow },
      })
        .populate("patientId", "name patientId phone age gender")
        .sort({ appointmentTime: 1 })
        .lean(),

      // Appointment stats for today
      Appointment.aggregate([
        {
          $match: {
            clinicId: clinicObjectId,
            appointmentDate: { $gte: today, $lt: tomorrow },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      // Today's sales stats
      Sale.aggregate([
        {
          $match: {
            clinicId: clinicObjectId,
            createdAt: { $gte: today, $lt: tomorrow },
          },
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
            totalPaid: { $sum: "$amountPaid" },
            totalDue: { $sum: "$amountDue" },
            paidCount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] } },
            pendingCount: { $sum: { $cond: [{ $in: ["$paymentStatus", ["pending", "partial"]] }, 1, 0] } },
          },
        },
      ]),
    ]);

    // Heavy data — only fetched on full load (not during polling)
    let monthlyDermCount = 0, monthlyCosmoCount = 0;
    let totalDermCount = 0, totalCosmoCount = 0;
    let totalPatients = 0;
    let inventoryStats: any[] = [], lowStockItems: any[] = [], expiringCount = 0;

    if (!lite) {
      const [
        _monthlyDerm,
        _monthlyCosmo,
        _totalDerm,
        _totalCosmo,
        _totalPatients,
        _inventoryStats,
        _lowStockItems,
        _expiringCount,
      ] = await Promise.all([
        ConsultationDermatology.countDocuments({ doctorId, consultationDate: { $gte: firstDayOfMonth } }),
        ConsultationCosmetology.countDocuments({ doctorId, consultationDate: { $gte: firstDayOfMonth } }),
        ConsultationDermatology.countDocuments({ doctorId }),
        ConsultationCosmetology.countDocuments({ doctorId }),
        Patient.countDocuments({ clinicId: clinicObjectId }),
        InventoryItem.aggregate([
          { $match: { clinicId: clinicId } },
          {
            $group: {
              _id: null,
              totalItems: { $sum: 1 },
              totalValue: { $sum: { $multiply: ["$currentStock", "$costPrice"] } },
              lowStockCount: { $sum: { $cond: [{ $lte: ["$currentStock", "$minStockLevel"] }, 1, 0] } },
              outOfStockCount: { $sum: { $cond: [{ $eq: ["$currentStock", 0] }, 1, 0] } },
            },
          },
        ]),
        InventoryItem.find({
          clinicId: clinicId,
          $expr: { $lte: ["$currentStock", "$minStockLevel"] },
        })
          .select("name itemCode currentStock minStockLevel unit status")
          .sort({ currentStock: 1 })
          .limit(5)
          .lean(),
        InventoryItem.countDocuments({
          clinicId: clinicId,
          expiryDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), $gte: new Date() },
        }),
      ]);

      monthlyDermCount = _monthlyDerm;
      monthlyCosmoCount = _monthlyCosmo;
      totalDermCount = _totalDerm;
      totalCosmoCount = _totalCosmo;
      totalPatients = _totalPatients;
      inventoryStats = _inventoryStats;
      lowStockItems = _lowStockItems;
      expiringCount = _expiringCount;
    }

    // Process consultation data
    const dailyUsed = dailyDermCount + dailyCosmoCount;
    const monthlyUsed = monthlyDermCount + monthlyCosmoCount;
    const totalConsultations = totalDermCount + totalCosmoCount;

    const todayVisits = [
      ...todayDermVisits.map((visit: any) => ({
        id: visit._id.toString(),
        patientName: visit.patientInfo.name,
        visitType: "dermatology" as const,
        time: new Date(visit.consultationDate).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: visit.status,
      })),
      ...todayCosmoVisits.map((visit: any) => ({
        id: visit._id.toString(),
        patientName: visit.patientInfo.name,
        visitType: "cosmetology" as const,
        time: new Date(visit.consultationDate).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: visit.status,
      })),
    ].sort((a, b) => b.time.localeCompare(a.time));

    // Process appointment stats
    const appointmentStatsMap = appointmentStats.reduce((acc: any, curr: any) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      success: true,
      data: {
        usage: {
          dailyUsed,
          dailyLimit: DAILY_LIMIT,
          dailyRemaining: Math.max(0, DAILY_LIMIT - dailyUsed),
          monthlyUsed,
          monthlyLimit: MONTHLY_LIMIT,
          monthlyRemaining: Math.max(0, MONTHLY_LIMIT - monthlyUsed),
          totalConsultations,
          totalPatients,
        },
        todayVisits,
        appointments: {
          list: todayAppointments,
          stats: {
            total: todayAppointments.length,
            scheduled: appointmentStatsMap["scheduled"] || 0,
            confirmed: appointmentStatsMap["confirmed"] || 0,
            completed: appointmentStatsMap["completed"] || 0,
            cancelled: appointmentStatsMap["cancelled"] || 0,
            "checked-in": appointmentStatsMap["checked-in"] || 0,
            "in-progress": appointmentStatsMap["in-progress"] || 0,
            "no-show": appointmentStatsMap["no-show"] || 0,
          },
        },
        pharmacy: {
          totalItems: inventoryStats[0]?.totalItems || 0,
          totalValue: inventoryStats[0]?.totalValue || 0,
          lowStockCount: inventoryStats[0]?.lowStockCount || 0,
          outOfStockCount: inventoryStats[0]?.outOfStockCount || 0,
          expiringCount,
          lowStockItems,
        },
        sales: todaySalesStats[0] || {
          totalSales: 0,
          totalRevenue: 0,
          totalPaid: 0,
          totalDue: 0,
          paidCount: 0,
          pendingCount: 0,
        },
      },
    });
  } catch (error: any) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch dashboard data",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
