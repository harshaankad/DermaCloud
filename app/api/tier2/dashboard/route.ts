import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import Patient from "@/models/Patient";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";

// Usage limits for Tier 2
const DAILY_LIMIT = 20;
const MONTHLY_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    // Verify user is Tier 2
    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        {
          success: false,
          message: "This endpoint is only for Tier 2 users",
        },
        { status: 403 }
      );
    }

    await connectDB();

    // Get usage stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get clinic ID from user
    const clinicId = authUser.clinicId;

    if (!clinicId) {
      return NextResponse.json(
        {
          success: false,
          message: "Clinic not found for this user",
        },
        { status: 400 }
      );
    }

    // Count consultations for today and this month
    const [
      dailyDermCount,
      dailyCosmoCount,
      monthlyDermCount,
      monthlyCosmoCount,
      totalDermCount,
      totalCosmoCount,
      totalPatients,
      todayDermVisits,
      todayCosmoVisits,
    ] = await Promise.all([
      // Daily counts
      ConsultationDermatology.countDocuments({
        doctorId: authUser.userId,
        consultationDate: { $gte: today },
      }),
      ConsultationCosmetology.countDocuments({
        doctorId: authUser.userId,
        consultationDate: { $gte: today },
      }),

      // Monthly counts
      ConsultationDermatology.countDocuments({
        doctorId: authUser.userId,
        consultationDate: { $gte: firstDayOfMonth },
      }),
      ConsultationCosmetology.countDocuments({
        doctorId: authUser.userId,
        consultationDate: { $gte: firstDayOfMonth },
      }),

      // Total counts
      ConsultationDermatology.countDocuments({
        doctorId: authUser.userId,
      }),
      ConsultationCosmetology.countDocuments({
        doctorId: authUser.userId,
      }),

      // Total patients in clinic
      Patient.countDocuments({
        clinicId: clinicId,
      }),

      // Today's dermatology visits
      ConsultationDermatology.find({
        doctorId: authUser.userId,
        consultationDate: { $gte: today },
      })
        .select("patientInfo consultationDate status")
        .sort({ consultationDate: -1 })
        .limit(10),

      // Today's cosmetology visits
      ConsultationCosmetology.find({
        doctorId: authUser.userId,
        consultationDate: { $gte: today },
      })
        .select("patientInfo consultationDate status")
        .sort({ consultationDate: -1 })
        .limit(10),
    ]);

    // Combine daily and monthly counts
    const dailyUsed = dailyDermCount + dailyCosmoCount;
    const monthlyUsed = monthlyDermCount + monthlyCosmoCount;
    const totalConsultations = totalDermCount + totalCosmoCount;

    // Format today's visits
    const todayVisits = [
      ...todayDermVisits.map((visit) => ({
        id: visit._id.toString(),
        patientName: visit.patientInfo.name,
        visitType: "dermatology" as const,
        time: new Date(visit.consultationDate).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: visit.status,
      })),
      ...todayCosmoVisits.map((visit) => ({
        id: visit._id.toString(),
        patientName: visit.patientInfo.name,
        visitType: "cosmetology" as const,
        time: new Date(visit.consultationDate).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: visit.status,
      })),
    ].sort((a, b) => {
      // Sort by time (most recent first)
      return b.time.localeCompare(a.time);
    });

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
